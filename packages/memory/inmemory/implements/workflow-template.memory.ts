import { IWorkflowTemplateMemory } from "@ainetwork/adk/modules";
import type { WorkflowTemplate } from "@ainetwork/adk/types/memory";

export class InMemoryWorkflowTemplate implements IWorkflowTemplateMemory {
  private templates: Map<string, WorkflowTemplate> = new Map();

  public async createTemplate(template: WorkflowTemplate): Promise<WorkflowTemplate> {
    this.templates.set(template.templateId, template);
    return template;
  }

  public async getTemplate(templateId: string): Promise<WorkflowTemplate | undefined> {
    return this.templates.get(templateId);
  }

  public async updateTemplate(templateId: string, updates: Partial<WorkflowTemplate>): Promise<void> {
    const existing = this.templates.get(templateId);
    if (!existing) {
      throw new Error(`WorkflowTemplate not found: ${templateId}`);
    }

    const updated = { ...existing, ...updates, templateId };
    this.templates.set(templateId, updated);
  }

  public async deleteTemplate(templateId: string): Promise<void> {
    this.templates.delete(templateId);
  }

  public async listTemplates(): Promise<WorkflowTemplate[]> {
    return Array.from(this.templates.values());
  }
}
