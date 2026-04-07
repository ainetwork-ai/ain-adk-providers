import { type Document, Schema } from "mongoose";
import mongoose from "mongoose";

export const WorkflowTemplateObjectSchema = new Schema(
	{
		templateId: {
			type: String,
			required: true,
			unique: true,
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

export interface WorkflowTemplateDocument extends Document {
	templateId: string;
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

export const WorkflowTemplateModel = mongoose.model<WorkflowTemplateDocument>(
	"WorkflowTemplate",
	WorkflowTemplateObjectSchema
);
