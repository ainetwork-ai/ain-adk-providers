import { randomUUID } from "node:crypto";
import type { ChatObject, SessionMetadata, SessionObject } from "@ainetwork/adk/types/memory";
import { ISessionMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";
import {
	ChatDocument,
	ChatRole,
  SessionDocument,
  ChatModel,
  SessionModel
} from "../models/chats.model";
import { loggers } from "@ainetwork/adk/utils/logger";

export class MongoDBSession extends MongoDBMemory implements ISessionMemory {

  public async getSession(sessionId: string, userId?: string): Promise<SessionObject | undefined> {
		const chats = await ChatModel.find({ sessionId, userId }).sort({
			timestamp: 1,
		});
    const session = await SessionModel.findOne({ sessionId, userId });

		loggers.agent.debug(`Found ${chats.length} chats for session ${sessionId}`);

		const sessionObject: SessionObject = { chats: {} };
    sessionObject.title = session?.title;
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

	public async createSession(userId: string, sessionId: string, title: string): Promise<SessionMetadata> {
    const now = Date.now();
    await SessionModel.create({
      sessionId,
      userId,
      title,
      updated_at: now,
      created_at: now,
    });

    return { title, sessionId, updatedAt: now };
  };

	public async addChatToSession(userId: string, sessionId: string, chat: ChatObject): Promise<void> {
    const newId = randomUUID();
    await SessionModel.updateOne({ sessionId, userId }, {
      updated_at: Date.now(),
    });
		await ChatModel.create({
			sessionId,
      chatId: newId,
      userId,
			role: chat.role,
			content: chat.content,
			timestamp: chat.timestamp,
			metadata: chat.metadata,
		});
  };

	public async deleteSession(userId: string, sessionId: string): Promise<void> {
		const chats = await ChatModel.find({ userId, sessionId }).sort({
			timestamp: 1,
		});

		chats?.forEach((chat: ChatDocument) => {
      chat.deleteOne();
		});
    
    const session = await SessionModel.findOne({ sessionId, userId });
    session?.deleteOne();
  };

	public async listSessions(userId: string): Promise<SessionMetadata[]> {
    const sessions = await SessionModel.find({ userId }).sort({
      updated_at: -1,
    });
    const data: SessionMetadata[] = sessions.map((session: SessionDocument) => {
      return {
        sessionId: session.sessionId,
        title: session.title,
        updatedAt: session.updated_at
      } as SessionMetadata;
    })
    return data;
  };
}