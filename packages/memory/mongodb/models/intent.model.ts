import { Intent } from "@ainetwork/adk/types/memory";
import mongoose, { type Document, Schema } from "mongoose";

const IntentObjectSchema = new Schema(
	{
		id: { 
			type: String,
			required: true,
			index: true,
			unique: true,
		},
		name: {
			type: String,
			required: true,
			index: true,
		},
		description: {
			type: String,
			required: true,
		},
		prompt: {
			type: String,
			required: false,
		},
		status: {
			type: String,
			required: true,
		},
		triggeringSentences: {
			type: [String],
			required: false,
		},
		tags: {
			type: [String],
			required: false,
		},
	},
);

export interface IntentDocument extends Omit<Document, 'id'>, Omit<Intent, 'id'> {
	id: string;
}

export const IntentModel = mongoose.model<IntentDocument>("Intent", IntentObjectSchema);