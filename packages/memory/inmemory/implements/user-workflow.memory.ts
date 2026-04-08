import { IUserWorkflowMemory } from "@ainetwork/adk/modules";
import type { UserWorkflow } from "@ainetwork/adk/types/memory";

export class InMemoryUserWorkflow implements IUserWorkflowMemory {
  private workflows: Map<string, UserWorkflow> = new Map();
  private userWorkflowIndex: Map<string, Set<string>> = new Map();

  public async createUserWorkflow(workflow: UserWorkflow): Promise<UserWorkflow> {
    this.workflows.set(workflow.workflowId, workflow);

    if (!this.userWorkflowIndex.has(workflow.userId)) {
      this.userWorkflowIndex.set(workflow.userId, new Set());
    }
    this.userWorkflowIndex.get(workflow.userId)?.add(workflow.workflowId);

    return workflow;
  }

  public async getUserWorkflow(workflowId: string): Promise<UserWorkflow | undefined> {
    return this.workflows.get(workflowId);
  }

  public async updateUserWorkflow(workflowId: string, updates: Partial<UserWorkflow>): Promise<void> {
    if (!updates.userId) {
      throw new Error("userId is required for updateUserWorkflow");
    }

    const existing = this.workflows.get(workflowId);
    if (!existing) {
      throw new Error(`UserWorkflow not found: ${workflowId}`);
    }

    if (existing.userId !== updates.userId) {
      throw new Error("Unauthorized: userId does not match workflow owner");
    }

    const updated = { ...existing, ...updates, workflowId };
    this.workflows.set(workflowId, updated);
  }

  public async deleteUserWorkflow(workflowId: string, userId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (workflow && workflow.userId === userId) {
      this.workflows.delete(workflowId);
      this.userWorkflowIndex.get(userId)?.delete(workflowId);
    }
  }

  public async listUserWorkflows(userId?: string): Promise<UserWorkflow[]> {
    if (userId) {
      const userWorkflowIds = this.userWorkflowIndex.get(userId);
      if (!userWorkflowIds) return [];
      const workflows: UserWorkflow[] = [];
      for (const workflowId of userWorkflowIds) {
        const workflow = this.workflows.get(workflowId);
        if (workflow) {
          workflows.push(workflow);
        }
      }
      return workflows;
    }

    return Array.from(this.workflows.values());
  }

  public async listActiveScheduledWorkflows(): Promise<UserWorkflow[]> {
    const result: UserWorkflow[] = [];
    for (const workflow of this.workflows.values()) {
      if (workflow.active && workflow.schedule) {
        result.push(workflow);
      }
    }
    return result;
  }
}
