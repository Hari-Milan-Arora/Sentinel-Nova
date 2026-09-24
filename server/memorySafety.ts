/**
 * Memory Safety, Classification, and Normalization Engine for Sentinel Nova (Day 5B.3)
 *
 * Implements deterministic guards against persisting credentials/secrets,
 * content normalization, duplicate detection, freshness calculation,
 * and authority hierarchy enforcement.
 */

import { MemorySensitivity, MemorySource, ServerMemory } from './agents/agents/memoryTypes';

// Conservative patterns for obvious restricted secrets and credentials
export const RESTRICTED_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'Google API Key', pattern: /\bAIza[0-9A-Za-z\-_]{20,}\b/ },
  { name: 'OpenAI API Key', pattern: /\bsk-[a-zA-Z0-9]{20,}\b/ },
  { name: 'Generic API Key', pattern: /\b(?:api[_-]?key|apikey)\s*(?:[:=]|\bis\b|\bwas\b)\s*["']?[a-zA-Z0-9_\-]{16,}["']?/i },
  { name: 'Bearer Token', pattern: /\bbearer\s+[a-zA-Z0-9_\-\.]{20,}\b/i },
  { name: 'Bearer Token Declaration', pattern: /\b(?:bearer[_-]?token)\s*(?:[:=]|\bis\b)\s*["']?[a-zA-Z0-9_\-\.]{20,}["']?/i },
  { name: 'Google OAuth Access Token', pattern: /\bya29\.[0-9A-Za-z\-_]{20,}\b/ },
  { name: 'GitHub Token', pattern: /\bgh[pousr]_[a-zA-Z0-9]{36,}\b/ },
  { name: 'Slack Token', pattern: /\bxox[baprs]-[0-9a-zA-Z]{10,}\b/ },
  { name: 'OAuth Access Token Declaration', pattern: /\b(?:oauth[_-]?token|access[_-]?token|id[_-]?token)\s*(?:[:=]|\bis\b)\s*["']?[a-zA-Z0-9_\-\.]{20,}["']?/i },
  { name: 'Private Key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Session Cookie / Token', pattern: /\bsentinel_session\b/i },
  { name: 'Generic Cookie or Session ID', pattern: /\b(?:cookie|set[_-]?cookie|session[_-]?id|sessionid|connect\.sid)\s*(?:[:=]|\bis\b)\s*["']?[a-zA-Z0-9_\-\.=; ]{8,}["']?/i },
  { name: 'Password Declaration', pattern: /\b(password|passwd|pwd|passcode)\s*[:=]\s*["']?[^\s"']{4,}["']?/i },
  { name: 'Password Phrase', pattern: /\b(?:my\s+)?(password|passcode)\s+(?:is|was)\s+["']?[^\s"']{4,}["']?/i },
  { name: 'Secret Key Declaration', pattern: /\b(secret_key|client_secret|auth_token)\s*[:=]\s*["']?[^\s"']{8,}["']?/i },
  { name: 'Credit Card Number', pattern: /\b(?:\d{4}[ -]?){3}\d{4}\b/ },
  { name: 'Amex Credit Card Number', pattern: /\b(?:\d{4}[ -]\d{6}[ -]\d{5})\b/ },
];

/**
 * Strips/redacts known restricted patterns (API keys, passwords, tokens)
 * before any data can be passed to untrusted reasoning models.
 */
export function maskRestrictedContent(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let sanitized = text;
  for (const { pattern } of RESTRICTED_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    sanitized = sanitized.replace(new RegExp(pattern.source, flags), '[REDACTED_SECRET]');
  }
  return sanitized;
}

/**
 * Normalizes memory content:
 * - Trims leading/trailing whitespace
 * - Collapses consecutive whitespace to a single space
 * - Removes non-printable control characters
 * - Enforces 1000 character maximum
 */
export function normalizeMemoryContent(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // remove control chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
}

/**
 * Normalizes text for duplicate comparison (lowercase, trimmed, strip punctuation).
 */
export function normalizeForComparison(text: string): string {
  return normalizeMemoryContent(text)
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Conservative deterministic safety classifier for memory content.
 * Flags restricted credentials and secrets that must NEVER be persisted.
 */
export function classifySensitivity(content: string): {
  sensitivity: MemorySensitivity;
  isRestricted: boolean;
  reason?: string;
} {
  const normalized = normalizeMemoryContent(content);

  for (const { name, pattern } of RESTRICTED_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        sensitivity: 'restricted',
        isRestricted: true,
        reason: `Restricted content detected (${name}). Secrets and credentials cannot be persisted.`,
      };
    }
  }

  // Check for sensitive personal patterns (financial, medical, credentials)
  const sensitiveIndicators = [
    /\b(salary|income|ssn|social security|passport|bank account|routing number)\b/i,
    /\b(medical condition|diagnosis|prescription|confidential)\b/i,
  ];

  for (const pattern of sensitiveIndicators) {
    if (pattern.test(normalized)) {
      return {
        sensitivity: 'sensitive',
        isRestricted: false,
        reason: 'Sensitive personal or financial context. Requires user confirmation.',
      };
    }
  }

  return {
    sensitivity: 'normal',
    isRestricted: false,
  };
}

/**
 * Quick check if content contains restricted patterns.
 */
export function isRestrictedContent(content: string): boolean {
  return classifySensitivity(content).isRestricted;
}

/**
 * Authority level hierarchy:
 * 1. user_confirmed (weight 4 - highest authority)
 * 2. user_explicit (weight 3)
 * 3. system_derived (weight 2)
 * 4. agent_inferred (weight 1 - lowest authority)
 */
export function getAuthorityRank(source: MemorySource): number {
  switch (source) {
    case 'user_confirmed':
      return 4;
    case 'user_explicit':
      return 3;
    case 'system_derived':
      return 2;
    case 'agent_inferred':
      return 1;
    default:
      return 0;
  }
}

/**
 * Checks whether an incoming memory source has sufficient authority to overwrite an existing memory.
 * Rule: Lower authority source CANNOT overwrite higher authority source.
 */
export function canOverwriteAuthority(
  existingSource: MemorySource,
  incomingSource: MemorySource
): boolean {
  return getAuthorityRank(incomingSource) >= getAuthorityRank(existingSource);
}

/**
 * Computes Jaccard word similarity between two texts.
 */
export function calculateWordSimilarity(textA: string, textB: string): number {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'i', 'my', 'that']);
  const tokensA = new Set(
    normalizeForComparison(textA)
      .split(' ')
      .filter(w => w.length > 1 && !stopWords.has(w))
  );
  const tokensB = new Set(
    normalizeForComparison(textB)
      .split(' ')
      .filter(w => w.length > 1 && !stopWords.has(w))
  );

  if (tokensA.size === 0 || tokensB.size === 0) {
    return normalizeForComparison(textA) === normalizeForComparison(textB) ? 1.0 : 0.0;
  }

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0.0;
}

/**
 * Detects whether new content duplicates an existing active memory.
 */
export function detectDuplicate(
  newContent: string,
  newType: string,
  existingMemories: ServerMemory[]
): { isDuplicate: boolean; duplicateMemory?: ServerMemory; matchType?: 'exact' | 'near' } {
  const normNew = normalizeForComparison(newContent);
  if (!normNew) return { isDuplicate: false };

  for (const existing of existingMemories) {
    if (existing.status !== 'active') continue;

    const normExisting = normalizeForComparison(existing.content);

    // Exact normalized text match
    if (normNew === normExisting) {
      return { isDuplicate: true, duplicateMemory: existing, matchType: 'exact' };
    }

    // Near duplicate on same memory type with >= 85% word overlap
    if (existing.type === newType) {
      const similarity = calculateWordSimilarity(newContent, existing.content);
      if (similarity >= 0.85) {
        return { isDuplicate: true, duplicateMemory: existing, matchType: 'near' };
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Calculates a deterministic freshness score [0.0 - 1.0] for a memory.
 * - Expired temporary memories score 0.0
 * - Recent memories (< 7 days) score 1.0
 * - Decays over 30d, 90d
 * - Critical user_confirmed / user_explicit preferences are anchored with a 0.80 minimum floor.
 */
export function calculateFreshnessScore(
  memory: {
    createdAt: string;
    updatedAt: string;
    expiresAt?: string | null;
    importance: string;
    source: string;
  },
  referenceTime?: string
): number {
  const now = referenceTime ? new Date(referenceTime).getTime() : Date.now();

  // Check explicit expiration
  if (memory.expiresAt) {
    const expTime = new Date(memory.expiresAt).getTime();
    if (!isNaN(expTime) && expTime <= now) {
      return 0.0; // Expired
    }
  }

  const timestampStr = memory.updatedAt || memory.createdAt;
  const memTime = new Date(timestampStr).getTime();
  if (isNaN(memTime)) return 0.5;

  const ageMs = Math.max(0, now - memTime);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  let freshness: number;
  if (ageDays <= 7) {
    freshness = 1.0;
  } else if (ageDays <= 30) {
    // 1.0 -> 0.85
    freshness = 1.0 - ((ageDays - 7) / 23) * 0.15;
  } else if (ageDays <= 90) {
    // 0.85 -> 0.65
    freshness = 0.85 - ((ageDays - 30) / 60) * 0.20;
  } else {
    // 0.65 -> 0.45
    freshness = Math.max(0.45, 0.65 - ((ageDays - 90) / 180) * 0.20);
  }

  // Critical/high explicit preferences decay very slowly
  const isHighAuthority = memory.source === 'user_confirmed' || memory.source === 'user_explicit';
  const isHighImportance = memory.importance === 'critical' || memory.importance === 'high';

  if (isHighAuthority && isHighImportance) {
    freshness = Math.max(freshness, 0.80);
  }

  return Math.min(1.0, Math.max(0.0, Number(freshness.toFixed(3))));
}
