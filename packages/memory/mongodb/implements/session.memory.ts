import { randomUUID } from "node:crypto";
import type { ChatObject, SessionObject } from "@ainetwork/adk/types/memory";
import { ISessionMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";
import {
	type ChatDocument,
	ChatModel,
	ChatRole,
} from "../models/chats.model";
import { loggers } from "@ainetwork/adk/utils/logger";

export class InMemorySession extends MongoDBMemory implements ISessionMemory {
  public async getSession(sessionId: string, userId?: string): Promise<SessionObject | undefined> {
		const chats = await ChatModel.find({ sessionId }).sort({
			timestamp: 1,
		});

		loggers.agent.debug(`Found ${chats.length} chats for session ${sessionId}`);

		const sessionObject: SessionObject = { chats: {} };
		chats.forEach((chat: ChatDocument) => {
			const chatId = chat._id?.toString() || chat.id;
			sessionObject.chats[chatId] = {
				role: chat.role as ChatRole,
				content: chat.content,
				timestamp: chat.timestamp,
				metadata: chat.metadata,
			};
		});

		return sessionObject;
  };

	public async createSession(sessionId: string, userId?: string): Promise<void> {
  };

	public async addChatToSession(sessionId: string, chat: ChatObject, userId?: string): Promise<void> {
    const newId = randomUUID();
		await ChatModel.create({
			sessionId,
      chatId: newId,
			role: chat.role,
			content: chat.content,
			timestamp: chat.timestamp,
			metadata: chat.metadata,
		});
  };

	public async deleteSession(sessionId: string, userId?: string): Promise<void> {
		const chats = await ChatModel.find({ sessionId }).sort({
			timestamp: 1,
		});

		chats.forEach((chat: ChatDocument) => {
      chat.deleteOne();
		});
  };

	public async listSessions(userId: string): Promise<string[]> {
    return [];
  };
}