import mongoose, { type Document, Schema } from "mongoose";

const IntentObjectSchema = new Schema(
	{
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
		llm: {
			type: String,
			required: false,
		},
	}
);

export interface IntentDocument extends Document {
	name: string;
	description: string;
	prompt?: string;
	llm?: string;
}

export const IntentModel = mongoose.model<IntentDocument>("Intent", IntentObjectSchema);