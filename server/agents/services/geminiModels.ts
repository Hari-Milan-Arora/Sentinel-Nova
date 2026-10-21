/**
 * Model Pool Configuration & Validation for Gemini Circular LLM Callback Router
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_MODEL_POOL: string[] = ['gemini-2.5-flash', 'gemini-3.8-flash'];
export const DEFAULT_MAX_RPM_PER_MODEL = 10;
export const DEFAULT_MAX_MODEL_ATTEMPTS = 3;
export const DEFAULT_ROUTER_TIMEOUT_MS = 15000;
export const DEFAULT_COOLDOWN_MS = 15000;

const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function isValidGeminiModelId(value: string): boolean {
  if (!value || value.includes('falsh')) return false;
  return MODEL_ID_PATTERN.test(value);
}

/**
 * Safely parses the GEMINI_MODEL_POOL environment variable or returns default.
 * Handles empty strings, comma separations, and trims.
 */
export function getGeminiModelPool(): string[] {
  const legacyModels = (process.env.GEMINI_MODEL_POOL || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const primary = (process.env.GEMINI_MODEL || legacyModels[0] || DEFAULT_GEMINI_MODEL).trim();
  const configuredFallbacks = process.env.GEMINI_FALLBACK_MODELS;
  const fallbacks = (configuredFallbacks === undefined ? legacyModels.slice(1) : configuredFallbacks.split(','))
    .map((m) => m.trim())
    .filter(Boolean);
  const configured = [primary, ...fallbacks, 'gemini-2.5-flash', 'gemini-3.8-flash'];
  const valid = configured.filter((model) => isValidGeminiModelId(model));

  return [...new Set(valid)];
}

/**
 * Safely reads numeric router configuration from environment variables with defaults.
 */
export function getRouterConfig() {
  const parsedRpm = Number.parseInt(process.env.GEMINI_MAX_RPM_PER_MODEL || '', 10);
  const maxRpm = Number.isFinite(parsedRpm)
    ? Math.max(1, Math.min(60, parsedRpm))
    : DEFAULT_MAX_RPM_PER_MODEL;
  const parsedAttempts = Number.parseInt(process.env.GEMINI_MAX_MODEL_ATTEMPTS || '', 10);
  const maxAttempts = Number.isFinite(parsedAttempts)
    ? Math.max(1, Math.min(3, parsedAttempts))
    : DEFAULT_MAX_MODEL_ATTEMPTS;
  const parsedTimeout = Number.parseInt(process.env.GEMINI_ROUTER_TIMEOUT_MS || '', 10);
  const timeoutMs = Number.isFinite(parsedTimeout)
    ? Math.max(12000, Math.min(30000, parsedTimeout))
    : DEFAULT_ROUTER_TIMEOUT_MS;

  return {
    maxRpm,
    maxAttempts,
    timeoutMs,
  };
}
