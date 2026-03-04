import { ThreadType } from "@ainetwork/adk/types/memory";
import { type Document, Schema } from "mongoose";
import mongoose from "mongoose";

export const ThreadObjectSchema = new Schema(
	{
		type: {
			type: String,
			enum: Object.values(ThreadType),
			required: true,
		},
		threadId: {
			type: String,
			required: true,
			index: true,
		},
		userId: {
			type: String,
			required: true,
			index: true,
		},
		title: {
			type: String,
			required: false,
		},
		isPinned: {
			type: Boolean,
			required: false,
			default: false,
		},
	},
	{
		timestamps: true,
	},
);

export interface ThreadDocument extends Document {
	type: ThreadType;
	threadId: string;
	userId: string;
	title: string;
	isPinned: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export const ThreadModel = mongoose.model<ThreadDocument>("Thread", ThreadObjectSchema);
