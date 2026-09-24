/**
 * Agent Context Builder for Sentinel Nova Multi-Agent Runtime (Day 5A)
 *
 * Constructs a scoped, strongly typed context from existing domain services
 * without duplicating database logic. Enforces strict user isolation.
 */

import { AgentContext, ContextScopeOptions } from './types';
import { getPlanningProfile } from '../profileStore';
import { getTasksByUser, getActiveTasksByUser } from '../taskStore';
import { getGoalsByUser } from '../goalStore';
import { getProjectsByUser } from '../projectStore';
import { getUserCalendarStatus, getCachedEvents } from '../calendarStore';
import { calculateAvailability } from '../../src/utils/availabilityEngine';
import { retrieveRelevantMemories } from '../memoryStore';
import { SanitizedMemory } from './agents/memoryTypes';

export interface BuildContextParams {
  userId: string;
  requestId: string;
  executionId: string;
  userRequest: string;
  scope?: ContextScopeOptions;
  parameters?: Record<string, unknown>;
}

/**
 * Builds an AgentContext for an authenticated user.
 * Scopes data retrieval to the requested domain dimensions.
 * Access tokens and internal credentials are NEVER included in AgentContext.
 */
export async function buildAgentContext(params: BuildContextParams): Promise<AgentContext> {
  const { userId, requestId, executionId, userRequest, scope, parameters } = params;

  if (!userId || typeof userId !== 'string') {
    throw new Error('AgentContext construction failed: Valid authenticated userId is required.');
  }

  // Determine scope defaults (default to lightweight contextual profile and tasks if scope not specified)
  const shouldIncludeProfile = scope?.includeProfile !== false;
  const shouldIncludeTasks = scope?.includeTasks !== false;
  const shouldIncludeGoals = scope?.includeGoals ?? true;
  const shouldIncludeProjects = scope?.includeProjects ?? true;
  const shouldIncludeCalendar = scope?.includeCalendar ?? false;
  const shouldIncludeAvailability = scope?.includeAvailability ?? false;

  // Retrieve Planning Profile
  let profile = null;
  let timezone = 'UTC';
  if (shouldIncludeProfile || shouldIncludeAvailability) {
    profile = await getPlanningProfile(userId);
    if (profile?.timezone) {
      timezone = profile.timezone;
    }
  }

  // Retrieve Tasks (scoped to active tasks for planning efficiency when requested)
  let tasks = undefined;
  if (shouldIncludeTasks || shouldIncludeAvailability) {
    if (scope?.activeTasksOnly) {
      tasks = await getActiveTasksByUser(userId);
    } else {
      tasks = await getTasksByUser(userId);
    }
  }

  // Retrieve Goals
  let goals = undefined;
  if (shouldIncludeGoals) {
    goals = await getGoalsByUser(userId);
  }

  // Retrieve Projects
  let projects = undefined;
  if (shouldIncludeProjects) {
    projects = await getProjectsByUser(userId);
  }

  // Retrieve Calendar Status and cached events
  let calendarStatus = null;
  let calendarEvents = undefined;
  if (shouldIncludeCalendar || shouldIncludeAvailability) {
    calendarStatus = getUserCalendarStatus(userId);
    calendarEvents = getCachedEvents(userId);
  }

  // Compute Availability if requested
  let availability = null;
  if (shouldIncludeAvailability && profile) {
    const targetDate = scope?.dateStr || new Date().toISOString().split('T')[0];
    const selectedCalIds = calendarStatus?.selectedCalendarIds || [];
    availability = calculateAvailability({
      dateStr: targetDate,
      profile,
      events: calendarEvents || [],
      selectedCalendarIds: selectedCalIds,
      tasks: tasks || [],
    });
  }

  // Retrieve Memory Context if requested
  let memoryContext: { relevantMemories: SanitizedMemory[]; retrievalQuery?: string } | undefined = undefined;
  if (scope?.includeMemory) {
    try {
      const query = scope.memoryQuery || userRequest;
      const memResult = await retrieveRelevantMemories(userId, { query, limit: 5 });
      const sanitized: SanitizedMemory[] = memResult.memories.map(m => ({
        id: m.id,
        type: m.type,
        content: m.content,
        importance: m.importance,
        confidence: m.confidence,
        source: m.source,
        freshnessScore: m.freshnessScore,
        relevanceScore: m.relevanceScore,
      }));
      memoryContext = {
        relevantMemories: sanitized,
        retrievalQuery: query,
      };
    } catch (memErr) {
      console.warn('Memory context retrieval failed:', memErr);
    }
  }

  return {
    userId,
    requestId,
    executionId,
    userRequest,
    timestamp: new Date().toISOString(),
    timezone,
    profile,
    goals,
    projects,
    tasks,
    calendarStatus,
    calendarEvents,
    availability,
    memoryContext,
    priorResults: [],
    parameters: parameters || {},
  };
}
