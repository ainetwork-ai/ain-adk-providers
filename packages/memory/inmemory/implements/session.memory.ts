import { randomUUID } from "node:crypto";
import type { ChatObject, SessionObject, SessionMetadata } from "@ainetwork/adk/types/memory";
import { ISessionMemory } from "@ainetwork/adk/modules";

type InMemorySessionObject = {
  chats: Map<string, ChatObject>
}

type InMemorySessionMetadata = {
  sessionId: string;
  title?: string;
  updatedAt: number;
  createdAt: number;
}

export class InMemorySession implements ISessionMemory {
	public sessions: Map<string, InMemorySessionObject> = new Map();
  public userSessionIndex: Map<string, Set<InMemorySessionMetadata>> = new Map();

  public async connect(): Promise<void> {}
  public async disconnect(): Promise<void> {}
  public isConnected(): boolean {
    return true;
  }

  private generateKey(userId: string, sessionId: string) {
    return `${userId}:${sessionId}`;
  }

  public async getSession(userId: string, sessionId: string): Promise<SessionObject | undefined> {
    const key = this.generateKey(userId, sessionId);
    const res = this.sessions.get(key);
    if (res) {
      const sessionObject: SessionObject = {
        chats: Object.fromEntries(res.chats)
      };
      return sessionObject;
    }
    return undefined;
  };

	public async createSession(userId: string, sessionId: string, title: string): Promise<SessionMetadata> {
    const now = Date.now();
    const key = this.generateKey(userId, sessionId);
    if (!this.userSessionIndex.has(userId)) {
      this.userSessionIndex.set(userId, new Set());
    }
    if (!this.sessions.has(key)) {
      this.sessions.set(key, { chats: new Map() });
      const metadata: InMemorySessionMetadata = {
        sessionId, createdAt: now, updatedAt: now,
      }
      this.userSessionIndex.get(userId)?.add(metadata);
    }

    return { title, sessionId, updatedAt: now };
  };

	public async addChatToSession(userId: string, sessionId: string, chat: ChatObject): Promise<void> {
    const key = this.generateKey(userId, sessionId);
    const newChatId = randomUUID();
    this.sessions.get(key)?.chats.set(newChatId, chat);
  };

	public async deleteSession(userId: string, sessionId: string): Promise<void> {
    const key = this.generateKey(userId, sessionId);
    this.sessions.delete(key);
    this.userSessionIndex.delete(sessionId);
  };

	public async listSessions(userId: string): Promise<SessionMetadata[]> {
    const sessions = this.userSessionIndex.get(userId);
    if (sessions) {
      return Array.from(sessions);
    }
    return [];
  };
}