/**
 * Multi-Agent Runtime Index for Sentinel Nova (Day 5A)
 */

import { agentRegistry } from './AgentRegistry';
import { ContextInspectorAgent } from './agents/ContextInspectorAgent';
import { PlannerAgent, plannerAgent } from './agents/PlannerAgent';
import { PrioritizerAgent, prioritizerAgent } from './agents/PrioritizerAgent';
import { MemoryAgent, memoryAgent } from './agents/MemoryAgent';
import { SchedulerAgent, schedulerAgent } from './agents/SchedulerAgent';
import { ReviewerAgent, reviewerAgent } from './agents/ReviewerAgent';

// Export types
export * from './types';
export * from './agents/plannerTypes';
export * from './agents/prioritizerTypes';
export * from './agents/memoryTypes';
export * from './agents/schedulerTypes';

// Export core abstractions
export * from './Agent';
export * from './AgentResult';
export * from './AgentContext';
export * from './AgentRegistry';
export * from './NovaOrchestrator';

// Export agents & engines
export * from './agents/ContextInspectorAgent';
export * from './agents/PlannerAgent';
export * from './agents/PlanningEngine';
export * from './services/PlanningReasoningService';
export * from './agents/PrioritizerAgent';
export * from './agents/PrioritizationEngine';
export * from './services/PrioritizationReasoningService';
export * from './agents/MemoryAgent';
export * from './agents/MemoryRetrievalEngine';
export * from './services/MemoryReasoningService';
export * from './agents/SchedulerAgent';
export * from './agents/SchedulingEngine';
export * from './services/SchedulingReasoningService';

// Export Gemini Circular LLM Router modules
export * from './services/geminiTypes';
export * from './services/geminiModels';
export * from './services/geminiRateLimiter';
export * from './services/GeminiModelRouter';

// Export Safe Tool Manager and Reviewer (Day 5C)
export * from './tools/types';
export * from './tools/errors';
export * from './tools/baseTool';
export * from './tools/ToolRegistry';
export * from './tools/tools/TaskTools';
export * from './tools/ToolManager';
export * from './agents/ReviewerAgent';

// Export Recovery Agent & Engine (Day 5C.3)
export * from './agents/recoveryTypes';
export * from './agents/RecoveryEngine';
export * from './services/RecoveryReasoningService';
export * from './agents/RecoveryAgent';

// Export Chief of Staff Workflow (Day 5C.5)
export * from './workflow';

// Initialize default registry with Day 5A, Day 5B, and Day 5C agents
const contextInspectorAgent = new ContextInspectorAgent();
if (!agentRegistry.has(contextInspectorAgent.id)) {
  agentRegistry.register(contextInspectorAgent);
}

if (!agentRegistry.has(plannerAgent.id)) {
  agentRegistry.register(plannerAgent);
}

if (!agentRegistry.has(prioritizerAgent.id)) {
  agentRegistry.register(prioritizerAgent);
}

if (!agentRegistry.has(memoryAgent.id)) {
  agentRegistry.register(memoryAgent);
}

if (!agentRegistry.has(schedulerAgent.id)) {
  agentRegistry.register(schedulerAgent);
}

if (!agentRegistry.has(reviewerAgent.id)) {
  agentRegistry.register(reviewerAgent);
}

import { recoveryAgent } from './agents/RecoveryAgent';
if (!agentRegistry.has(recoveryAgent.id)) {
  agentRegistry.register(recoveryAgent);
}





