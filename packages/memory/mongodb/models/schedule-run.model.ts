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

export type ScheduleRunDocument = ScheduleRun & Document;

export const ScheduleRunModel = mongoose.model<ScheduleRunDocument>(
	"ScheduleRun",
	ScheduleRunSchema
);
