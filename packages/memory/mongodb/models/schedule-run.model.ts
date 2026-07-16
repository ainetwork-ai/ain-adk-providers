import type { ScheduleRun } from "@ainetwork/adk/types/schedule";
import { type Document, Schema } from "mongoose";
import mongoose from "mongoose";

export const ScheduleRunSchema = new Schema(
	{
		runId: {
			type: String,
			required: true,
			unique: true,
		},
		jobType: {
			type: String,
			required: true,
			index: true,
		},
		jobKey: {
			type: String,
			required: true,
			index: true,
		},
		trigger: {
			type: String,
			required: true,
		},
		scheduledFor: {
			type: Number,
			required: true,
		},
		startedAt: {
			type: Number,
			required: true,
			index: true,
		},
		finishedAt: {
			type: Number,
		},
		status: {
			type: String,
			required: true,
			index: true,
		},
		attempts: {
			type: Number,
			required: true,
			default: 0,
		},
		error: {
			type: String,
		},
		// Per-slot outcomes (SLOT_REFRESH only). Free-form so the schema doesn't
		// strip entries on update (mongoose strict mode).
		slotResults: {
			type: Schema.Types.Mixed,
		},
	},
	{
		collection: "schedule_runs",
	}
);

// 이력 조회(listScheduleRuns)의 주 패턴인 "jobKey 필터 + startedAt 최신순"을
// 하나의 인덱스로 커버한다. 이력은 실행마다 쌓이는 무한 성장 컬렉션이라 미리 둔다.
ScheduleRunSchema.index({ jobKey: 1, startedAt: -1 });

export type ScheduleRunDocument = ScheduleRun & Document;

export const ScheduleRunModel = mongoose.model<ScheduleRunDocument>(
	"ScheduleRun",
	ScheduleRunSchema
);
