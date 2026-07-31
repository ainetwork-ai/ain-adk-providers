import type {
	IAgentMemory,
	IDocumentMemory,
	IIntentMemory,
	IMemory,
	IScheduleRunMemory,
	IThreadMemory,
	IUserWorkflowMemory,
	IWorkflowTemplateMemory,
} from "@ainetwork/adk/modules";
import { loggers } from "@ainetwork/adk/utils/logger";
import mongoose from "mongoose";
import { MessageModel } from "../models/messages.model";
import { MongoDBAgent } from "./agent.memory";
import { MongoDBDocument } from "./document.memory";
import { MongoDBIntent } from "./intent.memory";
import { MongoDBScheduleRun } from "./schedule-run.memory";
import { MongoDBThread } from "./thread.memory";
import { isTransientMongoError } from "./transient-error";
import { MongoDBUserWorkflow } from "./user-workflow.memory";
import { MongoDBWorkflowTemplate } from "./workflow-template.memory";

export interface MongoDBMemoryConfig {
	uri: string;
	maxReconnectAttempts?: number;
	reconnectInterval?: number;
	maxPoolSize?: number;
	serverSelectionTimeoutMS?: number;
	socketTimeoutMS?: number;
	connectTimeoutMS?: number;
	waitQueueTimeoutMS?: number; // Max time an operation waits for a pooled connection
	operationTimeoutMS?: number; // Timeout for database operations
	threadTTLSeconds?: number; // TTL for thread documents (in seconds). Orphaned messages are periodically cleaned up.
}

// Operations slower than this are logged at warn level so pool-exhaustion
// stalls become visible instead of silently queueing.
const SLOW_OPERATION_WARN_MS = 5_000;

// Orphaned-message cleanup processes at most this many distinct threadIds per
// batch, and at most MAX_CLEANUP_BATCHES_PER_RUN batches per timer tick, so a
// single run's work stays bounded regardless of collection size.
const CLEANUP_BATCH_SIZE = 500;
const MAX_CLEANUP_BATCHES_PER_RUN = 20;

export class MongoDBMemory implements IMemory {
	private static instance: MongoDBMemory;
	private uri: string;
	private connected = false;
	private reconnectAttempts = 0;
	private maxReconnectAttempts: number;
	private reconnectInterval: number;
	private reconnecting = false;
	private intentionalDisconnect = false;
	private connectionConfig: mongoose.ConnectOptions;
	private eventListenersSetup = false;
	private operationTimeoutMS: number;
	private threadTTLSeconds?: number;
	private orphanCleanupTimer?: ReturnType<typeof setInterval>;

	private agentMemory: MongoDBAgent;
	private intentMemory: MongoDBIntent;
	private threadMemory: MongoDBThread;
	private workflowTemplateMemory: MongoDBWorkflowTemplate;
	private userWorkflowMemory: MongoDBUserWorkflow;
	private documentMemory: MongoDBDocument;
	private scheduleRunMemory: MongoDBScheduleRun;

	constructor(config: string | MongoDBMemoryConfig) {
		const cfg = typeof config === "string" ? { uri: config } : config;

		this.uri = cfg.uri;
		this.maxReconnectAttempts = cfg.maxReconnectAttempts ?? 5;
		this.reconnectInterval = cfg.reconnectInterval ?? 5000;
		this.operationTimeoutMS = cfg.operationTimeoutMS ?? 10000; // Default 10 seconds
		if (cfg.threadTTLSeconds !== undefined && cfg.threadTTLSeconds > 0) {
			this.threadTTLSeconds = cfg.threadTTLSeconds;
		}
		this.connectionConfig = {
			maxPoolSize: cfg.maxPoolSize ?? 10,
			minPoolSize: 0,
			maxIdleTimeMS: 30000,
			serverSelectionTimeoutMS: cfg.serverSelectionTimeoutMS ?? 30000,
			socketTimeoutMS: cfg.socketTimeoutMS ?? 45000,
			connectTimeoutMS: cfg.connectTimeoutMS ?? 30000,
			waitQueueTimeoutMS: cfg.waitQueueTimeoutMS ?? 10_000,
			bufferCommands: false,
		};

		if (!MongoDBMemory.instance) {
			MongoDBMemory.instance = this;
			this.setupMongooseEventListeners();
		} else {
			// Use existing instance's connection state
			this.connected = MongoDBMemory.instance.connected;
			this.operationTimeoutMS = MongoDBMemory.instance.operationTimeoutMS;
		}

		this.agentMemory = new MongoDBAgent(
			this.executeWithRetry.bind(this),
			this.getOperationTimeout.bind(this),
		);

		this.threadMemory = new MongoDBThread(
			this.executeWithRetry.bind(this),
			this.getOperationTimeout.bind(this),
		);

		this.intentMemory = new MongoDBIntent(
			this.executeWithRetry.bind(this),
			this.getOperationTimeout.bind(this),
		);

		this.workflowTemplateMemory = new MongoDBWorkflowTemplate(
			this.executeWithRetry.bind(this),
			this.getOperationTimeout.bind(this),
		);

		this.userWorkflowMemory = new MongoDBUserWorkflow(
			this.executeWithRetry.bind(this),
			this.getOperationTimeout.bind(this),
		);

		this.documentMemory = new MongoDBDocument(
			this.executeWithRetry.bind(this),
			this.getOperationTimeout.bind(this),
		);

		this.scheduleRunMemory = new MongoDBScheduleRun(
			this.executeWithRetry.bind(this),
			this.getOperationTimeout.bind(this),
		);
	}

	public getAgentMemory(): IAgentMemory {
		return this.agentMemory;
	}

	public getThreadMemory(): IThreadMemory {
		return this.threadMemory;
	}

	public getIntentMemory(): IIntentMemory {
		return this.intentMemory;
	}

	public getWorkflowTemplateMemory(): IWorkflowTemplateMemory {
		return this.workflowTemplateMemory;
	}

	public getUserWorkflowMemory(): IUserWorkflowMemory {
		return this.userWorkflowMemory;
	}

	public getDocumentMemory(): IDocumentMemory {
		return this.documentMemory;
	}

	public getScheduleRunMemory(): IScheduleRunMemory {
		return this.scheduleRunMemory;
	}

	private setupMongooseEventListeners(): void {
		if (this.eventListenersSetup) return;

		this.eventListenersSetup = true;

		mongoose.connection.on("connected", () => {
			this.connected = true;
			this.reconnectAttempts = 0;
			this.reconnecting = false;
			loggers.agent.info("MongoDB connected successfully");
		});

		mongoose.connection.on("disconnected", () => {
			this.connected = false;
			if (this.intentionalDisconnect) {
				loggers.agent.info(
					"MongoDB disconnected (intentional shutdown, skipping reconnect)",
				);
				return;
			}
			loggers.agent.warn("MongoDB disconnected");
			this.handleDisconnection();
		});

		mongoose.connection.on("error", (error) => {
			this.connected = false;
			loggers.agent.error("MongoDB connection error:", error);
			if (this.intentionalDisconnect) {
				return;
			}
			this.handleDisconnection();
		});

		mongoose.connection.on("reconnected", () => {
			this.connected = true;
			this.reconnectAttempts = 0;
			this.reconnecting = false;
			loggers.agent.info("MongoDB reconnected successfully");
		});
	}

	private async handleDisconnection(): Promise<void> {
		if (this.reconnecting) {
			return;
		}

		this.reconnecting = true;

		while (
			this.reconnectAttempts < this.maxReconnectAttempts &&
			!this.connected
		) {
			this.reconnectAttempts++;
			loggers.agent.info(
				`Attempting to reconnect to MongoDB (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
			);

			try {
				await mongoose.connect(this.uri, this.connectionConfig);
				this.connected = true;
				this.reconnectAttempts = 0;
				this.reconnecting = false;
				loggers.agent.info("MongoDB reconnection successful");
				return;
			} catch (error) {
				loggers.agent.error(
					`Reconnection attempt ${this.reconnectAttempts} failed:`,
					error,
				);

				if (this.reconnectAttempts < this.maxReconnectAttempts) {
					await new Promise((resolve) =>
						setTimeout(resolve, this.reconnectInterval),
					);
				}
			}
		}

		this.reconnecting = false;

		if (!this.connected) {
			loggers.agent.error(
				`Failed to reconnect to MongoDB after ${this.maxReconnectAttempts} attempts`,
			);
		}
	}

	public async connect(): Promise<void> {
		if (this.connected) {
			return;
		}

		try {
			this.intentionalDisconnect = false;
			await mongoose.connect(this.uri, this.connectionConfig);
			this.connected = true;
			this.reconnectAttempts = 0;
			await this.setupTTLIndex();
			this.startOrphanCleanup();
		} catch (error) {
			loggers.agent.error("Failed to connect to MongoDB:", error);
			throw error;
		}
	}

	public async disconnect(): Promise<void> {
		if (!this.connected) {
			return;
		}

		try {
			if (this.orphanCleanupTimer) {
				clearInterval(this.orphanCleanupTimer);
				this.orphanCleanupTimer = undefined;
			}
			// Mark this disconnect as intentional so the "disconnected" event
			// handler does not start the reconnect loop during graceful shutdown.
			this.intentionalDisconnect = true;
			await mongoose.disconnect();
			this.connected = false;
		} catch (error) {
			loggers.agent.error("Failed to disconnect from MongoDB:", error);
			throw error;
		}
	}

	public isConnected(): boolean {
		return this.connected;
	}

	private async ensureConnection(): Promise<void> {
		if (!this.connected && !this.reconnecting) {
			await this.connect();
		}

		// Wait for reconnection if in progress
		const maxWaitTime = 30000; // 30 seconds
		const startTime = Date.now();
		while (this.reconnecting && Date.now() - startTime < maxWaitTime) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (!this.connected) {
			throw new Error("MongoDB is not connected and reconnection failed");
		}
	}

	private async setupTTLIndex(): Promise<void> {
		if (this.threadTTLSeconds === undefined) return;

		try {
			const db = mongoose.connection.db;
			if (!db) return;

			const collection = db.collection("threads");
			const indexes = await collection.indexes();
			const existingTTL = indexes.find(
				(idx) =>
					idx.key?.updatedAt !== undefined &&
					idx.expireAfterSeconds !== undefined,
			);

			if (existingTTL) {
				if (existingTTL.expireAfterSeconds !== this.threadTTLSeconds) {
					await db.command({
						collMod: "threads",
						index: {
							keyPattern: { updatedAt: 1 },
							expireAfterSeconds: this.threadTTLSeconds,
						},
					});
					loggers.agent.info(
						`Thread TTL index updated to ${this.threadTTLSeconds} seconds`,
					);
				}
			} else {
				await collection.createIndex(
					{ updatedAt: 1 },
					{ expireAfterSeconds: this.threadTTLSeconds },
				);
				loggers.agent.info(
					`Thread TTL index created with ${this.threadTTLSeconds} seconds`,
				);
			}
		} catch (error) {
			loggers.agent.error("Failed to setup TTL index:", error);
		}
	}

	private startOrphanCleanup(): void {
		if (this.threadTTLSeconds === undefined) return;
		if (this.orphanCleanupTimer) return;

		// Run cleanup at half the TTL interval, with a minimum of 60s and maximum of 1 hour
		const intervalMs = Math.max(
			60_000,
			Math.min(this.threadTTLSeconds * 500, 3_600_000),
		);
		this.orphanCleanupTimer = setInterval(() => {
			this.cleanupOrphanedMessages().catch((error) => {
				loggers.agent.error("Orphaned message cleanup failed:", error);
			});
		}, intervalMs);

		loggers.agent.info(
			`Orphaned message cleanup scheduled every ${Math.round(intervalMs / 1000)}s`,
		);
	}

	private async cleanupOrphanedMessages(): Promise<void> {
		if (!this.connected) return;

		try {
			const db = mongoose.connection.db;
			if (!db) return;

			// Walk distinct threadIds referenced by messages in bounded, keyset-
			// paginated batches instead of a single distinct() (16MB cap) plus an
			// unbounded $nin scan. Per-run work is capped; the next timer tick
			// continues where remaining work exists.
			let lastThreadId: string | undefined;
			let totalDeleted = 0;

			for (let batch = 0; batch < MAX_CLEANUP_BATCHES_PER_RUN; batch++) {
				const pipeline: mongoose.PipelineStage[] = [];
				if (lastThreadId !== undefined) {
					pipeline.push({ $match: { threadId: { $gt: lastThreadId } } });
				}
				pipeline.push(
					{ $group: { _id: "$threadId" } },
					{ $sort: { _id: 1 } },
					{ $limit: CLEANUP_BATCH_SIZE },
				);
				const groups = await MessageModel.aggregate<{ _id: string }>(pipeline);
				if (groups.length === 0) break;

				const threadIds = groups.map((group) => group._id);
				const existing = await db
					.collection("threads")
					.find(
						{ threadId: { $in: threadIds } },
						{ projection: { threadId: 1 } },
					)
					.toArray();
				const existingSet = new Set(
					existing.map((thread) => thread.threadId as string),
				);
				const orphanedIds = threadIds.filter(
					(threadId) => !existingSet.has(threadId),
				);

				if (orphanedIds.length > 0) {
					const result = await MessageModel.deleteMany({
						threadId: { $in: orphanedIds },
					});
					totalDeleted += result.deletedCount ?? 0;
				}

				lastThreadId = threadIds[threadIds.length - 1];
				if (groups.length < CLEANUP_BATCH_SIZE) break;
			}

			if (totalDeleted > 0) {
				loggers.agent.info(`Cleaned up ${totalDeleted} orphaned messages`);
			}
		} catch (error) {
			loggers.agent.error("Failed to cleanup orphaned messages:", error);
		}
	}

	/**
	 * Get the operation timeout in milliseconds
	 */
	protected getOperationTimeout(): number {
		return this.operationTimeoutMS;
	}

	/**
	 * Execute a database operation with automatic retry on connection errors
	 * Note: Use mongoose's maxTimeMS option in queries for timeout control
	 */
	protected async executeWithRetry<T>(
		operation: () => Promise<T>,
		operationName = "Database operation",
	): Promise<T> {
		const startedAt = Date.now();
		loggers.agent.debug(`${operationName} started`);

		try {
			await this.ensureConnection();

			try {
				return await operation();
			} catch (error: any) {
				// Check if it's a timeout error from MongoDB
				if (
					error.code === 50 ||
					error.message?.includes("operation exceeded time limit")
				) {
					loggers.agent.error(`${operationName} exceeded time limit`);
					throw error;
				}

				// Check if it's a TooManyLogicalSessions error
				if (error.code === 261 || error.codeName === "TooManyLogicalSessions") {
					// This tears down the SHARED mongoose connection while other
					// operations may be in flight — it must never happen silently.
					loggers.agent.error(
						`${operationName} failed with TooManyLogicalSessions (code 261); ` +
							"tearing down the shared MongoDB connection to release sessions. " +
							"In-flight operations will fail until reconnection completes.",
					);

					try {
						// Deliberately NOT an intentional shutdown: intentionalDisconnect
						// stays false so the reconnect path keeps working.
						await mongoose.disconnect();
						this.connected = false;
					} catch (disconnectError) {
						loggers.agent.error(
							"Failed to disconnect during session cleanup:",
							disconnectError,
						);
					}

					await new Promise((resolve) => setTimeout(resolve, 5000));
					await this.ensureConnection();

					try {
						return await operation();
					} catch (retryError: any) {
						loggers.agent.error(
							`${operationName} failed after session cleanup retry:`,
							retryError,
						);
						throw retryError;
					}
				}

				// Retry only genuinely transient failures (network errors and errors
				// the server labels retryable). Duplicate-key, validation and auth
				// errors must surface immediately — retrying re-runs non-idempotent
				// writes and masks real errors.
				if (isTransientMongoError(error)) {
					loggers.agent.warn(
						`${operationName} failed with transient error (${error.name}), attempting reconnection and retry...`,
					);

					await this.ensureConnection();

					// Retry the operation once after reconnection
					try {
						return await operation();
					} catch (retryError: any) {
						loggers.agent.error(
							`${operationName} failed after retry:`,
							retryError,
						);
						throw retryError;
					}
				}

				// If it's not a transient error, just throw it
				throw error;
			}
		} finally {
			const durationMs = Date.now() - startedAt;
			if (durationMs >= SLOW_OPERATION_WARN_MS) {
				loggers.agent.warn(
					`${operationName} slow: durationMs=${durationMs} (threshold ${SLOW_OPERATION_WARN_MS}ms)`,
				);
			}
		}
	}
}
