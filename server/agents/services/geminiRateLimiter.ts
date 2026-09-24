/**
 * Rate Limiter for Gemini Circular LLM Callback Router
 * Enforces rolling 60-second window RPM limits (default 4 RPM) and model cooldowns.
 * Safe against race conditions, negative durations, and unclosed timers.
 */

import { RateLimiterReservation } from './geminiTypes';

export class GeminiRateLimiter {
  private reservations: Map<string, number[]> = new Map();
  private cooldowns: Map<string, number> = new Map();
  private unavailableModels: Set<string> = new Set();
  private readonly maxRpm: number;
  private readonly windowMs: number = 60000;

  constructor(maxRpm: number = 4) {
    this.maxRpm = Math.max(1, maxRpm);
  }

  /**
   * Checks if a model is available to accept a request right now.
   * Cleans stale timestamps and verifies capacity and cooldown.
   */
  public canReserve(model: string, now: number = Date.now()): RateLimiterReservation {
    if (!model || typeof model !== 'string') {
      return { allowed: false, waitMs: Infinity };
    }

    if (this.unavailableModels.has(model)) {
      return { allowed: false, waitMs: Infinity };
    }

    // 1. Check cooldown
    const cooldownUntil = this.cooldowns.get(model);
    if (typeof cooldownUntil === 'number' && cooldownUntil > now) {
      const waitMs = Math.max(0, cooldownUntil - now);
      return { allowed: false, waitMs };
    }

    // 2. Check rolling window reservations
    let timestamps = this.reservations.get(model);
    if (!timestamps) {
      timestamps = [];
      this.reservations.set(model, timestamps);
    }

    // Prune entries outside the 60-second window
    const cutoff = now - this.windowMs;
    timestamps = timestamps.filter((t) => typeof t === 'number' && !isNaN(t) && t > cutoff);
    this.reservations.set(model, timestamps);

    if (timestamps.length < this.maxRpm) {
      return { allowed: true, waitMs: 0 };
    }

    // Calculate wait time until oldest reservation expires
    const oldest = timestamps[0] || now;
    const waitMs = Math.max(0, oldest + this.windowMs - now);
    return { allowed: false, waitMs };
  }

  /**
   * Reserves a slot for the model if allowed. Returns true on success, false if limited.
   */
  public reserve(model: string, now: number = Date.now()): boolean {
    const status = this.canReserve(model, now);
    if (!status.allowed) {
      return false;
    }

    let timestamps = this.reservations.get(model);
    if (!timestamps) {
      timestamps = [];
      this.reservations.set(model, timestamps);
    }

    timestamps.push(now);
    return true;
  }

  /**
   * Places a model on temporary cooldown (e.g. after a 429 quota exhaustion).
   */
  public recordCooldown(model: string, durationMs: number = 30000, now: number = Date.now()): void {
    if (!model) return;
    const safeDuration = Math.max(1000, durationMs);
    this.cooldowns.set(model, now + safeDuration);
  }

  /**
   * Permanently or persistently marks a model as unavailable (e.g. 404 not found or deprecated).
   */
  public markUnavailable(model: string): void {
    if (!model) return;
    this.unavailableModels.add(model);
  }

  /**
   * Checks whether a model is under active cooldown.
   */
  public isUnderCooldown(model: string, now: number = Date.now()): boolean {
    const until = this.cooldowns.get(model);
    return typeof until === 'number' && until > now;
  }

  /**
   * Computes the shortest wait time until at least one candidate model is eligible.
   */
  public getNextAvailableWait(models: string[], now: number = Date.now()): number {
    if (!Array.isArray(models) || models.length === 0) {
      return Infinity;
    }

    let minWait = Infinity;
    for (const model of models) {
      if (this.unavailableModels.has(model)) continue;
      const res = this.canReserve(model, now);
      if (res.allowed) return 0;
      if (res.waitMs < minWait) {
        minWait = res.waitMs;
      }
    }

    return minWait;
  }

  /**
   * Resets all reservations and cooldowns (for test isolation).
   */
  public reset(): void {
    this.reservations.clear();
    this.cooldowns.clear();
    this.unavailableModels.clear();
  }
}

export const geminiRateLimiter = new GeminiRateLimiter();
