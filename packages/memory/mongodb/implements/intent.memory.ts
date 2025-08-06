import type { Intent } from "@ainetwork/adk/types/memory";
import { IIntentMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";
import { IntentModel } from "../models/intent.model";
import { Types } from "mongoose";

export class MongoDBIntent extends MongoDBMemory implements IIntentMemory {
  public async getIntent(intentId: string): Promise<Intent | undefined> {
    const intent = await IntentModel.findById(new Types.ObjectId(intentId));
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
    // ObjectId automatically generated (MongoDB automatically generates)
    await IntentModel.create({
      name: intent.name,
      description: intent.description,
      prompt: intent.prompt,
      llm: intent.llm,
    });
  };

	public async updateIntent(intentId: string, intent: Intent): Promise<void> {
    await IntentModel.updateOne({
      _id: new Types.ObjectId(intentId),
    },{
      name: intent.name,
      description: intent.description,
      prompt: intent.prompt,
      llm: intent.llm,
    });
  };

	public async deleteIntent(intentId: string): Promise<void> {
    await IntentModel.deleteOne({ _id: new Types.ObjectId(intentId) });
  };

	public async listIntents(): Promise<Intent[]> {
    const intents = await IntentModel.find();
    return intents.map(intent => ({
      name: intent.name,
      description: intent.description,
      prompt: intent.prompt,
      llm: intent.llm,
    } as Intent));
  };
}