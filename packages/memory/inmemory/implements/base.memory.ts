import { IAgentMemory, IIntentMemory, IMemory, IUserWorkflowMemory, IThreadMemory, IWorkflowTemplateMemory } from "@ainetwork/adk/modules";
import { InMemoryAgent } from "./agent.memory";
import { InMemoryIntent } from "./intent.memory";
import { InMemoryThread } from "./thread.memory";
import { InMemoryUserWorkflow } from "./user-workflow.memory";
import { InMemoryWorkflowTemplate } from "./workflow-template.memory";

export class InMemoryMemory implements IMemory {
  private static instance: InMemoryMemory;
  private connected: boolean = false;

  private agentMemory: InMemoryAgent;
  private intentMemory: InMemoryIntent;
  private threadMemory: InMemoryThread;
  private workflowTemplateMemory: InMemoryWorkflowTemplate;
  private userWorkflowMemory: InMemoryUserWorkflow;

  constructor() {
    if (!InMemoryMemory.instance) {
      InMemoryMemory.instance = this;
    }

    this.agentMemory = new InMemoryAgent();
    this.threadMemory = new InMemoryThread();
    this.intentMemory = new InMemoryIntent();
    this.workflowTemplateMemory = new InMemoryWorkflowTemplate();
    this.userWorkflowMemory = new InMemoryUserWorkflow();
  }

  public async connect(): Promise<void> {
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public getAgentMemory(): IAgentMemory {
    return this.agentMemory;
  }

  public getThreadMemory(): IThreadMemory {
    return this.threadMemory;
  }

  public getIntentMemory(): IIntentMemory {
    return this.intentMemory;
  }

  public getWorkflowTemplateMemory(): IWorkflowTemplateMemory {
    return this.workflowTemplateMemory;
  }

  public getUserWorkflowMemory(): IUserWorkflowMemory {
    return this.userWorkflowMemory;
  }
}
