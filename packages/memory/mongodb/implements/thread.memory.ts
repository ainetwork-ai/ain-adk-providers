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
    const thread = await ThreadModel.findOne({ threadId, userId });
		const messages = await MessageModel.find({ threadId, userId }).sort({
			timestamp: 1,
		});

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
  };

	public async createThread(
		type: ThreadType,
		userId: string,
		threadId: string,
		title: string,
  ): Promise<ThreadObject> {
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
        userId,
        threadId: thread.threadId,
        title: thread.title,
        updatedAt: thread.updated_at
      } as ThreadMetadata;
    })
    return data;
  };
}