/**
 * Types for Gemini Circular LLM Callback Router
 */

export type ModelAvailabilityStatus = 'available' | 'cooldown' | 'rate_limited' | 'unavailable';

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
}
