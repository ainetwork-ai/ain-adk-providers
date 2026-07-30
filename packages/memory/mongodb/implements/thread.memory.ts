import type { IThreadMemory } from "@ainetwork/adk/modules";
import type {
	MessageObject,
	MessageRole,
	ThreadFilter,
	ThreadMetadata,
	ThreadObject,
	ThreadType,
} from "@ainetwork/adk/types/memory";
import { loggers } from "@ainetwork/adk/utils/logger";
import { type MessageDocument, MessageModel } from "../models/messages.model";
import { type ThreadDocument, ThreadModel } from "../models/threads.model";

export type ExecuteWithRetryFn = <T>(
	operation: () => Promise<T>,
	operationName?: string,
) => Promise<T>;

export type GetOperationTimeoutFn = () => number;

export class MongoDBThread implements IThreadMemory {
	private executeWithRetry: ExecuteWithRetryFn;
	private getOperationTimeout: GetOperationTimeoutFn;

	constructor(
		executeWithRetry: ExecuteWithRetryFn,
		getOperationTimeout: GetOperationTimeoutFn,
	) {
		this.executeWithRetry = executeWithRetry;
		this.getOperationTimeout = getOperationTimeout;
	}

	public async getThread(
		userId: string,
		threadId: string,
	): Promise<ThreadObject | undefined> {
		return this.executeWithRetry(async () => {
			const timeout = this.getOperationTimeout();
			const thread = await ThreadModel.findOne({ threadId, userId }).maxTimeMS(
				timeout,
			);
			const messages = await MessageModel.find({ threadId, userId })
				.sort({ timestamp: 1 })
				.maxTimeMS(timeout);

			if (!thread) return undefined;

			loggers.agent.debug(
				`Found ${messages.length} messages for thread ${threadId}`,
			);

			const threadObject: ThreadObject = {
				threadId: thread.threadId,
				userId: thread.userId,
				type: thread.type as ThreadType,
				title: thread.title || "New thread",
				isPinned: thread.isPinned ?? false,
				workflowId: thread.workflowId,
				messages: [],
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
		}, `getThread(${userId}, ${threadId})`);
	}

	public async createThread(
		type: ThreadType,
		userId: string,
		threadId: string,
		title: string,
		workflowId?: string,
	): Promise<ThreadObject> {
		return this.executeWithRetry(async () => {
			await ThreadModel.create({
				type,
				userId,
				threadId,
				title,
				workflowId,
			});

			return { type, userId, threadId, title, workflowId, messages: [] };
		}, `createThread(${userId}, ${threadId})`);
	}

	public async addMessagesToThread(
		userId: string,
		threadId: string,
		messages: MessageObject[],
	): Promise<void> {
		return this.executeWithRetry(async () => {
			// Touch the thread first: if it does not exist, fail loudly instead of
			// silently writing orphaned messages.
			const result = await ThreadModel.updateOne(
				{ threadId, userId },
				{ $set: { updatedAt: new Date() } },
			);
			if (result.matchedCount === 0) {
				throw new Error(`Thread not found: ${threadId}`);
			}

			if (messages.length > 0) {
				const messageIds = messages.map((m) => m.messageId);
				await MessageModel.deleteMany({
					threadId,
					userId,
					messageId: { $in: messageIds },
				});
				await MessageModel.insertMany(
					messages.map((message) => ({
						threadId,
						messageId: message.messageId,
						userId,
						role: message.role,
						content: message.content,
						timestamp: message.timestamp,
						metadata: message.metadata,
					})),
				);
			}
		}, `addMessagesToThread(${userId}, ${threadId})`);
	}

	public async deleteThread(userId: string, threadId: string): Promise<void> {
		return this.executeWithRetry(async () => {
			const timeout = this.getOperationTimeout();

			// Delete all messages for this thread
			await MessageModel.deleteMany({ userId, threadId }).maxTimeMS(timeout);

			// Delete the thread itself
			await ThreadModel.deleteOne({ userId, threadId }).maxTimeMS(timeout);
		}, `deleteThread(${userId}, ${threadId})`);
	}

	public async listThreads(
		userId: string,
		filter?: ThreadFilter,
	): Promise<ThreadMetadata[]> {
		return this.executeWithRetry(async () => {
			const timeout = this.getOperationTimeout();
			const query: Record<string, any> = { userId };
			// Accept only string filter values: Express qs parsing can turn
			// ?workflowId[$ne]=x into an operator object.
			if (typeof filter?.workflowId === "string")
				query.workflowId = filter.workflowId;
			if (typeof filter?.type === "string") query.type = filter.type;
			const threads = await ThreadModel.find(query)
				.sort({ updatedAt: -1 })
				.maxTimeMS(timeout);
			const data: ThreadMetadata[] = threads.map((thread: ThreadDocument) => {
				return {
					type: thread.type,
					userId,
					threadId: thread.threadId,
					title: thread.title,
					isPinned: thread.isPinned ?? false,
					workflowId: thread.workflowId,
					createdAt: thread.createdAt?.toISOString(),
					updatedAt: thread.updatedAt?.toISOString(),
				} as ThreadMetadata;
			});
			return data;
		}, `listThreads(${userId})`);
	}

	public async updateThreadPin(
		userId: string,
		threadId: string,
		isPinned: boolean,
	): Promise<void> {
		return this.executeWithRetry(async () => {
			const timeout = this.getOperationTimeout();
			const result = await ThreadModel.updateOne(
				{ threadId, userId },
				{ $set: { isPinned } },
			).maxTimeMS(timeout);
			if (result.matchedCount === 0) {
				throw new Error(`Thread not found: ${threadId}`);
			}
		}, `updateThreadPin(${userId}, ${threadId})`);
	}
}
