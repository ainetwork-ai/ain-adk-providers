import type { Intent } from "@ainetwork/adk/types/memory";
import { IIntentMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";
import { IntentModel } from "../models/intent.model";
import { Types } from "mongoose";

export class MongoDBIntent extends MongoDBMemory implements IIntentMemory {
  public async getIntent(intentId: string): Promise<Intent | undefined> {
    const intent = await IntentModel.findOne({ id: intentId });
    if (intent) {
      return intent;
    }
    return undefined;
  };

	public async getIntentByName(intentName: string): Promise<Intent | undefined> {
		const intent = await IntentModel.findOne({ name: intentName });
		if (intent) {
      return intent;
		}
		return undefined;
	}

	public async saveIntent(intent: Intent): Promise<void> {
    await IntentModel.create(intent);
  };

	public async updateIntent(intentId: string, intent: Intent): Promise<void> {
    await IntentModel.updateOne({
      id: intentId,
    }, intent);
  };

	public async deleteIntent(intentId: string): Promise<void> {
    await IntentModel.deleteOne({ id: intentId });
  };

	public async listIntents(): Promise<Intent[]> {
    const intents = await IntentModel.find();
    return intents;
  };
}