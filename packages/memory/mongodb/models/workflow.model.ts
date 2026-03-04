import { type Document, Schema } from "mongoose";
import mongoose from "mongoose";

export const WorkflowObjectSchema = new Schema(
	{
		workflowId: {
			type: String,
			required: true,
			unique: true,
		},
		userId: {
			type: String,
		},
		title: {
			type: String,
			required: true,
		},
		description: {
			type: String,
			required: true,
		},
		active: {
			type: Boolean,
			required: true,
			default: false,
		},
		content: {
			type: String,
			required: true,
		},
		variables: {
			type: Schema.Types.Mixed,
		},
	},
	{
		timestamps: true,
	}
);

export interface WorkflowDocument extends Document {
	workflowId: string;
	userId?: string;
	title: string;
	description: string;
	active: boolean;
	content: string;
	variables?: Record<
		string,
		{
			id: string;
			label: string;
			type: "select" | "date_range" | "text" | "number";
			options?: Array<string>;
		}
	>;
}

export const WorkflowModel = mongoose.model<WorkflowDocument>("Workflow", WorkflowObjectSchema);
