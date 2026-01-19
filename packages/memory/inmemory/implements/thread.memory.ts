import type { MessageObject, ThreadObject, ThreadMetadata, ThreadType } from "@ainetwork/adk/types/memory";
import { IThreadMemory } from "@ainetwork/adk/modules";

type InMemoryThreadObject = {
  type: ThreadType;
  title: string;
  messages: Array<MessageObject>;
}

type InMemoryThreadMetadata = {
  type: ThreadType;
  userId: string;
  threadId: string;
  title: string;
  updatedAt: number;
  createdAt: number;
}

export class InMemoryThread implements IThreadMemory {
  public threads: Map<string, InMemoryThreadObject> = new Map();
  public userThreadIndex: Map<string, Set<InMemoryThreadMetadata>> = new Map();

  private generateKey(userId: string, threadId: string) {
    return `${userId}:${threadId}`;
  }

  public async getThread(
    userId: string,
    threadId: string
  ): Promise<ThreadObject | undefined> {
    const key = this.generateKey(userId, threadId);
    const res = this.threads.get(key);
    if (res) {
      const threadObject: ThreadObject = {
        threadId,
        userId,
        type: res.type,
        title: res.title,
        messages: res.messages,
      };
      return threadObject;
    }
    return undefined;
  }

  public async createThread(
    type: ThreadType,
    userId: string,
    threadId: string,
    title: string
  ): Promise<ThreadObject> {
    const now = Date.now();
    const key = this.generateKey(userId, threadId);
    if (!this.userThreadIndex.has(userId)) {
      this.userThreadIndex.set(userId, new Set());
    }
    if (!this.threads.has(key)) {
      this.threads.set(key, { type, title, messages: [] });
      const metadata: InMemoryThreadMetadata = {
        type, userId, threadId, title, createdAt: now, updatedAt: now,
      }
      this.userThreadIndex.get(userId)?.add(metadata);
    }

    return { type, title, threadId, userId, messages: [] };
  }

  public async addMessagesToThread(
    userId: string,
    threadId: string,
    messages: MessageObject[]
  ): Promise<void> {
    const key = this.generateKey(userId, threadId);
    const thread = this.threads.get(key);
    for (const message of messages) {
      thread?.messages.push(message);
    }
  }

  public async deleteThread(userId: string, threadId: string): Promise<void> {
    const key = this.generateKey(userId, threadId);
    this.threads.delete(key);

    // userThreadIndex에서 해당 thread metadata 제거
    const userThreads = this.userThreadIndex.get(userId);
    if (userThreads) {
      const metadataToDelete = Array.from(userThreads).find(
        metadata => metadata.threadId === threadId
      );
      if (metadataToDelete) {
        userThreads.delete(metadataToDelete);
      }
    }
  }

  public async listThreads(userId: string): Promise<ThreadMetadata[]> {
    const threads = this.userThreadIndex.get(userId);
    if (threads) {
      return Array.from(threads);
    }
    return [];
  }
}