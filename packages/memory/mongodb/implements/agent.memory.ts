import { IAgentMemory } from "@ainetwork/adk/modules";
import { AgentModel } from "../models/agent.model";

export type ExecuteWithRetryFn = <T>(
  operation: () => Promise<T>,
  operationName?: string
) => Promise<T>;

export type GetOperationTimeoutFn = () => number;

type AgentMetadata = {
  agent_prompt: string;
}

export class MongoDBAgent implements IAgentMemory {
  private executeWithRetry: ExecuteWithRetryFn;
  private getOperationTimeout: GetOperationTimeoutFn;

  constructor(
    executeWithRetry: ExecuteWithRetryFn,
    getOperationTimeout: GetOperationTimeoutFn
  ) {
    this.executeWithRetry = executeWithRetry;
    this.getOperationTimeout = getOperationTimeout;
  }

  public async getAgentPrompt(): Promise<string> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const metadata = await AgentModel.findOne({
        id: "agent_metadata"
      }).maxTimeMS(timeout)
        .lean<AgentMetadata>();
      return metadata?.agent_prompt || "";
    }, "getAgentPrompt()");
  };
  
  public async updateAgentPrompt(prompt: string): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await AgentModel.updateOne({
        id: "agent_metadata",
      }, { "agent_prompt": prompt }).maxTimeMS(timeout);
    }, "updateAgentPrompt()");
  };
}
