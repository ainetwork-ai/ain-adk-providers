import {
	DocumentFormat,
	type DocumentSlot,
	DocumentSource,
} from "@ainetwork/adk/types/document";
import type { WorkflowRenderedBlock } from "@ainetwork/adk/types/memory";
import { type Document, Schema } from "mongoose";
import mongoose from "mongoose";

export const DocumentObjectSchema = new Schema(
	{
		documentId: {
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
		format: {
			type: String,
			enum: Object.values(DocumentFormat),
			required: true,
			default: DocumentFormat.MARKDOWN,
		},
		content: {
			type: String,
			required: true,
		},
		blocks: {
			type: Schema.Types.Mixed,
		},
		slots: {
			type: Schema.Types.Mixed,
		},
		groupId: {
			type: String,
			index: true,
		},
		source: {
			type: String,
			enum: Object.values(DocumentSource),
			required: true,
		},
		workflowId: {
			type: String,
			index: true,
		},
		threadId: {
			type: String,
			index: true,
		},
		version: {
			type: Number,
			required: true,
			default: 1,
		},
		editedManually: {
			type: Boolean,
		},
		createdAt: {
			type: String,
			required: true,
		},
		updatedAt: {
			type: String,
			required: true,
		},
	},
	// `createdAt`/`updatedAt` are caller-supplied ISO strings (see Document type),
	// so mongoose's automatic Date timestamps are intentionally disabled.
	{
		timestamps: false,
	}
);

export interface DocumentDocument extends Document {
	documentId: string;
	userId: string;
	title: string;
	format: DocumentFormat;
	content: string;
	blocks?: WorkflowRenderedBlock[];
	slots?: DocumentSlot[];
	groupId?: string;
	source: DocumentSource;
	workflowId?: string;
	threadId?: string;
	version: number;
	editedManually?: boolean;
	createdAt: string;
	updatedAt: string;
}

export const DocumentModel = mongoose.model<DocumentDocument>(
	"Document",
	DocumentObjectSchema
);
