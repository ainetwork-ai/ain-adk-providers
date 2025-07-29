import { randomUUID } from "node:crypto";
import type { ChatObject, SessionObject } from "@ainetwork/adk/types/memory";
import { BaseMemory } from "@ainetwork/adk/modules";

export class InMemoryMemory extends BaseMemory {
	public sessionHistory: Map<string, SessionObject>;

	constructor() {
		super();
		this.sessionHistory = new Map<string, SessionObject>();
	}

	public async getSessionHistory(sessionId: string): Promise<SessionObject> {
		return this.sessionHistory.get(sessionId) || { chats: {} };
	}

	public async updateSessionHistory(
		sessionId: string,
		chat: ChatObject,
	): Promise<void> {
		const newChatId = randomUUID();
		const history = await this.getSessionHistory(sessionId);
		history.chats[newChatId] = chat;
		this.sessionHistory.set(sessionId, history);
	}

	public async storeQueryAndIntent(
		query: string,
		intent: string,
		sessionId: string,
	) {}
}