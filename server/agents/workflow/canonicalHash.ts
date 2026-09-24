/**
 * Canonical JSON hashing for parameter binding verification (Day 5C.5)
 *
 * Ensures that any modification to action parameters after safety review
 * invalidates the confirmation binding.
 */

import * as crypto from 'crypto';

/**
 * Deterministically serializes any JSON-compatible value by sorting object keys alphabetically.
 */
export function canonicalJsonStringify(val: unknown): string {
  if (val === null || val === undefined) {
    return 'null';
  }
  if (typeof val === 'boolean' || typeof val === 'number') {
    return JSON.stringify(val);
  }
  if (typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val as Record<string, unknown>).sort();
    const entries = keys.map((k) => {
      const v = (val as Record<string, unknown>)[k];
      return JSON.stringify(k) + ':' + canonicalJsonStringify(v);
    });
    return '{' + entries.join(',') + '}';
  }
  return JSON.stringify(String(val));
}

/**
 * Computes SHA-256 hash of canonical JSON-serialized parameters.
 */
export function computeParameterHash(parameters: Record<string, unknown>): string {
  const canonical = canonicalJsonStringify(parameters || {});
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
