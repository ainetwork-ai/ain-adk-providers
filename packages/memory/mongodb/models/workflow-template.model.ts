import type {
	WorkflowDefinition,
	WorkflowVariable,
} from "@ainetwork/adk/types/memory";
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
		category: {
			type: String,
		},
		content: {
			type: String,
			required: true,
		},
		definition: {
			type: Schema.Types.Mixed,
		},
		variables: {
			type: Schema.Types.Mixed,
		},
		hidden: {
			type: Boolean,
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
	category?: string;
	content: string;
	definition?: WorkflowDefinition;
	variables?: Record<string, WorkflowVariable>;
	hidden?: boolean;
}

export const WorkflowTemplateModel = mongoose.model<WorkflowTemplateDocument>(
	"WorkflowTemplate",
	WorkflowTemplateObjectSchema
);
