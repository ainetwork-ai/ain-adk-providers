import { IAgentMemory } from "@ainetwork/adk/modules";

export class InMemoryAgent implements IAgentMemory {
  private prompt: string = "";

  public async getAgentPrompt(): Promise<string> {
    return this.prompt;
  }

  public async updateAgentPrompt(prompt: string): Promise<void> {
    this.prompt = prompt;
  }
}
