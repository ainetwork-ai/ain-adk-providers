import { randomUUID } from "node:crypto";
import type { MessageObject, ThreadMetadata, ThreadObject, ThreadType } from "@ainetwork/adk/types/memory";
import { MessageRole } from "@ainetwork/adk/types/memory";
import { IThreadMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";
import {
	ChatDocument,
  ChatObjectSchema,
  ThreadObjectSchema,
  ThreadDocument
} from "../models/chats.model";
import { loggers } from "@ainetwork/adk/utils/logger";
import { Model } from "mongoose";

export class MongoDBThread extends MongoDBMemory implements IThreadMemory {
  private chatModel: Model<ChatDocument>;
  private threadModel: Model<ThreadDocument>;

  constructor(uri: string) {
    super(uri);
    const _mongoose = super.getInstance();
    this.chatModel = _mongoose.model<ChatDocument>("Chat", ChatObjectSchema);
    this.threadModel = _mongoose.model<ThreadDocument>("Thread", ThreadObjectSchema);
  }

  public async getThread(userId: string, threadId: string): Promise<ThreadObject | undefined> {
    const thread = await this.threadModel.findOne({ threadId, userId });
		const chats = await this.chatModel.find({ threadId, userId }).sort({
			timestamp: 1,
		});

    if (!thread) return undefined;

		loggers.agent.debug(`Found ${chats.length} chats for thread ${threadId}`);

		const threadObject: ThreadObject = { 
      type: thread.type as ThreadType,
      title: thread.title || "New chats",
      messages: {}
    };
		chats.forEach((chat: ChatDocument) => {
			const chatId = chat._id?.toString() || chat.id;
			threadObject.messages[chatId] = {
				role: chat.role as MessageRole,
				content: chat.content,
				timestamp: chat.timestamp,
				metadata: chat.metadata,
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
    await this.threadModel.create({
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
    await this.threadModel.updateOne({ threadId, userId }, {
      updated_at: Date.now(),
    });
    for (const message of messages) {
      const newId = randomUUID();
      await this.chatModel.create({
        threadId,
        chatId: newId,
        userId,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        metadata: message.metadata,
      });
    }
  };

	public async deleteThread(userId: string, threadId: string): Promise<void> {
		const chats = await this.chatModel.find({ userId, threadId }).sort({
			timestamp: 1,
		});

		chats?.forEach((chat: ChatDocument) => {
      chat.deleteOne();
		});
    
    const thread = await this.threadModel.findOne({ userId, threadId });
    thread?.deleteOne();
  };

	public async listThreads(userId: string): Promise<ThreadMetadata[]> {
    const threads = await this.threadModel.find({ userId }).sort({
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