import { type Document, Schema } from "mongoose";

// ChatRole enum
export enum ChatRole {
	USER = "USER",
	SYSTEM = "SYSTEM",
	MODEL = "MODEL",
}

export const SessionObjectSchema = new Schema(
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

export interface SessionDocument extends Document {
	sessionId: string;
	userId: string;
	title?: string;
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
		role: {
			type: String,
			enum: Object.values(ChatRole),
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
	sessionId: string;
	role: ChatRole;
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

export const ChatModel = mongoose.model<ChatDocument>("Chat", ChatObjectSchema);
export const SessionModel = mongoose.model<SessionDocument>("Session", SessionObjectSchema);
