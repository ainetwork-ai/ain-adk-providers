import { IAgentMemory } from "@ainetwork/adk/modules";

export class InMemoryAgent implements IAgentMemory {
  private agentPrompt: string = "";
  private aggregatePrompt: string = "";
  private generateTitlePrompt: string = "";
  private singleTriggerPrompt: string = "";
  private multiTriggerPrompt: string = "";
  private toolSelectPrompt: string = "";

  public async getAgentPrompt(): Promise<string> {
    return this.agentPrompt;
  }

  public async updateAgentPrompt(prompt: string): Promise<void> {
    this.agentPrompt = prompt;
  }

  public async getAggregatePrompt(): Promise<string> {
    return this.aggregatePrompt;
  }

  public async getGenerateTitlePrompt(): Promise<string> {
    return this.generateTitlePrompt;
  }

  public async getSingleTriggerPrompt(): Promise<string> {
    return this.singleTriggerPrompt;
  }

  public async getMultiTriggerPrompt(): Promise<string> {
    return this.multiTriggerPrompt;
  }

  public async getToolSelectPrompt(): Promise<string> {
    return this.toolSelectPrompt;
  }
}
