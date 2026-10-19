/**
 * Types for Gemini Circular LLM Callback Router
 */

import type { GoogleGenAI } from '@google/genai';

export type ModelAvailabilityStatus = 'available' | 'cooldown' | 'rate_limited' | 'unavailable';
export type GeminiFailureCategory =
  | 'missing_configuration'
  | 'authentication'
  | 'invalid_request'
  | 'unsupported_model'
  | 'rate_limit'
  | 'quota_exhausted'
  | 'provider_transient'
  | 'timeout'
  | 'malformed_response'
  | 'safety_refusal'
  | 'oversized_context'
  | 'all_models_unavailable'
  | 'unknown';

export interface ModelCandidate {
  name: string;
  status: ModelAvailabilityStatus;
  cooldownUntil?: number;
  failureCount: number;
  successCount: number;
}

export interface RouterCallConfig {
  temperature?: number;
  responseMimeType?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  responseJsonSchema?: unknown;
}

export interface RouterCallRequest {
  contents: string | any;
  systemInstruction?: string;
  config?: RouterCallConfig;
}

export interface RouterCallResult {
  ok: boolean;
  text?: string;
  modelUsed?: string;
  attempts: number;
  exhausted?: boolean;
  reason?: string;
  error?: string;
  failureCategory?: GeminiFailureCategory;
  retryCount?: number;
  latencyMs?: number;
}

export interface RateLimiterReservation {
  allowed: boolean;
  waitMs: number;
}

export interface RouterOptions {
  modelPool?: string[];
  maxRpmPerModel?: number;
  maxModelAttempts?: number;
  routerTimeoutMs?: number;
  apiKey?: string;
  client?: GoogleGenAI;
}
