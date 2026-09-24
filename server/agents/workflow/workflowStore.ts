/**
 * Chief of Staff Workflow Transient Store (Day 5C.5)
 *
 * Responsibilities:
 * - In-memory cache of active Chief of Staff workflows
 * - Enforces strict user isolation (no cross-user workflow access)
 * - Bounded storage capacity with automatic TTL eviction
 * - Zero storage of sensitive credentials, tokens, or cookies
 */

import { ChiefOfStaffWorkflowContext, CONFIRMATION_TTL_MS } from './types';

const MAX_STORED_WORKFLOWS = 500;
const WORKFLOW_RETENTION_MS = 60 * 60 * 1000; // 1 hour retention

export class WorkflowStore {
  private readonly workflows: Map<string, ChiefOfStaffWorkflowContext> = new Map();

  /**
   * Saves or updates a workflow in the store.
   */
  public save(workflow: ChiefOfStaffWorkflowContext): void {
    if (!workflow || !workflow.workflowId || !workflow.userId) {
      throw new Error('Invalid workflow: workflowId and userId are required.');
    }

    this.evictExpiredWorkflows();

    // Bounded capacity check
    if (this.workflows.size >= MAX_STORED_WORKFLOWS) {
      // Evict oldest workflow
      const oldestKey = this.workflows.keys().next().value;
      if (oldestKey) {
        this.workflows.delete(oldestKey);
      }
    }

    // Defensive clone to prevent external mutation
    const copy: ChiefOfStaffWorkflowContext = JSON.parse(JSON.stringify(workflow));
    this.workflows.set(workflow.workflowId, copy);
  }

  /**
   * Retrieves a workflow by ID for the specified authenticated user.
   * Enforces strict user boundary: returns null if the workflow does not belong to userId.
   */
  public get(workflowId: string, userId: string): ChiefOfStaffWorkflowContext | null {
    if (!workflowId || !userId) return null;

    const wf = this.workflows.get(workflowId);
    if (!wf) return null;

    if (wf.userId !== userId) {
      // Cross-user access denied
      return null;
    }

    // Defensive clone
    return JSON.parse(JSON.stringify(wf));
  }

  /**
   * Deletes a workflow by ID if owned by userId.
   */
  public delete(workflowId: string, userId: string): boolean {
    if (!workflowId || !userId) return false;

    const wf = this.workflows.get(workflowId);
    if (!wf || wf.userId !== userId) return false;

    return this.workflows.delete(workflowId);
  }

  /**
   * Clears all stored workflows (used primarily for test isolation).
   */
  public clear(): void {
    this.workflows.clear();
  }

  /**
   * Count of currently stored workflows.
   */
  public size(): number {
    return this.workflows.size;
  }

  /**
   * Evicts workflows exceeding the retention window.
   */
  private evictExpiredWorkflows(): void {
    const now = Date.now();
    for (const [id, wf] of this.workflows.entries()) {
      if (now - wf.createdAt > WORKFLOW_RETENTION_MS) {
        this.workflows.delete(id);
      }
    }
  }
}

export const workflowStore = new WorkflowStore();
