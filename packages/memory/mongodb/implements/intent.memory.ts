import { randomUUID } from "node:crypto";
import type { Intent } from "@ainetwork/adk/types/memory";
import { IIntentMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";
import { IntentModel } from "../models/intent.model";

export class InMemoryIntent extends MongoDBMemory implements IIntentMemory {
  public async getIntent(intentId: string): Promise<Intent | undefined> {
    const intent = await IntentModel.findById(intentId);
    if (intent) {
      return {
        name: intent.name,
        description: intent.description,
        prompt: intent.prompt,
        llm: intent.llm,
      } as Intent;
    }
    return undefined;
  };

	public async saveIntent(intent: Intent): Promise<void> {
    const newId = randomUUID();
    await IntentModel.create({
      _id: newId,
      name: intent.name,
      description: intent.description,
      prompt: intent.prompt,
      llm: intent.llm,
    });
  };

	public async updateIntent(intentId: string, intent: Intent): Promise<void> {
    await IntentModel.updateOne({
      _id: intentId,
    },{
      name: intent.name,
      description: intent.description,
      prompt: intent.prompt,
      llm: intent.llm,
    });
  };

	public async deleteIntent(intentId: string): Promise<void> {
  };

	public async listIntents(): Promise<Intent[]> {
  };
}