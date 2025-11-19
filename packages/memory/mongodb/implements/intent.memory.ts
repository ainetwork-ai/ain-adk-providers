import type { Intent } from "@ainetwork/adk/types/memory";
import { IIntentMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";
import { IntentModel } from "../models/intent.model";

export class MongoDBIntent extends MongoDBMemory implements IIntentMemory {
  public async getIntent(intentId: string): Promise<Intent | undefined> {
    return this.executeWithRetry(async () => {
      const intent = await IntentModel.findOne({ id: intentId }).lean<Intent>();
      return intent || undefined;
    }, `getIntent(${intentId})`);
  };

  public async getIntentByName(intentName: string): Promise<Intent | undefined> {
    return this.executeWithRetry(async () => {
      const intent = await IntentModel.findOne({ name: intentName }).lean<Intent>();
      return intent || undefined;
    }, `getIntentByName(${intentName})`);
  }

  public async saveIntent(intent: Intent): Promise<void> {
    return this.executeWithRetry(async () => {
      await IntentModel.create(intent);
    }, `saveIntent(${intent.id})`);
  };

  public async updateIntent(intentId: string, intent: Intent): Promise<void> {
    return this.executeWithRetry(async () => {
      await IntentModel.updateOne({
        id: intentId,
      }, intent);
    }, `updateIntent(${intentId})`);
  };

  public async deleteIntent(intentId: string): Promise<void> {
    return this.executeWithRetry(async () => {
      await IntentModel.deleteOne({ id: intentId });
    }, `deleteIntent(${intentId})`);
  };

  public async listIntents(): Promise<Intent[]> {
    return this.executeWithRetry(async () => {
      const intents = await IntentModel.find().lean<Intent[]>();
      return intents;
    }, `listIntents()`);
  };
}
