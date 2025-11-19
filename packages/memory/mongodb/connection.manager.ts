import mongoose from "mongoose";
import { loggers } from "@ainetwork/adk/utils/logger";

export interface ConnectionManagerConfig {
  uri: string;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  maxPoolSize?: number;
  serverSelectionTimeoutMS?: number;
  socketTimeoutMS?: number;
  connectTimeoutMS?: number;
}

export class MongoDBConnectionManager {
  private static instance: MongoDBConnectionManager;
  private uri: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private reconnectInterval: number;
  private reconnecting: boolean = false;
  private connectionConfig: mongoose.ConnectOptions;

  private constructor(config: ConnectionManagerConfig) {
    this.uri = config.uri;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
    this.reconnectInterval = config.reconnectInterval ?? 5000;
    this.connectionConfig = {
      maxPoolSize: config.maxPoolSize ?? 1,
      serverSelectionTimeoutMS: config.serverSelectionTimeoutMS ?? 30000,
      socketTimeoutMS: config.socketTimeoutMS ?? 45000,
      connectTimeoutMS: config.connectTimeoutMS ?? 30000,
      bufferCommands: false,
    };

    this.setupMongooseEventListeners();
  }

  public static getInstance(config?: ConnectionManagerConfig): MongoDBConnectionManager {
    if (!MongoDBConnectionManager.instance) {
      if (!config) {
        throw new Error("ConnectionManagerConfig is required for first initialization");
      }
      MongoDBConnectionManager.instance = new MongoDBConnectionManager(config);
    }
    return MongoDBConnectionManager.instance;
  }

  private setupMongooseEventListeners(): void {
    mongoose.connection.on("connected", () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnecting = false;
      loggers.agent.info("MongoDB connected successfully");
    });

    mongoose.connection.on("disconnected", () => {
      this.isConnected = false;
      loggers.agent.warn("MongoDB disconnected");
      this.handleDisconnection();
    });

    mongoose.connection.on("error", (error) => {
      this.isConnected = false;
      loggers.agent.error("MongoDB connection error:", error);
      this.handleDisconnection();
    });

    mongoose.connection.on("reconnected", () => {
      this.isConnected = true;
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
        this.isConnected = true;
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
    if (this.isConnected) {
      return;
    }

    try {
      await mongoose.connect(this.uri, this.connectionConfig);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      loggers.agent.info("MongoDB connected successfully");
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
      this.isConnected = false;
      loggers.agent.info("MongoDB disconnected successfully");
    } catch (error) {
      loggers.agent.error("Failed to disconnect from MongoDB:", error);
      throw error;
    }
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public async ensureConnection(): Promise<void> {
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
   * Wraps a database operation with automatic reconnection handling
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = "Database operation"
  ): Promise<T> {
    await this.ensureConnection();

    try {
      return await operation();
    } catch (error: any) {
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
        } catch (retryError) {
          loggers.agent.error(`${operationName} failed after retry:`, retryError);
          throw retryError;
        }
      }

      // If it's not a connection error, just throw it
      throw error;
    }
  }
}
