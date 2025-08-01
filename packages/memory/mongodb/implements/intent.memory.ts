import { randomUUID } from "node:crypto";
import type { Intent } from "@ainetwork/adk/types/memory";
import { IIntentMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";

export class InMemoryIntent extends MongoDBMemory implements IIntentMemory {
  public async getIntent(intentId: string): Promise<Intent | undefined> {
  };

	public async saveIntent(intent: Intent): Promise<void> {
  };

	public async updateIntent(intentId: string, intent: Intent): Promise<void> {
  };

	public async deleteIntent(intentId: string): Promise<void> {
  };

	public async listIntents(): Promise<Intent[]> {
  };
}