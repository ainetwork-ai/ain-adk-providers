import type { IWorkflowMemory } from "@ainetwork/adk/modules";
import type { Workflow } from "@ainetwork/adk/types/memory";
import { WorkflowModel } from "../models/workflow.model";

export type ExecuteWithRetryFn = <T>(
  operation: () => Promise<T>,
  operationName?: string
) => Promise<T>;

export type GetOperationTimeoutFn = () => number;

export class MongoDBWorkflow implements IWorkflowMemory {
  private executeWithRetry: ExecuteWithRetryFn;
  private getOperationTimeout: GetOperationTimeoutFn;

  constructor(
    executeWithRetry: ExecuteWithRetryFn,
    getOperationTimeout: GetOperationTimeoutFn
  ) {
    this.executeWithRetry = executeWithRetry;
    this.getOperationTimeout = getOperationTimeout;
  }

  public async createWorkflow(workflow: Workflow): Promise<Workflow> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const created = await WorkflowModel.create(workflow);
      return created.toObject() as Workflow;
    }, "createWorkflow()");
  }

  public async getWorkflow(workflowId: string): Promise<Workflow | undefined> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const workflow = await WorkflowModel.findOne({
        workflowId
      }).maxTimeMS(timeout).lean<Workflow>();
      return workflow || undefined;
    }, "getWorkflow()");
  }

  public async updateWorkflow(workflowId: string, updates: Partial<Workflow>): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await WorkflowModel.updateOne(
        { workflowId },
        { $set: updates }
      ).maxTimeMS(timeout);
    }, "updateWorkflow()");
  }

  public async deleteWorkflow(workflowId: string): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await WorkflowModel.deleteOne({ workflowId }).maxTimeMS(timeout);
    }, "deleteWorkflow()");
  }

  public async listWorkflows(userId?: string): Promise<Workflow[]> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const query = userId ? { userId } : {};
      const workflows = await WorkflowModel.find(query)
        .maxTimeMS(timeout)
        .lean<Workflow[]>();
      return workflows;
    }, "listWorkflows()");
  }
}
