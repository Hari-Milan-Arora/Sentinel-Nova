/**
 * Gemini Circular LLM Callback Router
 *
 * Implements resilient multi-model routing across Gemini models with:
 * - Circular pointer rotation (0 → 1 → ... → N-1 → 0)
 * - Safe against empty pools (no % 0)
 * - Strictly bounded retry attempts (MAX_MODEL_ATTEMPTS)
 * - Request deadline enforcement (REQUEST_DEADLINE)
 * - Rolling 60-second 4 RPM limiter per model
 * - 429 quota exhaustion cooldown & failover
 * - Structured non-throwing error returns for seamless deterministic fallbacks
 */

import { GoogleGenAI } from '@google/genai';
import {
  GeminiFailureCategory,
  RouterCallRequest,
  RouterCallResult,
  RouterOptions,
} from './geminiTypes';
import {
  getGeminiModelPool,
  getRouterConfig,
  DEFAULT_MAX_RPM_PER_MODEL,
  DEFAULT_MAX_MODEL_ATTEMPTS,
  DEFAULT_ROUTER_TIMEOUT_MS,
  DEFAULT_COOLDOWN_MS,
} from './geminiModels';
import { GeminiRateLimiter } from './geminiRateLimiter';

const MAX_REQUEST_CHARS = 40000;
const MAX_RETRY_AFTER_MS = 10000;

function normalizeApiKey(value: string | undefined): string | undefined {
  const key = value?.trim();
  if (!key || /^(your[-_ ]|replace[-_ ])/i.test(key)) return undefined;
  return key;
}

function getStatus(error: unknown): number | undefined {
  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  const status = Number(candidate?.status ?? candidate?.statusCode ?? candidate?.code);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

function classifyFailure(error: unknown): GeminiFailureCategory {
  const status = getStatus(error);
  const message = String((error as { message?: unknown })?.message ?? error ?? '').toLowerCase();
  if (status === 401 || status === 403 || message.includes('api key not valid')) return 'authentication';
  if (status === 400 || status === 422) return 'invalid_request';
  if (status === 404 || message.includes('model not found') || message.includes('unsupported model')) return 'unsupported_model';
  if (status === 429 || message.includes('resource_exhausted') || message.includes('quota')) {
    return message.includes('quota') || message.includes('resource_exhausted') ? 'quota_exhausted' : 'rate_limit';
  }
  if (status && status >= 500) return 'provider_transient';
  if (message.includes('timeout') || message.includes('timed out') || message.includes('abort')) return 'timeout';
  if (message.includes('safety') || message.includes('blocked')) return 'safety_refusal';
  if (message.includes('fetch failed') || message.includes('econnreset') || message.includes('network')) return 'provider_transient';
  return 'unknown';
}

function readRetryAfterMs(error: unknown): number | undefined {
  const value = error as { headers?: unknown; response?: { headers?: unknown } };
  const headers = value?.headers ?? value?.response?.headers;
  const get = (name: string): string | null => {
    if (headers && typeof (headers as { get?: unknown }).get === 'function') {
      return (headers as { get(key: string): string | null }).get(name);
    }
    if (headers && typeof headers === 'object') {
      const entry = Object.entries(headers as Record<string, unknown>).find(([key]) => key.toLowerCase() === name);
      return entry ? String(entry[1]) : null;
    }
    return null;
  };
  const milliseconds = Number(get('retry-after-ms'));
  if (Number.isFinite(milliseconds) && milliseconds >= 0) return Math.min(milliseconds, MAX_RETRY_AFTER_MS);
  const secondsOrDate = get('retry-after');
  if (!secondsOrDate) return undefined;
  const seconds = Number(secondsOrDate);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const date = Date.parse(secondsOrDate);
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_AFTER_MS);
  return undefined;
}

export class GeminiModelRouter {
  private modelPool: string[];
  private currentIndex: number = 0;
  private maxAttempts: number;
  private defaultTimeoutMs: number;
  private rateLimiter: GeminiRateLimiter;
  private aiClient: GoogleGenAI | null = null;
  private apiKey: string | undefined;

  constructor(options?: RouterOptions) {
    const config = getRouterConfig();
    this.modelPool = options?.modelPool || getGeminiModelPool();
    this.maxAttempts = options?.maxModelAttempts || config.maxAttempts || DEFAULT_MAX_MODEL_ATTEMPTS;
    this.defaultTimeoutMs = options?.routerTimeoutMs || config.timeoutMs || DEFAULT_ROUTER_TIMEOUT_MS;
    this.rateLimiter = new GeminiRateLimiter(options?.maxRpmPerModel ?? config.maxRpm);
    this.apiKey = normalizeApiKey(options?.apiKey ?? process.env.GEMINI_API_KEY);
    this.aiClient = options?.client || null;

    // Construction MUST be non-blocking and safe:
    // No network requests, no model enumeration, no initial API call.
    if (!this.aiClient && this.apiKey) {
      try {
        this.aiClient = new GoogleGenAI({ apiKey: this.apiKey });
      } catch {
        // Keep provider initialization details out of logs; the call boundary
        // returns a sanitized failure category to its caller.
      }
    }
  }

  /**
   * Returns a copy of the current model pool.
   */
  public getModelPool(): string[] {
    return [...this.modelPool];
  }

  /**
   * Sets or overrides the model pool dynamically (safe against empty lists).
   */
  public setModelPool(pool: string[]): void {
    if (!Array.isArray(pool) || pool.length === 0) {
      this.modelPool = [];
      this.currentIndex = 0;
      return;
    }
    this.modelPool = pool.map((m) => m.trim()).filter((m) => m.length > 0);
    this.currentIndex = this.currentIndex % (this.modelPool.length || 1);
  }

  /**
   * Gets the current pointer index.
   */
  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Safely advances the circular pointer without dividing or modulo by 0.
   */
  public advancePointer(): number {
    if (this.modelPool.length === 0) {
      return -1;
    }
    const idx = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.modelPool.length;
    return idx;
  }

  /**
   * Finds the next eligible model starting from current pointer, checking RPM and cooldown.
   */
  private selectNextEligibleModel(now: number = Date.now()): { model: string; index: number } | null {
    const len = this.modelPool.length;
    if (len === 0) return null;

    for (let i = 0; i < len; i++) {
      const candidateIndex = (this.currentIndex + i) % len;
      const candidateModel = this.modelPool[candidateIndex];

      const reservation = this.rateLimiter.canReserve(candidateModel, now);
      if (reservation.allowed) {
        // Reserve slot
        this.rateLimiter.reserve(candidateModel, now);
        // Advance pointer past this model for subsequent calls
        this.currentIndex = (candidateIndex + 1) % len;
        return { model: candidateModel, index: candidateIndex };
      }
    }

    return null;
  }

  /**
   * Invokes Gemini with circular failover, strict attempt bounds, and request deadline.
   * Guaranteed to NEVER throw: returns structured RouterCallResult on any outcome.
   */
  public async generateContent(
    request: RouterCallRequest,
    options?: { timeoutMs?: number; maxAttempts?: number }
  ): Promise<RouterCallResult> {
    const startedAt = Date.now();
    const fail = (failureCategory: GeminiFailureCategory, reason: string, retryCount = 0): RouterCallResult => ({
      ok: false,
      exhausted: true,
      attempts: retryCount,
      retryCount,
      reason,
      error: reason,
      failureCategory,
      latencyMs: Date.now() - startedAt,
    });

    let contents: string;
    try {
      contents = typeof request?.contents === 'string'
        ? request.contents
        : JSON.stringify(request?.contents);
    } catch {
      return fail('invalid_request', 'invalid_request');
    }
    if (typeof contents !== 'string' || contents.trim().length === 0) {
      return fail('invalid_request', 'invalid_request');
    }
    if (contents.length > MAX_REQUEST_CHARS) {
      return fail('oversized_context', 'oversized_context');
    }

    if (this.modelPool.length === 0) {
      return fail('unsupported_model', 'no_compatible_models_available');
    }
    if (!this.apiKey && !this.aiClient) {
      return fail('missing_configuration', 'no_api_key');
    }

    // 1. Guard against missing pool
    // 2. Guard against missing API client/key
    if (!this.aiClient) {
      const runtimeApiKey = normalizeApiKey(process.env.GEMINI_API_KEY);
      if (runtimeApiKey) {
        try {
          this.aiClient = new GoogleGenAI({ apiKey: runtimeApiKey });
        } catch {
        return fail('missing_configuration', 'client_initialization_failed');
        }
      } else {
        return fail('missing_configuration', 'no_api_key');
      }
    }

    const maxAttempts = Math.min(
      this.modelPool.length * 2,
      options?.maxAttempts || this.maxAttempts
    );
    const timeoutMs = options?.timeoutMs || request.config?.timeoutMs || this.defaultTimeoutMs;
    const deadline = Date.now() + timeoutMs;

    let lastFailureCategory: GeminiFailureCategory | undefined;

    // Circular execution loop with strictly bounded attempts and deadline
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const now = Date.now();
      if (now >= deadline) {
      return fail('timeout', 'deadline_exceeded', attempt - 1);
      }

      // Find next eligible candidate model
      const candidate = this.selectNextEligibleModel(now);

      if (!candidate) {
        // All models are currently cooling down or rate-limited
        const minWait = this.rateLimiter.getNextAvailableWait(this.modelPool, now);
        const remainingTime = deadline - now;

        if (minWait === Infinity || remainingTime <= minWait || remainingTime <= 100) {
          const category = lastFailureCategory || 'all_models_unavailable';
          return fail(category, category === 'unsupported_model' ? 'unsupported_model' : 'all_models_unavailable', attempt - 1);
        }

        // Bounded sleep until next model is available or deadline expires
        const sleepMs = Math.min(minWait, remainingTime - 50, MAX_RETRY_AFTER_MS);
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
        continue;
      }

      const selectedModel = candidate.model;

      try {
        // Compute per-attempt remaining timeout
        const perAttemptTimeout = Math.max(1, deadline - Date.now());

        let timeoutHandle: NodeJS.Timeout | null = null;
        const abortController = new AbortController();
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            abortController.abort();
            reject(new Error('Gemini request timed out'));
          }, perAttemptTimeout);
        });

        const apiPromise = this.aiClient.models.generateContent({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: request.systemInstruction,
            responseMimeType: request.config?.responseMimeType,
            responseJsonSchema: request.config?.responseJsonSchema,
            temperature: request.config?.temperature,
            maxOutputTokens: request.config?.maxOutputTokens ?? 512,
            abortSignal: abortController.signal,
            httpOptions: {
              timeout: perAttemptTimeout,
              retryOptions: { attempts: 1 },
            },
          },
        });

        const response = await Promise.race([apiPromise, timeoutPromise]).finally(() => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        });

        const blocked = response?.promptFeedback?.blockReason || response?.candidates?.some(
          (candidate) => String(candidate?.finishReason || '').toUpperCase().includes('SAFETY')
        );
        if (blocked) {
          return {
            ok: false,
            exhausted: true,
            attempts: attempt,
            retryCount: attempt - 1,
            reason: 'safety_refusal',
            error: 'safety_refusal',
            failureCategory: 'safety_refusal',
            modelUsed: selectedModel,
            latencyMs: Date.now() - startedAt,
          };
        }
        const text = response?.text ? response.text.trim() : '';
        if (text) {
          return {
            ok: true,
            text,
            modelUsed: selectedModel,
            attempts: attempt,
            retryCount: attempt - 1,
            latencyMs: Date.now() - startedAt,
          };
        }

        // Empty response: advance to next model
        lastFailureCategory = 'malformed_response';
      } catch (err: any) {
        const failureCategory = classifyFailure(err);
        lastFailureCategory = failureCategory;

        // Check for 429 Quota / Rate Limit
        if (failureCategory === 'rate_limit' || failureCategory === 'quota_exhausted') {
          this.rateLimiter.recordCooldown(
            selectedModel,
            readRetryAfterMs(err) ?? DEFAULT_COOLDOWN_MS
          );
        } else if (failureCategory === 'unsupported_model') {
          // Model unavailable/invalid: mark unavailable so it won't be retried
          this.rateLimiter.markUnavailable(selectedModel);
        } else if (
          failureCategory === 'authentication' ||
          failureCategory === 'invalid_request' ||
          failureCategory === 'safety_refusal' ||
          failureCategory === 'oversized_context'
        ) {
          return fail(failureCategory, failureCategory, attempt);
        } else if (failureCategory !== 'provider_transient' && failureCategory !== 'timeout') {
          return fail(failureCategory, 'provider_error', attempt);
        }

        // Pointer was already advanced during reservation, loop continues to next attempt
      }
    }

    const lastFailure = lastFailureCategory || 'unknown';
    return fail(lastFailure, 'max_attempts_exceeded', maxAttempts);
  }
}

export const geminiModelRouter = new GeminiModelRouter();
