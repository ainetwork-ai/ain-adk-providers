import { MessageRole, ThreadType } from "@ainetwork/adk/types/memory";
import { type Document, Schema } from "mongoose";

export const ThreadObjectSchema = new Schema(
	{
		sessionId: {
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

// ChatContentObject schema
export const ChatContentObjectSchema = new Schema(
	{
		type: { type: String, required: true },
		parts: { type: [Schema.Types.Mixed], required: true },
	},
	{ _id: false },
);

// ChatObject schema - 개별 문서로 저장
export const ChatObjectSchema = new Schema(
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
			type: MessageRole,
			required: true,
		},
		content: {
			type: ChatContentObjectSchema,
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

// Chat Document interface
export interface ChatDocument extends Document {
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
