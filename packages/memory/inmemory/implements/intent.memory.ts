import { randomUUID } from "node:crypto";
import type { Intent } from "@ainetwork/adk/types/memory";
import { IIntentMemory } from "@ainetwork/adk/modules";

export class InMemoryIntent implements IIntentMemory {
	public intents: Map<string, Intent> = new Map();

  public async connect(): Promise<void> {}
  public async disconnect(): Promise<void> {}
  public isConnected(): boolean {
    return true;
  }

  public async getIntent(intentId: string): Promise<Intent | undefined> {
    return this.intents.get(intentId);
  };

  public async getIntentByName(intentName: string): Promise<Intent | undefined> {
    return Array.from(this.intents.values()).find(intent => intent.name === intentName);
  };

	public async saveIntent(intent: Intent): Promise<void> {
    const newId = randomUUID();
    this.intents.set(newId, intent);
  };

	public async updateIntent(intentId: string, intent: Intent): Promise<void> {
    this.intents.set(intentId, intent);
  };

	public async deleteIntent(intentId: string): Promise<void> {
    this.intents.delete(intentId);
  };

	public async listIntents(): Promise<Intent[]> {
    return Array.from(this.intents.values());
  };
}