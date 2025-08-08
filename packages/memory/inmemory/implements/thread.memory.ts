import { randomUUID } from "node:crypto";
import type { MessageObject, ThreadObject, ThreadMetadata, ThreadType } from "@ainetwork/adk/types/memory";
import { IThreadMemory } from "@ainetwork/adk/modules";

type InMemoryThreadObject = {
  type: ThreadType;
  title: string;
  messages: Map<string, MessageObject>
}

type InMemoryThreadMetadata = {
  type: ThreadType;
  threadId: string;
  title: string;
  updatedAt: number;
  createdAt: number;
}

export class InMemoryThread implements IThreadMemory {
	public threads: Map<string, InMemoryThreadObject> = new Map();
  public userThreadIndex: Map<string, Set<InMemoryThreadMetadata>> = new Map();

  public async connect(): Promise<void> {}
  public async disconnect(): Promise<void> {}
  public isConnected(): boolean {
    return true;
  }

  private generateKey(userId: string, threadId: string) {
    return `${userId}:${threadId}`;
  }

  public async getThread(
    type: ThreadType,
    userId: string,
    threadId: string
  ): Promise<ThreadObject | undefined> {
    const key = this.generateKey(userId, threadId);
    const res = this.threads.get(key);
    if (res) {
      const threadObject: ThreadObject = {
        type: res.type,
        title: res.title,
        messages: Object.fromEntries(res.messages)
      };
      return threadObject;
    }
    return undefined;
  };

	public async createThread(
    type: ThreadType,
    userId: string,
    threadId: string,
    title: string
  ): Promise<ThreadMetadata> {
    const now = Date.now();
    const key = this.generateKey(userId, threadId);
    if (!this.userThreadIndex.has(userId)) {
      this.userThreadIndex.set(userId, new Set());
    }
    if (!this.threads.has(key)) {
      this.threads.set(key, { type, title, messages: new Map() });
      const metadata: InMemoryThreadMetadata = {
        type, threadId, title, createdAt: now, updatedAt: now,
      }
      this.userThreadIndex.get(userId)?.add(metadata);
    }

    return { type, title, threadId, updatedAt: now };
  };

	public async addMessagesToThread(
    userId: string,
    threadId: string,
    messages: MessageObject[]
  ): Promise<void> {
    const key = this.generateKey(userId, threadId);
    const thread = this.threads.get(key);
    for (const message of messages) {
      const newMessageId = randomUUID();
      thread?.messages.set(newMessageId, message);
    }
  };

	public async deleteThread(userId: string, threadId: string): Promise<void> {
    const key = this.generateKey(userId, threadId);
    this.threads.delete(key);
    this.userThreadIndex.delete(threadId);
  };

	public async listThreads(userId: string): Promise<ThreadMetadata[]> {
    const threads = this.userThreadIndex.get(userId);
    if (threads) {
      return Array.from(threads);
    }
    return [];
  };
}