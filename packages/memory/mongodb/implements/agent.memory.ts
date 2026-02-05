import { IAgentMemory } from "@ainetwork/adk/modules";
import { AgentModel } from "../models/agent.model";

export type ExecuteWithRetryFn = <T>(
  operation: () => Promise<T>,
  operationName?: string
) => Promise<T>;

export type GetOperationTimeoutFn = () => number;

type PromptDocument = {
  id: string;
  prompt: string;
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
        id: "agent_prompt"
      }).maxTimeMS(timeout)
        .lean<PromptDocument>();
      return metadata?.prompt || "";
    }, "getAgentPrompt()");
  };
  
  public async updateAgentPrompt(prompt: string): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await AgentModel.updateOne({
        id: "agent_prompt",
      }, { "prompt": prompt }, { upsert: true }).maxTimeMS(timeout);
    }, "updateAgentPrompt()");
  };

  public async getAggregatePrompt(): Promise<string> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const metadata = await AgentModel.findOne({
        id: "aggregate_prompt"
      }).maxTimeMS(timeout)
        .lean<PromptDocument>();
      return metadata?.prompt || "";
    }, "getAggregatePrompt()");
  };

  public async getGenerateTitlePrompt(): Promise<string> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const metadata = await AgentModel.findOne({
        id: "generate_title_prompt"
      }).maxTimeMS(timeout)
        .lean<PromptDocument>();
      return metadata?.prompt || "";
    }, "getGenerateTitlePrompt()");
  };

  public async getSingleTriggerPrompt(): Promise<string> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const metadata = await AgentModel.findOne({
        id: "single_trigger_prompt"
      }).maxTimeMS(timeout)
        .lean<PromptDocument>();
      return metadata?.prompt || "";
    }, "getSingleTriggerPrompt()");
  };

  public async getMultiTriggerPrompt(): Promise<string> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const metadata = await AgentModel.findOne({
        id: "multi_trigger_prompt"
      }).maxTimeMS(timeout)
        .lean<PromptDocument>();
      return metadata?.prompt || "";
    }, "getMultiTriggerPrompt()");
  };

  public async getToolSelectPrompt(): Promise<string> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const metadata = await AgentModel.findOne({
        id: "tool_select_prompt"
      }).maxTimeMS(timeout)
        .lean<PromptDocument>();
      return metadata?.prompt || "";
    }, "getToolSelectPrompt()");
  };
}
