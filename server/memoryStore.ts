/**
 * Persistent Memory Store for Sentinel Nova (Day 5B.3)
 *
 * Implements durable, user-isolated memory persistence backed by data/memories.json.
 * Enforces strict ownership, schema validation, restricted content rejection,
 * duplicate detection, authority ranking, freshness decay, and bounded retrieval.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  ServerMemory,
  MemoryInput,
  MemoryRetrieveOptions,
  ScoredMemoryItem,
  MemoryType,
  MemoryImportance,
  MemoryStatus,
  MemorySource,
  MemorySensitivity,
} from './agents/agents/memoryTypes';
import {
  normalizeMemoryContent,
  classifySensitivity,
  detectDuplicate,
  canOverwriteAuthority,
  calculateFreshnessScore,
  calculateWordSimilarity,
  normalizeForComparison,
} from './memorySafety';

const DATA_DIR = path.join(process.cwd(), 'data');
const MEMORIES_FILE = path.join(DATA_DIR, 'memories.json');

// In-memory cache keyed by userId
let memoriesCache: Record<string, ServerMemory[]> | null = null;

export const VALID_MEMORY_TYPES: MemoryType[] = [
  'preference',
  'goal_context',
  'project_context',
  'task_pattern',
  'working_style',
  'scheduling_preference',
  'constraint',
  'decision',
  'instruction',
  'fact',
  'temporary_context',
  'execution_context',
  'learned_pattern',
];

export const VALID_IMPORTANCE_LEVELS: MemoryImportance[] = ['low', 'medium', 'high', 'critical'];
export const VALID_STATUSES: MemoryStatus[] = ['active', 'archived', 'superseded', 'deleted'];
export const VALID_SOURCES: MemorySource[] = [
  'user_confirmed',
  'user_explicit',
  'system_derived',
  'agent_proposed',
  'agent_inferred',
];
export const VALID_SENSITIVITIES: MemorySensitivity[] = ['normal', 'sensitive', 'restricted'];

/**
 * Resets the in-memory cache. Useful for test suites.
 */
export function clearMemoriesCache(): void {
  memoriesCache = null;
}

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory exists
  }
}

async function loadMemories(): Promise<Record<string, ServerMemory[]>> {
  if (memoriesCache) return memoriesCache;
  await ensureDataDir();
  try {
    const raw = await fs.readFile(MEMORIES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      memoriesCache = parsed;
      return memoriesCache!;
    }
    memoriesCache = {};
    return memoriesCache;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      memoriesCache = {};
      return memoriesCache;
    }
    console.error('Error reading memories file, initializing empty cache:', err);
    memoriesCache = {};
    return memoriesCache;
  }
}

async function persistMemories(): Promise<void> {
  await ensureDataDir();
  const dataToSave = memoriesCache || {};
  await fs.writeFile(MEMORIES_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
}

/**
 * Validates memory input server-side.
 */
export function validateMemoryInput(
  input: any,
  isUpdate = false
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Memory data must be an object.'] };
  }

  // Content validation
  if (!isUpdate || input.content !== undefined) {
    if (!input.content || typeof input.content !== 'string' || !input.content.trim()) {
      errors.push('Memory content is required and cannot be empty.');
    } else {
      if (input.content.length > 1000) {
        errors.push('Memory content exceeds the maximum limit of 1000 characters.');
      }
      const normalized = normalizeMemoryContent(input.content);
      if (normalized.length === 0) {
        errors.push('Memory content cannot be only whitespace or control characters.');
      }

      // Safety check: reject restricted data (API keys, passwords, bearer tokens, card numbers)
      const { isRestricted, reason } = classifySensitivity(normalized);
      if (isRestricted) {
        errors.push(reason || 'Restricted content (secrets, passwords, API keys) cannot be stored.');
      }
    }
  }

  // Type validation
  if (!isUpdate || input.type !== undefined) {
    if (!input.type || !VALID_MEMORY_TYPES.includes(input.type)) {
      errors.push(`Invalid memory type. Allowed types: ${VALID_MEMORY_TYPES.join(', ')}.`);
    }
  }

  // Importance validation
  if (input.importance !== undefined) {
    if (!VALID_IMPORTANCE_LEVELS.includes(input.importance)) {
      errors.push(`Invalid importance level. Allowed: ${VALID_IMPORTANCE_LEVELS.join(', ')}.`);
    }
  }

  // Confidence validation
  if (input.confidence !== undefined) {
    const conf = Number(input.confidence);
    if (isNaN(conf) || conf < 0.0 || conf > 1.0) {
      errors.push('Confidence must be a finite number between 0.0 and 1.0.');
    }
  }

  // Status validation
  if (input.status !== undefined) {
    if (!VALID_STATUSES.includes(input.status)) {
      errors.push(`Invalid status. Allowed: ${VALID_STATUSES.join(', ')}.`);
    }
  }

  // Source validation
  if (input.source !== undefined) {
    if (!VALID_SOURCES.includes(input.source)) {
      errors.push(`Invalid memory source. Allowed: ${VALID_SOURCES.join(', ')}.`);
    }
  }

  // Sensitivity validation
  if (input.sensitivity !== undefined) {
    if (!VALID_SENSITIVITIES.includes(input.sensitivity)) {
      errors.push(`Invalid sensitivity. Allowed: ${VALID_SENSITIVITIES.join(', ')}.`);
    }
    if (input.sensitivity === 'restricted') {
      errors.push('Restricted sensitivity items must never be submitted for persistence.');
    }
  }

  // sourceReference length
  if (input.sourceReference !== undefined && input.sourceReference !== null) {
    if (typeof input.sourceReference !== 'string' || input.sourceReference.length > 200) {
      errors.push('sourceReference must be a string with maximum 200 characters.');
    }
  }

  // Expiration timestamp validation
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    const time = new Date(input.expiresAt).getTime();
    if (isNaN(time)) {
      errors.push('expiresAt must be a valid ISO 8601 timestamp.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Retrieves all memories for an authenticated user with optional filtering.
 * Enforces strict user isolation.
 */
export async function getMemoriesByUser(
  userId: string,
  filter?: { status?: MemoryStatus; type?: MemoryType }
): Promise<ServerMemory[]> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Authenticated userId is required to access memories.');
  }

  const store = await loadMemories();
  const userMemories = store[userId] || [];

  return userMemories.filter(m => {
    // Only return items belonging to this user
    if (m.userId !== userId) return false;
    // Exclude deleted memories by default unless explicitly filtered for 'deleted'
    if (!filter?.status && m.status === 'deleted') return false;
    if (filter?.status && m.status !== filter.status) return false;
    if (filter?.type && m.type !== filter.type) return false;
    return true;
  });
}

/**
 * Retrieves a single memory by ID with strict ownership validation.
 */
export async function getMemoryById(
  userId: string,
  memoryId: string
): Promise<ServerMemory | null> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Authenticated userId is required to access memories.');
  }
  if (!memoryId || typeof memoryId !== 'string') {
    return null;
  }

  const store = await loadMemories();
  const userMemories = store[userId] || [];
  const memory = userMemories.find(m => m.id === memoryId);

  if (!memory || memory.userId !== userId || memory.status === 'deleted') {
    return null;
  }

  return memory;
}

/**
 * Creates a new memory with server-generated ID, timestamps, ownership,
 * and duplicate detection.
 */
export async function createMemory(
  userId: string,
  input: MemoryInput
): Promise<ServerMemory> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Authenticated userId is required to create a memory.');
  }

  // Strict trust boundary: client-supplied foreign userId is rejected
  if (input.userId && input.userId !== userId) {
    throw new Error('Access Denied: Specifying a foreign userId is strictly forbidden.');
  }

  const validation = validateMemoryInput(input, false);
  if (!validation.valid) {
    throw new Error(`Memory validation failed: ${validation.errors.join(' ')}`);
  }

  const store = await loadMemories();
  if (!store[userId]) {
    store[userId] = [];
  }

  const normalizedContent = normalizeMemoryContent(input.content!);
  const type: MemoryType = input.type || 'preference';

  // Check for duplicates in active memories
  const duplicateCheck = detectDuplicate(normalizedContent, type, store[userId]);
  if (duplicateCheck.isDuplicate && duplicateCheck.duplicateMemory) {
    const existing = duplicateCheck.duplicateMemory;

    // If incoming source has lower authority than existing, preserve existing without modification
    const incomingSource: MemorySource = input.source || 'user_explicit';
    if (!canOverwriteAuthority(existing.source, incomingSource)) {
      return existing;
    }

    // Refresh timestamps and return existing without creating another entry
    existing.updatedAt = new Date().toISOString();
    existing.confidence = Math.max(existing.confidence, input.confidence ?? 0.8);
    await persistMemories();
    return existing;
  }

  // Derive sensitivity if not explicitly provided
  const sensitivityCheck = classifySensitivity(normalizedContent);
  const sensitivity: MemorySensitivity = input.sensitivity || sensitivityCheck.sensitivity;

  const now = new Date().toISOString();
  const explicit =
    input.explicit !== undefined
      ? Boolean(input.explicit)
      : input.source === 'user_confirmed' || input.source === 'user_explicit' || !input.source;

  const tags = Array.isArray(input.tags)
    ? input.tags
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .slice(0, 10)
        .map(t => t.trim().toLowerCase())
    : [];

  const newMemory: ServerMemory = {
    id: `mem_${crypto.randomUUID()}`,
    userId,
    type,
    content: normalizedContent,
    importance: input.importance || 'medium',
    confidence: Math.min(1.0, Math.max(0.0, Number((input.confidence ?? 0.85).toFixed(2)))),
    status: input.status || 'active',
    source: input.source || 'user_explicit',
    sourceReference: input.sourceReference ? input.sourceReference.slice(0, 200) : 'user_chat',
    sensitivity,
    tags,
    explicit,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
    expiresAt: input.expiresAt || null,
    accessCount: 0,
    metadata: input.metadata || {},
  };

  store[userId].unshift(newMemory);
  await persistMemories();
  return newMemory;
}

/**
 * Updates an existing memory with strict ownership and authority validation.
 */
export async function updateMemory(
  userId: string,
  memoryId: string,
  patch: Partial<MemoryInput>
): Promise<ServerMemory | null> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Authenticated userId is required to update a memory.');
  }

  // Strict trust boundary: client-supplied foreign userId is rejected
  if (patch.userId && patch.userId !== userId) {
    throw new Error('Access Denied: Specifying a foreign userId is strictly forbidden.');
  }

  const validation = validateMemoryInput(patch, true);
  if (!validation.valid) {
    throw new Error(`Memory update validation failed: ${validation.errors.join(' ')}`);
  }

  const store = await loadMemories();
  const userMemories = store[userId] || [];
  const index = userMemories.findIndex(m => m.id === memoryId && m.userId === userId);

  if (index === -1) {
    return null;
  }

  const existing = userMemories[index];

  // Deleted memories cannot be updated
  if (existing.status === 'deleted') {
    return null;
  }

  // Authority check: lower authority cannot silently overwrite higher authority
  const incomingSource = patch.source || existing.source;
  if (!canOverwriteAuthority(existing.source, incomingSource)) {
    throw new Error(
      `Authority conflict: '${incomingSource}' cannot overwrite authoritative '${existing.source}' memory.`
    );
  }

  let updatedContent = existing.content;
  if (patch.content !== undefined) {
    updatedContent = normalizeMemoryContent(patch.content);
  }

  const now = new Date().toISOString();
  const updatedTags = Array.isArray(patch.tags)
    ? patch.tags
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .slice(0, 10)
        .map(t => t.trim().toLowerCase())
    : existing.tags || [];

  const updatedMemory: ServerMemory = {
    ...existing,
    type: patch.type !== undefined ? patch.type : existing.type,
    content: updatedContent,
    importance: patch.importance !== undefined ? patch.importance : existing.importance,
    confidence:
      patch.confidence !== undefined
        ? Math.min(1.0, Math.max(0.0, Number(patch.confidence.toFixed(2))))
        : existing.confidence,
    status: patch.status !== undefined ? patch.status : existing.status,
    source: patch.source !== undefined ? patch.source : existing.source,
    sourceReference:
      patch.sourceReference !== undefined
        ? patch.sourceReference.slice(0, 200)
        : existing.sourceReference,
    sensitivity: patch.sensitivity !== undefined ? patch.sensitivity : existing.sensitivity,
    tags: updatedTags,
    explicit: patch.explicit !== undefined ? Boolean(patch.explicit) : existing.explicit ?? true,
    expiresAt: patch.expiresAt !== undefined ? patch.expiresAt : existing.expiresAt,
    updatedAt: now,
    metadata: patch.metadata ? { ...(existing.metadata || {}), ...patch.metadata } : existing.metadata,
  };

  userMemories[index] = updatedMemory;
  await persistMemories();
  return updatedMemory;
}

/**
 * Archives a memory (status = 'archived').
 */
export async function archiveMemory(
  userId: string,
  memoryId: string
): Promise<ServerMemory | null> {
  return updateMemory(userId, memoryId, { status: 'archived' });
}

/**
 * Marks a memory as superseded by a newer or more authoritative memory.
 */
export async function supersedeMemory(
  userId: string,
  memoryId: string,
  supersedingId?: string
): Promise<ServerMemory | null> {
  return updateMemory(userId, memoryId, {
    status: 'superseded',
    metadata: supersedingId ? { supersededBy: supersedingId } : undefined,
  });
}

/**
 * Deletes a memory. Supports soft deletion (status = 'deleted') or hard removal.
 * Enforces ownership before deletion.
 */
export async function deleteMemory(
  userId: string,
  memoryId: string,
  hardDelete = false
): Promise<boolean> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Authenticated userId is required to delete a memory.');
  }

  const store = await loadMemories();
  const userMemories = store[userId] || [];
  const index = userMemories.findIndex(m => m.id === memoryId && m.userId === userId);

  if (index === -1) {
    return false;
  }

  if (hardDelete) {
    userMemories.splice(index, 1);
  } else {
    userMemories[index].status = 'deleted';
    userMemories[index].updatedAt = new Date().toISOString();
  }

  await persistMemories();
  return true;
}

/**
 * Deterministic Memory Retrieval Engine
 *
 * Scoring formula:
 * relevance = (queryMatch * 0.45 + typeBoost) + (importanceWeight * 0.25) + (confidence * 0.15) + (freshness * 0.15)
 * Clamped to [0.0, 1.0].
 * Bounds return size to limit (default 5, hard max 10).
 * Updates accessCount and lastAccessedAt.
 */
export async function retrieveRelevantMemories(
  userId: string,
  options: MemoryRetrieveOptions = {}
): Promise<{ memories: ScoredMemoryItem[]; totalMatched: number }> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Authenticated userId is required for memory retrieval.');
  }

  const store = await loadMemories();
  const userMemories = store[userId] || [];

  const limit = Math.min(10, Math.max(1, options.limit ?? 5));
  const rawQuery = typeof options.query === 'string' ? options.query.slice(0, 500) : '';
  const query = rawQuery.trim();
  const queryLower = normalizeForComparison(query);
  const referenceTime = options.referenceTime || new Date().toISOString();

  const candidates: ScoredMemoryItem[] = [];

  for (const memory of userMemories) {
    // 1. User ownership check
    if (memory.userId !== userId) continue;

    // 2. Status filtering: never return deleted; exclude archived unless requested; exclude superseded unless requested
    if (memory.status === 'deleted') continue;
    if (memory.status === 'archived' && !options.includeArchived) continue;
    if (memory.status === 'superseded' && !options.includeSuperseded) continue;

    // 3. Type filtering
    if (options.types && options.types.length > 0 && !options.types.includes(memory.type)) {
      continue;
    }

    // 4. Tag filtering
    if (options.tags && options.tags.length > 0) {
      const memTags = Array.isArray(memory.tags) ? memory.tags.map(t => t.toLowerCase()) : [];
      const hasMatchingTag = options.tags.some(t => memTags.includes(t.toLowerCase()));
      if (!hasMatchingTag) continue;
    }

    // 5. Freshness calculation: exclude expired memories
    const freshnessScore = calculateFreshnessScore(memory, referenceTime);
    if (freshnessScore <= 0.0) {
      continue; // Expired temporary context
    }

    // 5. Confidence filtering
    if (options.minConfidence !== undefined && memory.confidence < options.minConfidence) {
      continue;
    }

    // 6. Query matching score [0.0 - 1.0]
    let queryMatchScore = 0.6; // Baseline relevance when no specific query provided
    let matchReason = 'General working context';

    if (queryLower.length > 0) {
      const memoryContentLower = normalizeForComparison(memory.content);

      // Exact substring match
      if (memoryContentLower.includes(queryLower)) {
        queryMatchScore = 1.0;
        matchReason = 'Direct phrase match';
      } else {
        const similarity = calculateWordSimilarity(query, memory.content);
        queryMatchScore = Math.min(1.0, similarity * 1.25);
        matchReason = queryMatchScore > 0.4 ? 'Semantic term overlap' : 'Contextual candidate';
      }
    }

    // Type / Context boost
    let typeBoost = 0.0;
    if (queryLower.includes('schedule') || queryLower.includes('time') || queryLower.includes('hour')) {
      if (memory.type === 'scheduling_preference' || memory.type === 'working_style') {
        typeBoost = 0.15;
      }
    } else if (queryLower.includes('goal') && memory.type === 'goal_context') {
      typeBoost = 0.15;
    } else if (queryLower.includes('project') && memory.type === 'project_context') {
      typeBoost = 0.15;
    } else if (queryLower.includes('preference') && memory.type === 'preference') {
      typeBoost = 0.15;
    }

    // Importance weighting
    let importanceWeight = 0.5;
    switch (memory.importance) {
      case 'critical':
        importanceWeight = 1.0;
        break;
      case 'high':
        importanceWeight = 0.85;
        break;
      case 'medium':
        importanceWeight = 0.65;
        break;
      case 'low':
        importanceWeight = 0.45;
        break;
    }

    // Combined bounded relevance score
    const rawRelevance =
      queryMatchScore * 0.45 +
      typeBoost +
      importanceWeight * 0.25 +
      memory.confidence * 0.15 +
      freshnessScore * 0.15;

    const safeRelevance = isNaN(rawRelevance) || !isFinite(rawRelevance) ? 0.0 : rawRelevance;
    const relevanceScore = Math.min(1.0, Math.max(0.0, Number(safeRelevance.toFixed(3))));

    candidates.push({
      ...memory,
      relevanceScore,
      queryMatchScore: Number(queryMatchScore.toFixed(3)),
      freshnessScore,
      matchReason,
    });
  }

  // Sort descending by relevance score, tie-breaking by freshness, importance, and recency
  candidates.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    if (b.freshnessScore !== a.freshnessScore) {
      return b.freshnessScore - a.freshnessScore;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const matchedSlice = candidates.slice(0, limit);

  // Update accessCount and lastAccessedAt for returned memories asynchronously
  if (matchedSlice.length > 0) {
    const now = new Date().toISOString();
    for (const scored of matchedSlice) {
      const memInStore = userMemories.find(m => m.id === scored.id);
      if (memInStore) {
        memInStore.accessCount = (memInStore.accessCount || 0) + 1;
        memInStore.lastAccessedAt = now;
      }
    }
    void persistMemories().catch(err => {
      console.warn('Asynchronous memory access timestamp persistence failed:', err);
    });
  }

  return {
    memories: matchedSlice,
    totalMatched: candidates.length,
  };
}
