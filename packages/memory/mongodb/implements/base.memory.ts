import { IMemory } from "node_modules/@ainetwork/adk/dist/esm/modules/memory/base.memory";
import mongoose from "mongoose";
import { loggers } from "@ainetwork/adk/utils/logger";

export class MongoDBMemory implements IMemory {
  private _isConnected: boolean = false;
  private _uri: string;

  constructor(uri: string) {
    this._uri = uri;
  }

  public async connect(): Promise<void> {
		if (this._isConnected) {
			return;
		}

		try {
      await mongoose.connect(this._uri, {
        maxPoolSize: 1,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 30000,
        bufferCommands: false,
      });
			this._isConnected = true;
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
			this._isConnected = false;
			loggers.agent.info("MongoDB disconnected successfully");
		} catch (error) {
			loggers.agent.error("Failed to disconnect from MongoDB:", error);
			throw error;
		}
  }

  public isConnected(): boolean {
    return this._isConnected;
  }
}