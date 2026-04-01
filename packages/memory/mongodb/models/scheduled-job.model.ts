import { type Document, Schema } from "mongoose";
import mongoose from "mongoose";

export const ScheduledJobObjectSchema = new Schema(
	{
		jobId: {
			type: String,
			required: true,
			unique: true,
		},
		userId: {
			type: String,
			required: true,
			index: true,
		},
		title: {
			type: String,
			required: true,
		},
		description: {
			type: String,
		},
		active: {
			type: Boolean,
			required: true,
			default: false,
		},
		query: {
			type: String,
		},
		workflowId: {
			type: String,
		},
		workflowVariables: {
			type: Schema.Types.Mixed,
		},
		schedule: {
			type: String,
			required: true,
		},
		timezone: {
			type: String,
		},
		lastRunAt: {
			type: Number,
		},
		nextRunAt: {
			type: Number,
		},
		lastThreadId: {
			type: String,
		},
	},
	{
		timestamps: true,
	}
);

export interface ScheduledJobDocument extends Document {
	jobId: string;
	userId: string;
	title: string;
	description?: string;
	active: boolean;
	query?: string;
	workflowId?: string;
	workflowVariables?: Record<string, string>;
	schedule: string;
	timezone?: string;
	lastRunAt?: number;
	nextRunAt?: number;
	lastThreadId?: string;
}

export const ScheduledJobModel = mongoose.model<ScheduledJobDocument>(
	"ScheduledJob",
	ScheduledJobObjectSchema
);
