import { randomUUID } from "node:crypto";
import type { ChatObject, SessionMetadata, SessionObject } from "@ainetwork/adk/types/memory";
import { ISessionMemory } from "@ainetwork/adk/modules";
import { MongoDBMemory } from "./base.memory";
import {
	ChatDocument,
	ChatRole,
  ChatObjectSchema,
  SessionObjectSchema,
  SessionDocument
} from "../models/chats.model";
import { loggers } from "@ainetwork/adk/utils/logger";
import { Model } from "mongoose";

export class MongoDBSession extends MongoDBMemory implements ISessionMemory {
  private chatModel: Model<ChatDocument>;
  private sessionModel: Model<SessionDocument>;

  constructor(uri: string) {
    super(uri);
    const _mongoose = super.getInstance();
    this.chatModel = _mongoose.model<ChatDocument>("Chat", ChatObjectSchema);
    this.sessionModel = _mongoose.model<SessionDocument>("Session", SessionObjectSchema);
  }

  public async getSession(sessionId: string, userId?: string): Promise<SessionObject | undefined> {
		const chats = await this.chatModel.find({ sessionId }).sort({
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

	public async createSession(userId: string, sessionId: string): Promise<void> {
    await this.sessionModel.create({
      sessionId,
      userId,
      updated_at: Date.now(),
      created_at: Date.now(),
    });
  };

	public async addChatToSession(userId: string, sessionId: string, chat: ChatObject): Promise<void> {
    const newId = randomUUID();
		await this.chatModel.create({
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
		const chats = await this.chatModel.find({ userId, sessionId }).sort({
			timestamp: 1,
		});

		chats?.forEach((chat: ChatDocument) => {
      chat.deleteOne();
		});
    
    const session = await this.sessionModel.findOne({ sessionId, userId });
    session?.deleteOne();
  };

	public async listSessions(userId: string): Promise<SessionMetadata[]> {
    const sessions = await this.sessionModel.find({ userId }).sort({
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