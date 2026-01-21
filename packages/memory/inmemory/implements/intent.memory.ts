import { randomUUID } from "node:crypto";
import type { Intent } from "@ainetwork/adk/types/memory";
import { IIntentMemory } from "@ainetwork/adk/modules";

export class InMemoryIntent implements IIntentMemory {
  public intents: Map<string, Intent> = new Map();

  public async getIntent(intentId: string): Promise<Intent | undefined> {
    return this.intents.get(intentId);
  }

  public async getIntentByName(intentName: string): Promise<Intent | undefined> {
    return Array.from(this.intents.values()).find(intent => intent.name === intentName);
  }

  public async saveIntent(intent: Intent): Promise<void> {
    // Intent에 이미 id가 있으면 그것을 사용하고, 없으면 새로 생성
    const intentId = intent.id || randomUUID();
    const intentToSave = { ...intent, id: intentId };
    this.intents.set(intentId, intentToSave);
  }

  public async updateIntent(intentId: string, intent: Intent): Promise<void> {
    this.intents.set(intentId, intent);
  }

  public async deleteIntent(intentId: string): Promise<void> {
    this.intents.delete(intentId);
  }

  public async listIntents(): Promise<Intent[]> {
    return Array.from(this.intents.values());
  }
}