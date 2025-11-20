import type { Intent } from "@ainetwork/adk/types/memory";
import { IIntentMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";
import { IntentModel } from "../models/intent.model";

export class MongoDBIntent extends MongoDBMemory implements IIntentMemory {
  public async getIntent(intentId: string): Promise<Intent | undefined> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const intent = await IntentModel.findOne({ id: intentId })
        .maxTimeMS(timeout)
        .lean<Intent>();
      return intent || undefined;
    }, `getIntent(${intentId})`);
  };

  public async getIntentByName(intentName: string): Promise<Intent | undefined> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const intent = await IntentModel.findOne({ name: intentName })
        .maxTimeMS(timeout)
        .lean<Intent>();
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
      const timeout = this.getOperationTimeout();
      await IntentModel.updateOne({
        id: intentId,
      }, intent).maxTimeMS(timeout);
    }, `updateIntent(${intentId})`);
  };

  public async deleteIntent(intentId: string): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await IntentModel.deleteOne({ id: intentId }).maxTimeMS(timeout);
    }, `deleteIntent(${intentId})`);
  };

  public async listIntents(): Promise<Intent[]> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const intents = await IntentModel.find()
        .maxTimeMS(timeout)
        .lean<Intent[]>();
      return intents;
    }, `listIntents()`);
  };
}
