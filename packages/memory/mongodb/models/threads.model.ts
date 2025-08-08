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
		created_at: {
			type: Number,
			required: true,
		},
		updated_at: {
			type: Number,
			required: true,
		}
	},
);

export interface ThreadDocument extends Document {
	type: ThreadType;
	threadId: string;
	userId: string;
	title: string;
	created_at: number;
	updated_at: number;
}

export const ThreadModel = mongoose.model<ThreadDocument>("Thread", ThreadObjectSchema);
