import type { IScheduleRunMemory } from "@ainetwork/adk/modules";
import type {
  ScheduleRun,
  ScheduleRunFilter,
} from "@ainetwork/adk/types/schedule";
import { ScheduleRunModel } from "../models/schedule-run.model";
import type {
  ExecuteWithRetryFn,
  GetOperationTimeoutFn,
} from "./document.memory";

export class MongoDBScheduleRun implements IScheduleRunMemory {
  private executeWithRetry: ExecuteWithRetryFn;
  private getOperationTimeout: GetOperationTimeoutFn;

  constructor(
    executeWithRetry: ExecuteWithRetryFn,
    getOperationTimeout: GetOperationTimeoutFn
  ) {
    this.executeWithRetry = executeWithRetry;
    this.getOperationTimeout = getOperationTimeout;
  }

  public async createScheduleRun(run: ScheduleRun): Promise<void> {
    return this.executeWithRetry(async () => {
      await ScheduleRunModel.create(run);
    }, "createScheduleRun()");
  }

  public async updateScheduleRun(
    runId: string,
    patch: Partial<ScheduleRun>
  ): Promise<void> {
    const { runId: _runId, ...mutable } = patch;
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await ScheduleRunModel.updateOne({ runId }, { $set: mutable }).maxTimeMS(
        timeout
      );
    }, "updateScheduleRun()");
  }

  public async listScheduleRuns(
    filter?: ScheduleRunFilter,
    limit = 20
  ): Promise<ScheduleRun[]> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const query: Record<string, unknown> = {};
      if (filter?.jobType) query.jobType = filter.jobType;
      if (filter?.jobKey) query.jobKey = filter.jobKey;
      if (filter?.status) query.status = filter.status;
      return await ScheduleRunModel.find(query)
        .sort({ startedAt: -1 })
        .limit(limit)
        .maxTimeMS(timeout)
        .lean<ScheduleRun[]>();
    }, "listScheduleRuns()");
  }

  public async failInterruptedRuns(): Promise<number> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const result = await ScheduleRunModel.updateMany(
        { status: "running" },
        {
          $set: {
            status: "failed",
            error: "interrupted",
            finishedAt: Date.now(),
          },
        }
      ).maxTimeMS(timeout);
      return result.modifiedCount ?? 0;
    }, "failInterruptedRuns()");
  }
}
