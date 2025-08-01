import { randomUUID } from "node:crypto";
import type { ChatObject, SessionObject } from "@ainetwork/adk/types/memory";
import { ISessionMemory } from "@ainetwork/adk/modules";

export class InMemorySession implements ISessionMemory {
	public sessions: Map<string, Map<string, SessionObject>> = new Map();

  public async connect(): Promise<void> {}
  public async disconnect(): Promise<void> {}
  public isConnected(): boolean {
    return true;
  }

  public async getSession(sessionId: string, userId?: string): Promise<SessionObject | undefined> {
    return this.sessions.get(userId)?.get(sessionId);
  };

	public async createSession(sessionId: string, userId?: string): Promise<void> {
    const session = new Map<string, SessionObject>();
    this.sessions.set(userId, session);
  };

	public async addChatToSession(sessionId: string, chat: ChatObject): Promise<void> {
    const newChatId = randomUUID();
    const session = await this.getSession(sessionId);
    if (session) {
      session.chats[newChatId] = chat;
    } else {
      this.sessions.set(sessionId, { chats: { [newChatId]: chat }});
    }
  };

	public async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  };

	public async listSessions(): Promise<string[]> {
    const sessionIds = Array.from(this.sessions.keys());
    return sessionIds;
  };
}