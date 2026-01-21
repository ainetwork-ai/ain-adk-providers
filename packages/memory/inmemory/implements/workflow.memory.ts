import { IWorkflowMemory } from "@ainetwork/adk/modules";
import type { Workflow } from "@ainetwork/adk/types/memory";

export class InMemoryWorkflow implements IWorkflowMemory {
  private workflows: Map<string, Workflow> = new Map();
  private userWorkflowIndex: Map<string, Set<string>> = new Map();

  public async createWorkflow(workflow: Workflow): Promise<Workflow> {
    this.workflows.set(workflow.workflowId, workflow);

    if (workflow.userId) {
      if (!this.userWorkflowIndex.has(workflow.userId)) {
        this.userWorkflowIndex.set(workflow.userId, new Set());
      }
      this.userWorkflowIndex.get(workflow.userId)?.add(workflow.workflowId);
    }

    return workflow;
  }

  public async getWorkflow(workflowId: string): Promise<Workflow | undefined> {
    return this.workflows.get(workflowId);
  }

  public async updateWorkflow(workflowId: string, updates: Partial<Workflow>): Promise<void> {
    if (!updates.userId) {
      throw new Error("userId is required for updateWorkflow");
    }

    const existing = this.workflows.get(workflowId);
    if (!existing) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (existing.userId !== updates.userId) {
      throw new Error("Unauthorized: userId does not match workflow owner");
    }

    const updated = { ...existing, ...updates, workflowId };
    this.workflows.set(workflowId, updated);
  }

  public async deleteWorkflow(workflowId: string, userId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (workflow && workflow.userId === userId) {
      this.workflows.delete(workflowId);
      this.userWorkflowIndex.get(userId)?.delete(workflowId);
    }
  }

  public async listWorkflows(userId?: string): Promise<Workflow[]> {
    const workflows: Workflow[] = [];

    // 템플릿 workflow (userId가 없는 것)은 항상 포함
    for (const workflow of this.workflows.values()) {
      if (!workflow.userId) {
        workflows.push(workflow);
      }
    }

    // userId가 있으면 해당 유저 소유 workflow도 포함
    if (userId) {
      const userWorkflowIds = this.userWorkflowIndex.get(userId);
      if (userWorkflowIds) {
        for (const workflowId of userWorkflowIds) {
          const workflow = this.workflows.get(workflowId);
          if (workflow) {
            workflows.push(workflow);
          }
        }
      }
    }

    return workflows;
  }
}
