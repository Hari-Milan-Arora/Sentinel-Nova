/**
 * Tool Registry for Sentinel Nova Multi-Agent Runtime (Day 5C.1)
 *
 * Responsibilities:
 * - Register authorized tools
 * - Reject duplicate tool IDs (DuplicateToolRegistrationError)
 * - Deterministic listing and capability indexing
 * - Expose immutable defensive copies of tool metadata
 * - Maintain zero user-specific or mutable state
 */

import { BaseTool } from './baseTool';
import { ToolMetadata } from './types';
import { DuplicateToolRegistrationError, ToolNotFoundError } from './errors';

export class ToolRegistry {
  private readonly tools: Map<string, BaseTool> = new Map();

  /**
   * Registers a tool.
   * Throws DuplicateToolRegistrationError if a tool with the same ID is already registered.
   */
  public register(tool: BaseTool): void {
    if (!tool || typeof tool !== 'object') {
      throw new Error('Invalid tool instance: Tool must be an object.');
    }

    const metadata = tool.metadata;
    if (!metadata || !metadata.id || typeof metadata.id !== 'string' || !metadata.id.trim()) {
      throw new Error('Invalid tool metadata: id is required and must be a non-empty string.');
    }

    const toolId = metadata.id.trim();

    if (this.tools.has(toolId)) {
      throw new DuplicateToolRegistrationError(toolId);
    }

    // Freeze metadata defensively to prevent external mutations
    Object.freeze(metadata);
    if (metadata.capabilities) {
      Object.freeze(metadata.capabilities);
    }

    this.tools.set(toolId, tool);
  }

  /**
   * Unregisters a tool by ID. Returns true if tool was removed, false otherwise.
   */
  public unregister(toolId: string): boolean {
    if (!toolId || typeof toolId !== 'string') return false;
    return this.tools.delete(toolId.trim());
  }

  /**
   * Checks if a tool with the given ID exists.
   */
  public has(toolId: string): boolean {
    if (!toolId || typeof toolId !== 'string') return false;
    return this.tools.has(toolId.trim());
  }

  /**
   * Retrieves a tool by ID, or undefined if not found.
   */
  public get(toolId: string): BaseTool | undefined {
    if (!toolId || typeof toolId !== 'string') return undefined;
    return this.tools.get(toolId.trim());
  }

  /**
   * Retrieves a tool by ID or throws ToolNotFoundError.
   */
  public getOrThrow(toolId: string): BaseTool {
    const tool = this.get(toolId);
    if (!tool) {
      throw new ToolNotFoundError(toolId);
    }
    return tool;
  }

  /**
   * Lists all registered tools deterministically sorted by ID.
   * Returns immutable, defensive copies of ToolMetadata.
   */
  public list(): ToolMetadata[] {
    const sorted = Array.from(this.tools.values())
      .map(tool => this.cloneMetadata(tool.metadata))
      .sort((a, b) => a.id.localeCompare(b.id));

    return Object.freeze(sorted) as ToolMetadata[];
  }

  /**
   * Finds all tools declaring a specific capability string, deterministically sorted.
   * Note: Capabilities are discovery metadata, NOT authorization credentials.
   */
  public findByCapability(capability: string): ToolMetadata[] {
    if (!capability || typeof capability !== 'string') return [];
    const target = capability.trim().toLowerCase();

    const matches = Array.from(this.tools.values())
      .filter(tool =>
        tool.metadata.capabilities &&
        tool.metadata.capabilities.some(c => c.toLowerCase() === target)
      )
      .map(tool => this.cloneMetadata(tool.metadata))
      .sort((a, b) => a.id.localeCompare(b.id));

    return Object.freeze(matches) as ToolMetadata[];
  }

  /**
   * Returns the count of registered tools.
   */
  public size(): number {
    return this.tools.size;
  }

  /**
   * Clears all registered tools (used primarily for test isolation).
   */
  public clear(): void {
    this.tools.clear();
  }

  /**
   * Defensive deep clone of metadata to guarantee immutability.
   */
  private cloneMetadata(meta: ToolMetadata): ToolMetadata {
    return Object.freeze({
      id: meta.id,
      name: meta.name,
      description: meta.description,
      version: meta.version,
      category: meta.category,
      riskLevel: meta.riskLevel,
      requiresConfirmation: meta.requiresConfirmation,
      capabilities: Object.freeze([...meta.capabilities]),
      inputSchema: meta.inputSchema ? Object.freeze({ ...meta.inputSchema }) : undefined,
      outputDescription: meta.outputDescription,
    });
  }
}

export const toolRegistry = new ToolRegistry();
