import { IAgentMemory, IIntentMemory, IMemory, IThreadMemory, IWorkflowMemory } from "@ainetwork/adk/modules";
import mongoose from "mongoose";
import { loggers } from "@ainetwork/adk/utils/logger";
import { MongoDBAgent } from "./agent.memory";
import { MongoDBIntent } from "./intent.memory";
import { MongoDBThread } from "./thread.memory";
import { MongoDBWorkflow } from "./workflow.memory";

export interface MongoDBMemoryConfig {
  uri: string;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  maxPoolSize?: number;
  serverSelectionTimeoutMS?: number;
  socketTimeoutMS?: number;
  connectTimeoutMS?: number;
  operationTimeoutMS?: number; // Timeout for database operations
}

export class MongoDBMemory implements IMemory {
  private static instance: MongoDBMemory;
  private uri: string;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private reconnectInterval: number;
  private reconnecting: boolean = false;
  private connectionConfig: mongoose.ConnectOptions;
  private eventListenersSetup: boolean = false;
  private operationTimeoutMS: number;

  private agentMemory: MongoDBAgent;
  private intentMemory: MongoDBIntent;
  private threadMemory: MongoDBThread;
  private workflowMemory: MongoDBWorkflow;

  constructor(config: string | MongoDBMemoryConfig) {
    const cfg = typeof config === 'string' ? { uri: config } : config;

    this.uri = cfg.uri;
    this.maxReconnectAttempts = cfg.maxReconnectAttempts ?? 5;
    this.reconnectInterval = cfg.reconnectInterval ?? 5000;
    this.operationTimeoutMS = cfg.operationTimeoutMS ?? 10000; // Default 10 seconds
    this.connectionConfig = {
      maxPoolSize: cfg.maxPoolSize ?? 1,
      serverSelectionTimeoutMS: cfg.serverSelectionTimeoutMS ?? 30000,
      socketTimeoutMS: cfg.socketTimeoutMS ?? 45000,
      connectTimeoutMS: cfg.connectTimeoutMS ?? 30000,
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
			this.getOperationTimeout.bind(this)
		);

		this.threadMemory = new MongoDBThread(
			this.executeWithRetry.bind(this),
			this.getOperationTimeout.bind(this)
		);

		this.intentMemory = new MongoDBIntent(
			this.executeWithRetry.bind(this),
			this.getOperationTimeout.bind(this)
		);

		this.workflowMemory = new MongoDBWorkflow(
			this.executeWithRetry.bind(this),
			this.getOperationTimeout.bind(this)
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

  public getWorkflowMemory(): IWorkflowMemory {
    return this.workflowMemory;
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
      loggers.agent.warn("MongoDB disconnected");
      this.handleDisconnection();
    });

    mongoose.connection.on("error", (error) => {
      this.connected = false;
      loggers.agent.error("MongoDB connection error:", error);
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

    while (this.reconnectAttempts < this.maxReconnectAttempts && !this.isConnected) {
      this.reconnectAttempts++;
      loggers.agent.info(
        `Attempting to reconnect to MongoDB (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
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
          error
        );

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.reconnectInterval)
          );
        }
      }
    }

    this.reconnecting = false;

    if (!this.isConnected) {
      loggers.agent.error(
        `Failed to reconnect to MongoDB after ${this.maxReconnectAttempts} attempts`
      );
    }
  }

  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await mongoose.connect(this.uri, this.connectionConfig);
      this.connected = true;
      this.reconnectAttempts = 0;
    } catch (error) {
      loggers.agent.error("Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
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
    if (!this.isConnected && !this.reconnecting) {
      await this.connect();
    }

    // Wait for reconnection if in progress
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    while (this.reconnecting && Date.now() - startTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!this.isConnected) {
      throw new Error("MongoDB is not connected and reconnection failed");
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
    operationName: string = "Database operation"
  ): Promise<T> {
    await this.ensureConnection();

    try {
      return await operation();
    } catch (error: any) {
      // Check if it's a timeout error from MongoDB
      if (error.code === 50 || error.message?.includes("operation exceeded time limit")) {
        loggers.agent.error(`${operationName} exceeded time limit`);
        throw error;
      }

      // Check if it's a connection-related error
      if (
        error.name === "MongoNetworkError" ||
        error.name === "MongoServerError" ||
        error.message?.includes("connection") ||
        error.message?.includes("disconnect")
      ) {
        loggers.agent.warn(
          `${operationName} failed due to connection issue, attempting reconnection...`
        );

        await this.ensureConnection();

        // Retry the operation once after reconnection
        try {
          return await operation();
        } catch (retryError: any) {
          loggers.agent.error(`${operationName} failed after retry:`, retryError);
          throw retryError;
        }
      }

      // If it's not a connection error, just throw it
      throw error;
    }
  }
}
