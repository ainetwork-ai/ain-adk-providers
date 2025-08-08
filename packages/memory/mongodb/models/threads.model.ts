import { MessageRole, ThreadType } from "@ainetwork/adk/types/memory";
import { type Document, Schema } from "mongoose";

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

// MessageContentObject schema
export const MessageContentObjectSchema = new Schema(
	{
		type: { type: String, required: true },
		parts: { type: [Schema.Types.Mixed], required: true },
	},
	{ _id: false },
);

// MessageObject schema - 개별 문서로 저장
export const MessageObjectSchema = new Schema(
	{
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
		role: {
			type: String,
			enum: Object.values(MessageRole),
			required: true,
		},
		content: {
			type: MessageContentObjectSchema,
			required: true,
		},
		timestamp: {
			type: Number,
			required: true,
		},
		metadata: {
			type: Schema.Types.Mixed,
			default: {},
		},
	},
);

// Message Document interface
export interface MessageDocument extends Document {
	threadId: string;
	role: MessageRole;
	content: {
		type: string;
		parts: any[];
	};
	timestamp: number;
	metadata?: { [key: string]: unknown };
	createdAt: Date;
	updatedAt: Date;
}

// 모델 export
import mongoose from "mongoose";

export const MessageModel = mongoose.model<MessageDocument>("Message", MessageObjectSchema);
export const ThreadModel = mongoose.model<ThreadDocument>("Thread", ThreadObjectSchema);
