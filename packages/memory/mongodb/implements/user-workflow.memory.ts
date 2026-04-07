import type { IUserWorkflowMemory } from "@ainetwork/adk/modules";
import type { UserWorkflow } from "@ainetwork/adk/types/memory";
import { UserWorkflowModel } from "../models/user-workflow.model";

export type ExecuteWithRetryFn = <T>(
  operation: () => Promise<T>,
  operationName?: string
) => Promise<T>;

export type GetOperationTimeoutFn = () => number;

export class MongoDBUserWorkflow implements IUserWorkflowMemory {
  private executeWithRetry: ExecuteWithRetryFn;
  private getOperationTimeout: GetOperationTimeoutFn;

  constructor(
    executeWithRetry: ExecuteWithRetryFn,
    getOperationTimeout: GetOperationTimeoutFn
  ) {
    this.executeWithRetry = executeWithRetry;
    this.getOperationTimeout = getOperationTimeout;
  }

  public async createUserWorkflow(workflow: UserWorkflow): Promise<UserWorkflow> {
    return this.executeWithRetry(async () => {
      const created = await UserWorkflowModel.create(workflow);
      return created.toObject() as UserWorkflow;
    }, "createUserWorkflow()");
  }

  public async getUserWorkflow(workflowId: string): Promise<UserWorkflow | undefined> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const workflow = await UserWorkflowModel.findOne({ workflowId })
        .maxTimeMS(timeout)
        .lean<UserWorkflow>();
      return workflow || undefined;
    }, "getUserWorkflow()");
  }

  public async updateUserWorkflow(workflowId: string, updates: Partial<UserWorkflow>): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await UserWorkflowModel.updateOne(
        { workflowId },
        { $set: updates }
      ).maxTimeMS(timeout);
    }, "updateUserWorkflow()");
  }

  public async deleteUserWorkflow(workflowId: string, userId: string): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await UserWorkflowModel.deleteOne({ workflowId, userId }).maxTimeMS(timeout);
    }, "deleteUserWorkflow()");
  }

  public async listUserWorkflows(userId?: string): Promise<UserWorkflow[]> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const query = userId ? { userId } : {};
      const workflows = await UserWorkflowModel.find(query)
        .maxTimeMS(timeout)
        .lean<UserWorkflow[]>();
      return workflows;
    }, "listUserWorkflows()");
  }

  public async listActiveScheduledWorkflows(): Promise<UserWorkflow[]> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const workflows = await UserWorkflowModel.find({
        active: true,
        schedule: { $exists: true, $ne: null },
      })
        .maxTimeMS(timeout)
        .lean<UserWorkflow[]>();
      return workflows;
    }, "listActiveScheduledWorkflows()");
  }
}
