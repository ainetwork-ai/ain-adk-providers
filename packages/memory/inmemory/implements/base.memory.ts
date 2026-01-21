import { IAgentMemory, IIntentMemory, IMemory, IThreadMemory, IWorkflowMemory } from "@ainetwork/adk/modules";
import { InMemoryAgent } from "./agent.memory";
import { InMemoryIntent } from "./intent.memory";
import { InMemoryThread } from "./thread.memory";
import { InMemoryWorkflow } from "./workflow.memory";

export class InMemoryMemory implements IMemory {
  private static instance: InMemoryMemory;
  private connected: boolean = false;

  private agentMemory: InMemoryAgent;
  private intentMemory: InMemoryIntent;
  private threadMemory: InMemoryThread;
  private workflowMemory: InMemoryWorkflow;

  constructor() {
    if (!InMemoryMemory.instance) {
      InMemoryMemory.instance = this;
    }

    this.agentMemory = new InMemoryAgent();
    this.threadMemory = new InMemoryThread();
    this.intentMemory = new InMemoryIntent();
    this.workflowMemory = new InMemoryWorkflow();
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

  public getWorkflowMemory(): IWorkflowMemory {
    return this.workflowMemory;
  }
}
