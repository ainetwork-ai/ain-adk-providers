import type { MessageObject, ThreadMetadata, ThreadObject, ThreadType } from "@ainetwork/adk/types/memory";
import { MessageRole } from "@ainetwork/adk/types/memory";
import { IThreadMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";
import { ThreadDocument, ThreadModel } from "../models/threads.model";
import { MessageDocument, MessageModel } from "../models/messages.model";
import { loggers } from "@ainetwork/adk/utils/logger";

export class MongoDBThread extends MongoDBMemory implements IThreadMemory {
  constructor(uri: string) {
    super(uri);
  }

  public async getThread(
    userId: string,
    threadId: string
  ): Promise<ThreadObject | undefined> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const thread = await ThreadModel.findOne({ threadId, userId }).maxTimeMS(timeout);
      const messages = await MessageModel.find({ threadId, userId })
        .sort({ timestamp: 1 })
        .maxTimeMS(timeout);

      if (!thread) return undefined;

      loggers.agent.debug(`Found ${messages.length} messages for thread ${threadId}`);

      const threadObject: ThreadObject = {
        threadId: thread.threadId,
        userId: thread.userId,
        type: thread.type as ThreadType,
        title: thread.title || "New thread",
        messages: []
      };
      messages.forEach((message: MessageDocument) => {
        threadObject.messages.push({
          messageId: message.messageId,
          role: message.role as MessageRole,
          content: message.content,
          timestamp: message.timestamp,
          metadata: message.metadata,
        });
      });

      return threadObject;
    }, `getThread(${userId}, ${threadId})`);
  };

  public async createThread(
    type: ThreadType,
    userId: string,
    threadId: string,
    title: string,
  ): Promise<ThreadObject> {
    return this.executeWithRetry(async () => {
      const now = Date.now();
      await ThreadModel.create({
        type,
        userId,
        threadId,
        title,
        updated_at: now,
        created_at: now,
      });

      return { type, userId, threadId, title, messages: []};
    }, `createThread(${userId}, ${threadId})`);
  };

  public async addMessagesToThread(
    userId: string,
    threadId: string,
    messages: MessageObject[]
  ): Promise<void> {
    return this.executeWithRetry(async () => {
      await ThreadModel.updateOne({ threadId, userId }, {
        updated_at: Date.now(),
      });
      for (const message of messages) {
        await MessageModel.create({
          threadId,
          messageId: message.messageId,
          userId,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
          metadata: message.metadata,
        });
      }
    }, `addMessagesToThread(${userId}, ${threadId})`);
  };

  public async deleteThread(userId: string, threadId: string): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const messages = await MessageModel.find({ userId, threadId })
        .sort({ timestamp: 1 })
        .maxTimeMS(timeout);

      messages?.forEach((message: MessageDocument) => {
        message.deleteOne();
      });

      const thread = await ThreadModel.findOne({ userId, threadId }).maxTimeMS(timeout);
      thread?.deleteOne();
    }, `deleteThread(${userId}, ${threadId})`);
  };

  public async listThreads(userId: string): Promise<ThreadMetadata[]> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const threads = await ThreadModel.find({ userId })
        .sort({ updated_at: -1 })
        .maxTimeMS(timeout);
      const data: ThreadMetadata[] = threads.map((thread: ThreadDocument) => {
        return {
          type: thread.type,
          userId,
          threadId: thread.threadId,
          title: thread.title,
          updatedAt: thread.updated_at
        } as ThreadMetadata;
      })
      return data;
    }, `listThreads(${userId})`);
  };
}
