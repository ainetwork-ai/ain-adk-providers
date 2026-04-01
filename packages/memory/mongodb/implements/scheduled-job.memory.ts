import type { IScheduledJobMemory } from "@ainetwork/adk/modules";
import type { ScheduledJob } from "@ainetwork/adk/types/memory";
import { ScheduledJobModel } from "../models/scheduled-job.model";

export type ExecuteWithRetryFn = <T>(
  operation: () => Promise<T>,
  operationName?: string
) => Promise<T>;

export type GetOperationTimeoutFn = () => number;

export class MongoDBScheduledJob implements IScheduledJobMemory {
  private executeWithRetry: ExecuteWithRetryFn;
  private getOperationTimeout: GetOperationTimeoutFn;

  constructor(
    executeWithRetry: ExecuteWithRetryFn,
    getOperationTimeout: GetOperationTimeoutFn
  ) {
    this.executeWithRetry = executeWithRetry;
    this.getOperationTimeout = getOperationTimeout;
  }

  public async createScheduledJob(job: ScheduledJob): Promise<ScheduledJob> {
    return this.executeWithRetry(async () => {
      const created = await ScheduledJobModel.create(job);
      return created.toObject() as ScheduledJob;
    }, "createScheduledJob()");
  }

  public async getScheduledJob(jobId: string): Promise<ScheduledJob | undefined> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const job = await ScheduledJobModel.findOne({ jobId })
        .maxTimeMS(timeout)
        .lean<ScheduledJob>();
      return job || undefined;
    }, "getScheduledJob()");
  }

  public async updateScheduledJob(jobId: string, updates: Partial<ScheduledJob>): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await ScheduledJobModel.updateOne(
        { jobId },
        { $set: updates }
      ).maxTimeMS(timeout);
    }, "updateScheduledJob()");
  }

  public async deleteScheduledJob(jobId: string, userId: string): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await ScheduledJobModel.deleteOne({ jobId, userId }).maxTimeMS(timeout);
    }, "deleteScheduledJob()");
  }

  public async listScheduledJobs(userId?: string): Promise<ScheduledJob[]> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const query = userId ? { userId } : {};
      const jobs = await ScheduledJobModel.find(query)
        .maxTimeMS(timeout)
        .lean<ScheduledJob[]>();
      return jobs;
    }, "listScheduledJobs()");
  }

  public async listActiveScheduledJobs(): Promise<ScheduledJob[]> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const jobs = await ScheduledJobModel.find({ active: true })
        .maxTimeMS(timeout)
        .lean<ScheduledJob[]>();
      return jobs;
    }, "listActiveScheduledJobs()");
  }
}
