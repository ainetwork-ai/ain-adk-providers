import { IScheduledJobMemory } from "@ainetwork/adk/modules";
import type { ScheduledJob } from "@ainetwork/adk/types/memory";

export class InMemoryScheduledJob implements IScheduledJobMemory {
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private userJobIndex: Map<string, Set<string>> = new Map();

  public async createScheduledJob(job: ScheduledJob): Promise<ScheduledJob> {
    this.scheduledJobs.set(job.jobId, job);

    if (!this.userJobIndex.has(job.userId)) {
      this.userJobIndex.set(job.userId, new Set());
    }
    this.userJobIndex.get(job.userId)?.add(job.jobId);

    return job;
  }

  public async getScheduledJob(jobId: string): Promise<ScheduledJob | undefined> {
    return this.scheduledJobs.get(jobId);
  }

  public async updateScheduledJob(jobId: string, updates: Partial<ScheduledJob>): Promise<void> {
    const existing = this.scheduledJobs.get(jobId);
    if (!existing) {
      throw new Error(`ScheduledJob not found: ${jobId}`);
    }

    const updated = { ...existing, ...updates, jobId };
    this.scheduledJobs.set(jobId, updated);
  }

  public async deleteScheduledJob(jobId: string, userId: string): Promise<void> {
    const job = this.scheduledJobs.get(jobId);
    if (job && job.userId === userId) {
      this.scheduledJobs.delete(jobId);
      this.userJobIndex.get(userId)?.delete(jobId);
    }
  }

  public async listScheduledJobs(userId?: string): Promise<ScheduledJob[]> {
    if (userId) {
      const userJobIds = this.userJobIndex.get(userId);
      if (!userJobIds) return [];
      const jobs: ScheduledJob[] = [];
      for (const jobId of userJobIds) {
        const job = this.scheduledJobs.get(jobId);
        if (job) {
          jobs.push(job);
        }
      }
      return jobs;
    }

    return Array.from(this.scheduledJobs.values());
  }

  public async listActiveScheduledJobs(): Promise<ScheduledJob[]> {
    const activeJobs: ScheduledJob[] = [];
    for (const job of this.scheduledJobs.values()) {
      if (job.active) {
        activeJobs.push(job);
      }
    }
    return activeJobs;
  }
}
