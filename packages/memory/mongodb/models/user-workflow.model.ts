import { type Document, Schema } from "mongoose";
import mongoose from "mongoose";

export const UserWorkflowObjectSchema = new Schema(
	{
		workflowId: {
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
		templateId: {
			type: String,
		},
		content: {
			type: String,
			required: true,
		},
		variables: {
			type: Schema.Types.Mixed,
		},
		variableValues: {
			type: Schema.Types.Mixed,
		},
		schedule: {
			type: String,
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

export interface UserWorkflowDocument extends Document {
	workflowId: string;
	userId: string;
	title: string;
	description?: string;
	active: boolean;
	templateId?: string;
	content: string;
	variables?: Record<
		string,
		{
			id: string;
			label: string;
			type: "select" | "date_range" | "date_parts" | "text" | "number";
			options?: Array<string>;
			resolveAt?: "creation" | "execution";
		}
	>;
	variableValues?: Record<string, string>;
	schedule?: string;
	timezone?: string;
	lastRunAt?: number;
	nextRunAt?: number;
	lastThreadId?: string;
}

export const UserWorkflowModel = mongoose.model<UserWorkflowDocument>(
	"UserWorkflow",
	UserWorkflowObjectSchema
);
