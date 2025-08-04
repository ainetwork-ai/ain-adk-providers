import { IMemory } from "node_modules/@ainetwork/adk/dist/esm/modules/memory/base.memory";
import mongoose, { Mongoose } from "mongoose";
import { loggers } from "@ainetwork/adk/utils/logger";

export class MongoDBMemory implements IMemory {
  private _isConnected: boolean = false;
  private _uri: string;
  private _mongoose: Mongoose;

  constructor(uri: string) {
    this._uri = uri;
    this._mongoose = new Mongoose();
  }

  public getInstance(): Mongoose {
    return this._mongoose;
  }

  public async connect(): Promise<void> {
		if (this._isConnected) {
			return;
		}

		try {
      await this._mongoose.connect(this._uri);
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
			await this._mongoose?.disconnect();
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