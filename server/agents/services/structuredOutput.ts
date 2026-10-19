/** Parse a model response as a strict JSON object with an exact top-level contract. */
export function parseStrictJsonObject(
  rawText: string,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[]
): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(rawText);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.some((key) => !allowedKeys.includes(key))) return null;
    if (requiredKeys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) return null;
    return record;
  } catch {
    return null;
  }
}

export function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

export function isBoundedIndexArray(value: unknown, maxIndex: number, maxItems = 10): value is number[] {
  return Array.isArray(value) && value.length <= maxItems && value.every(
    (item) => Number.isInteger(item) && item >= 0 && item < maxIndex
  );
}

export function isBoundedStringArray(value: unknown, maxItems = 3, maxLength = 200): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every(
    (item) => typeof item === 'string' && item.trim().length > 0 && item.length <= maxLength
  );
}
