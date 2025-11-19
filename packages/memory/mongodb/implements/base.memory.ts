import { IMemory } from "node_modules/@ainetwork/adk/dist/esm/modules/memory/base.memory";
import { MongoDBConnectionManager } from "../connection.manager";

export class MongoDBMemory implements IMemory {
  protected connectionManager: MongoDBConnectionManager;

  constructor(uri: string) {
    this.connectionManager = MongoDBConnectionManager.getInstance({ uri });
  }

  public async connect(): Promise<void> {
    await this.connectionManager.connect();
  }

  public async disconnect(): Promise<void> {
    await this.connectionManager.disconnect();
  }

  public isConnected(): boolean {
    return this.connectionManager.getIsConnected();
  }

  /**
   * Execute a database operation with automatic retry on connection errors
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    return this.connectionManager.executeWithRetry(operation, operationName);
  }
}
