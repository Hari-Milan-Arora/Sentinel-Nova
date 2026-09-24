/**
 * Agent Registry for Sentinel Nova Multi-Agent Runtime (Day 5A)
 *
 * Single source of truth for available agent definitions and capabilities.
 * Enforces registration uniqueness and validation.
 */

import { BaseAgent } from './Agent';
import { AgentCapability, AgentId, AgentMetadata } from './types';

export class AgentRegistry {
  private agents = new Map<AgentId, BaseAgent>();

  /**
   * Register an agent instance.
   * Throws if an agent with the same ID is already registered.
   */
  public register(agent: BaseAgent): void {
    if (!agent) {
      throw new Error('Cannot register null or undefined agent.');
    }
    if (!agent.id || typeof agent.id !== 'string' || !agent.id.trim()) {
      throw new Error('Agent must provide a valid non-empty id string.');
    }
    if (!agent.name || typeof agent.name !== 'string') {
      throw new Error(`Agent '${agent.id}' must provide a valid name.`);
    }
    if (!agent.version || typeof agent.version !== 'string') {
      throw new Error(`Agent '${agent.id}' must provide a valid version.`);
    }
    if (!Array.isArray(agent.capabilities)) {
      throw new Error(`Agent '${agent.id}' must declare capabilities array.`);
    }
    if (typeof agent.execute !== 'function') {
      throw new Error(`Agent '${agent.id}' must implement execute() method.`);
    }

    if (this.agents.has(agent.id)) {
      throw new Error(`DuplicateAgentRegistrationError: Agent with ID '${agent.id}' is already registered.`);
    }

    this.agents.set(agent.id, agent);
  }

  /**
   * Unregister an agent by ID. Returns true if removed, false if not found.
   */
  public unregister(agentId: AgentId): boolean {
    return this.agents.delete(agentId);
  }

  /**
   * Retrieve an agent by ID.
   */
  public get(agentId: AgentId): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Check if an agent ID is registered.
   */
  public has(agentId: AgentId): boolean {
    return this.agents.has(agentId);
  }

  /**
   * List metadata for all registered agents.
   */
  public list(): AgentMetadata[] {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      version: agent.version,
      capabilities: [...agent.capabilities],
      timeoutMs: agent.timeoutMs,
    }));
  }

  /**
   * Discover agents that declare a specific capability.
   */
  public findByCapability(capability: AgentCapability): BaseAgent[] {
    return Array.from(this.agents.values()).filter(agent =>
      agent.capabilities.includes(capability)
    );
  }

  /**
   * Reset the registry (useful for test suites).
   */
  public clear(): void {
    this.agents.clear();
  }
}

export const agentRegistry = new AgentRegistry();
