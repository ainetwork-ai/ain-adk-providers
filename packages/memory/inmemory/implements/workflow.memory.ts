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
    const existing = this.workflows.get(workflowId);
    if (existing) {
      const updated = { ...existing, ...updates, workflowId };

      // userId가 변경된 경우 인덱스 업데이트
      if (updates.userId !== undefined && existing.userId !== updates.userId) {
        // 기존 userId 인덱스에서 제거
        if (existing.userId) {
          this.userWorkflowIndex.get(existing.userId)?.delete(workflowId);
        }
        // 새 userId 인덱스에 추가
        if (updates.userId) {
          if (!this.userWorkflowIndex.has(updates.userId)) {
            this.userWorkflowIndex.set(updates.userId, new Set());
          }
          this.userWorkflowIndex.get(updates.userId)?.add(workflowId);
        }
      }

      this.workflows.set(workflowId, updated);
    }
  }

  public async deleteWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      this.workflows.delete(workflowId);

      // 인덱스에서도 제거
      if (workflow.userId) {
        this.userWorkflowIndex.get(workflow.userId)?.delete(workflowId);
      }
    }
  }

  public async listWorkflows(userId?: string): Promise<Workflow[]> {
    if (userId) {
      const workflowIds = this.userWorkflowIndex.get(userId);
      if (!workflowIds) {
        return [];
      }

      const workflows: Workflow[] = [];
      for (const workflowId of workflowIds) {
        const workflow = this.workflows.get(workflowId);
        if (workflow) {
          workflows.push(workflow);
        }
      }
      return workflows;
    }

    return Array.from(this.workflows.values());
  }
}
