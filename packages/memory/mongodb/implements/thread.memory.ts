import { randomUUID } from "node:crypto";
import type { MessageObject, ThreadMetadata, ThreadObject, ThreadType } from "@ainetwork/adk/types/memory";
import { MessageRole } from "@ainetwork/adk/types/memory";
import { IThreadMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";
import {
	MessageDocument,
  MessageModel,
  ThreadDocument,
  ThreadModel
} from "../models/threads.model";
import { loggers } from "@ainetwork/adk/utils/logger";

export class MongoDBThread extends MongoDBMemory implements IThreadMemory {
  constructor(uri: string) {
    super(uri);
  }

  public async getThread(
    type: ThreadType,
    userId: string,
    threadId: string
  ): Promise<ThreadObject | undefined> {
    const thread = await ThreadModel.findOne({ type, threadId, userId });
		const messages = await MessageModel.find({ threadId, userId }).sort({
			timestamp: 1,
		});

    if (!thread) return undefined;

		loggers.agent.debug(`Found ${messages.length} messages for thread ${threadId}`);

		const threadObject: ThreadObject = { 
      type: thread.type as ThreadType,
      title: thread.title || "New thread",
      messages: {}
    };
		messages.forEach((message: MessageDocument) => {
			const messageId = message._id?.toString() || message.id;
			threadObject.messages[messageId] = {
				role: message.role as MessageRole,
				content: message.content,
				timestamp: message.timestamp,
				metadata: message.metadata,
			};
		});

		return threadObject;
  };

	public async createThread(
		type: ThreadType,
		userId: string,
		threadId: string,
		title: string,
  ): Promise<ThreadMetadata> {
    const now = Date.now();
    await ThreadModel.create({
      type,
      userId,
      threadId,
      title,
      updated_at: now,
      created_at: now,
    });

    return { type, threadId, title, updatedAt: now };
  };

	public async addMessagesToThread(
    userId: string,
    threadId: string,
    messages: MessageObject[]
  ): Promise<void> {
    await ThreadModel.updateOne({ threadId, userId }, {
      updated_at: Date.now(),
    });
    for (const message of messages) {
      const newId = randomUUID();
      await MessageModel.create({
        threadId,
        messageId: newId,
        userId,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        metadata: message.metadata,
      });
    }
  };

	public async deleteThread(userId: string, threadId: string): Promise<void> {
		const messages = await MessageModel.find({ userId, threadId }).sort({
			timestamp: 1,
		});

		messages?.forEach((message: MessageDocument) => {
      message.deleteOne();
		});
    
    const thread = await ThreadModel.findOne({ userId, threadId });
    thread?.deleteOne();
  };

	public async listThreads(userId: string): Promise<ThreadMetadata[]> {
    const threads = await ThreadModel.find({ userId }).sort({
      updated_at: -1,
    });
    const data: ThreadMetadata[] = threads.map((thread: ThreadDocument) => {
      return {
        type: thread.type,
        threadId: thread.threadId,
        title: thread.title,
        updatedAt: thread.updated_at
      } as ThreadMetadata;
    })
    return data;
  };
}