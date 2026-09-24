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
import { GeminiRateLimiter, geminiRateLimiter } from './geminiRateLimiter';

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
    this.rateLimiter = options?.maxRpmPerModel
      ? new GeminiRateLimiter(options.maxRpmPerModel)
      : geminiRateLimiter;
    this.apiKey = options?.apiKey || process.env.GEMINI_API_KEY;

    // Construction MUST be non-blocking and safe:
    // No network requests, no model enumeration, no initial API call.
    if (this.apiKey) {
      try {
        this.aiClient = new GoogleGenAI({ apiKey: this.apiKey });
      } catch (err) {
        console.warn('GeminiModelRouter: Client initialization warning:', err);
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
    // 1. Guard against missing pool
    if (this.modelPool.length === 0) {
      return {
        ok: false,
        exhausted: true,
        attempts: 0,
        reason: 'no_compatible_models_available',
        error: 'Model pool is empty',
      };
    }

    // 2. Guard against missing API client/key
    if (!this.aiClient) {
      if (process.env.GEMINI_API_KEY) {
        try {
          this.aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        } catch {
          return {
            ok: false,
            exhausted: true,
            attempts: 0,
            reason: 'client_initialization_failed',
          };
        }
      } else {
        return {
          ok: false,
          exhausted: true,
          attempts: 0,
          reason: 'no_api_key',
        };
      }
    }

    const maxAttempts = Math.min(
      this.modelPool.length * 2,
      options?.maxAttempts || this.maxAttempts
    );
    const timeoutMs = options?.timeoutMs || request.config?.timeoutMs || this.defaultTimeoutMs;
    const deadline = Date.now() + timeoutMs;

    let lastError: string | undefined;

    // Circular execution loop with strictly bounded attempts and deadline
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const now = Date.now();
      if (now >= deadline) {
        return {
          ok: false,
          exhausted: true,
          attempts: attempt - 1,
          reason: 'deadline_exceeded',
          error: 'Request deadline exceeded before completion',
        };
      }

      // Find next eligible candidate model
      const candidate = this.selectNextEligibleModel(now);

      if (!candidate) {
        // All models are currently cooling down or rate-limited
        const minWait = this.rateLimiter.getNextAvailableWait(this.modelPool, now);
        const remainingTime = deadline - now;

        if (minWait === Infinity || remainingTime <= minWait || remainingTime <= 100) {
          return {
            ok: false,
            exhausted: true,
            attempts: attempt - 1,
            reason: 'all_models_unavailable',
            error: lastError || 'All models in pool are rate-limited or in cooldown',
          };
        }

        // Bounded sleep until next model is available or deadline expires
        const sleepMs = Math.min(minWait, remainingTime - 50);
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
        continue;
      }

      const selectedModel = candidate.model;

      try {
        // Compute per-attempt remaining timeout
        const perAttemptTimeout = Math.max(200, deadline - Date.now());

        let timeoutHandle: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`Model ${selectedModel} timed out (${perAttemptTimeout}ms)`));
          }, perAttemptTimeout);
        });

        const contents =
          typeof request.contents === 'string'
            ? request.contents
            : JSON.stringify(request.contents);

        const promptText = request.systemInstruction
          ? `${request.systemInstruction}\n\n${contents}`
          : contents;

        const apiPromise = this.aiClient.models.generateContent({
          model: selectedModel,
          contents: promptText,
          config: request.config
            ? {
                responseMimeType: request.config.responseMimeType,
                temperature: request.config.temperature,
                maxOutputTokens: request.config.maxOutputTokens,
              }
            : undefined,
        });

        const response = await Promise.race([apiPromise, timeoutPromise]).finally(() => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        });

        const text = response?.text ? response.text.trim() : '';
        if (text) {
          return {
            ok: true,
            text,
            modelUsed: selectedModel,
            attempts: attempt,
          };
        }

        // Empty response: advance to next model
        lastError = `Empty response from ${selectedModel}`;
      } catch (err: any) {
        const errorMsg = String(err?.message || err || '');
        lastError = errorMsg;

        // Check for 429 Quota / Rate Limit
        if (
          errorMsg.includes('429') ||
          errorMsg.includes('RESOURCE_EXHAUSTED') ||
          errorMsg.includes('quota')
        ) {
          // Put model on 30s cooldown and rotate immediately to next circular model
          this.rateLimiter.recordCooldown(selectedModel, DEFAULT_COOLDOWN_MS);
        } else if (
          errorMsg.includes('404') ||
          errorMsg.includes('NOT_FOUND') ||
          errorMsg.includes('not found') ||
          errorMsg.includes('deprecated')
        ) {
          // Model unavailable/invalid: mark unavailable so it won't be retried
          this.rateLimiter.markUnavailable(selectedModel);
        }

        // Pointer was already advanced during reservation, loop continues to next attempt
      }
    }

    return {
      ok: false,
      exhausted: true,
      attempts: maxAttempts,
      reason: 'max_attempts_exceeded',
      error: lastError || 'Exhausted maximum model attempts',
    };
  }
}

export const geminiModelRouter = new GeminiModelRouter();
