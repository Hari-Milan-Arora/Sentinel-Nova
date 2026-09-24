/**
 * Model Pool Configuration & Validation for Gemini Circular LLM Callback Router
 */

export const DEFAULT_GEMINI_MODEL_POOL: string[] = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.5-pro',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash-8b',
  'gemini-2.5-flash-lite',
  'gemini-2.0-pro-exp-02-05',
];

export const DEFAULT_MAX_RPM_PER_MODEL = 4;
export const DEFAULT_MAX_MODEL_ATTEMPTS = 10;
export const DEFAULT_ROUTER_TIMEOUT_MS = 3000;
export const DEFAULT_COOLDOWN_MS = 30000;

/**
 * Safely parses the GEMINI_MODEL_POOL environment variable or returns default.
 * Handles empty strings, comma separations, and trims.
 */
export function getGeminiModelPool(): string[] {
  const envPool = process.env.GEMINI_MODEL_POOL;
  if (!envPool || typeof envPool !== 'string') {
    return [...DEFAULT_GEMINI_MODEL_POOL];
  }

  const parsed = envPool
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);

  return parsed.length > 0 ? parsed : [...DEFAULT_GEMINI_MODEL_POOL];
}

/**
 * Safely reads numeric router configuration from environment variables with defaults.
 */
export function getRouterConfig() {
  const maxRpm = Math.max(
    1,
    parseInt(process.env.GEMINI_MAX_RPM_PER_MODEL || '', 10) || DEFAULT_MAX_RPM_PER_MODEL
  );
  const maxAttempts = Math.max(
    1,
    parseInt(process.env.GEMINI_MAX_MODEL_ATTEMPTS || '', 10) || DEFAULT_MAX_MODEL_ATTEMPTS
  );
  const timeoutMs = Math.max(
    500,
    parseInt(process.env.GEMINI_ROUTER_TIMEOUT_MS || '', 10) || DEFAULT_ROUTER_TIMEOUT_MS
  );

  return {
    maxRpm,
    maxAttempts,
    timeoutMs,
  };
}
