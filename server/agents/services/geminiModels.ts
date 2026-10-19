/**
 * Model Pool Configuration & Validation for Gemini Circular LLM Callback Router
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const DEFAULT_GEMINI_MODEL_POOL: string[] = [DEFAULT_GEMINI_MODEL];
export const DEFAULT_MAX_RPM_PER_MODEL = 4;
export const DEFAULT_MAX_MODEL_ATTEMPTS = 2;
export const DEFAULT_ROUTER_TIMEOUT_MS = 7000;
export const DEFAULT_COOLDOWN_MS = 30000;

const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function isValidGeminiModelId(value: string): boolean {
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
  const configured = [primary, ...fallbacks];
  const invalid = configured.filter((model) => !isValidGeminiModelId(model));

  if (invalid.length > 0) {
    throw new Error('Invalid GEMINI_MODEL or GEMINI_FALLBACK_MODELS entry.');
  }
  return [...new Set(configured)];
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
    ? Math.max(1000, Math.min(20000, parsedTimeout))
    : DEFAULT_ROUTER_TIMEOUT_MS;

  return {
    maxRpm,
    maxAttempts,
    timeoutMs,
  };
}
