import { MessageRole } from "@ainetwork/adk/types/memory";
import { type Document, Schema } from "mongoose";
import mongoose from "mongoose";

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
		messageId: {
			type: String,
			required: true,
			index: true,
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
	messageId: string;
	threadId: string;
	userId: string;
	role: MessageRole;
	content: {
		type: string;
		parts: any[];
	};
	timestamp: number;
	metadata?: { [key: string]: unknown };
}

export const MessageModel = mongoose.model<MessageDocument>("Message", MessageObjectSchema);