import type { IWorkflowTemplateMemory } from "@ainetwork/adk/modules";
import type { WorkflowTemplate } from "@ainetwork/adk/types/memory";
import { WorkflowTemplateModel } from "../models/workflow-template.model";

export type ExecuteWithRetryFn = <T>(
  operation: () => Promise<T>,
  operationName?: string
) => Promise<T>;

export type GetOperationTimeoutFn = () => number;

export class MongoDBWorkflowTemplate implements IWorkflowTemplateMemory {
  private executeWithRetry: ExecuteWithRetryFn;
  private getOperationTimeout: GetOperationTimeoutFn;

  constructor(
    executeWithRetry: ExecuteWithRetryFn,
    getOperationTimeout: GetOperationTimeoutFn
  ) {
    this.executeWithRetry = executeWithRetry;
    this.getOperationTimeout = getOperationTimeout;
  }

  public async createTemplate(template: WorkflowTemplate): Promise<WorkflowTemplate> {
    return this.executeWithRetry(async () => {
      const created = await WorkflowTemplateModel.create(template);
      return created.toObject() as WorkflowTemplate;
    }, "createTemplate()");
  }

  public async getTemplate(templateId: string): Promise<WorkflowTemplate | undefined> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const template = await WorkflowTemplateModel.findOne({ templateId })
        .maxTimeMS(timeout)
        .lean<WorkflowTemplate>();
      return template || undefined;
    }, "getTemplate()");
  }

  public async updateTemplate(templateId: string, updates: Partial<WorkflowTemplate>): Promise<void> {
    const { templateId: _templateId, ...mutableUpdates } = updates;

    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await WorkflowTemplateModel.updateOne(
        { templateId },
        { $set: mutableUpdates }
      ).maxTimeMS(timeout);
    }, "updateTemplate()");
  }

  public async deleteTemplate(templateId: string): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await WorkflowTemplateModel.deleteOne({ templateId }).maxTimeMS(timeout);
    }, "deleteTemplate()");
  }

  public async listTemplates(): Promise<WorkflowTemplate[]> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const templates = await WorkflowTemplateModel.find()
        .maxTimeMS(timeout)
        .lean<WorkflowTemplate[]>();
      return templates;
    }, "listTemplates()");
  }
}
