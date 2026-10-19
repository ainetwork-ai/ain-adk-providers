import { MessageRole } from "@ainetwork/adk/types/memory";
import mongoose, { type Document, Schema } from "mongoose";

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
		// Legacy records carry `content`; canonical (schemaVersion 2) records
		// carry top-level `parts`. Neither is required — the ADK normalizes both.
		content: {
			type: MessageContentObjectSchema,
		},
		schemaVersion: {
			type: Number,
		},
		parts: {
			type: [Schema.Types.Mixed],
			// Mongoose defaults arrays to []; a legacy record would then look canonical.
			default: undefined,
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
	{
		timestamps: true,
	},
);

MessageObjectSchema.index({ threadId: 1, messageId: 1 }, { unique: true });

// Message Document interface
export interface MessageDocument extends Document {
	messageId: string;
	threadId: string;
	userId: string;
	role: MessageRole;
	content?: {
		type: string;
		parts: any[];
	};
	schemaVersion?: number;
	parts?: any[];
	timestamp: number;
	createdAt: Date;
	updatedAt: Date;
	metadata?: { [key: string]: unknown };
}

export const MessageModel = mongoose.model<MessageDocument>(
	"Message",
	MessageObjectSchema,
);
