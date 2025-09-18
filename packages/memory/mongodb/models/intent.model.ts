import mongoose, { type Document, Schema } from "mongoose";

const IntentObjectSchema = new Schema(
	{
		id: { 
			type: String,
			required: true,
			index: true,
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

export interface IntentDocument extends Document {
	id: string;
	name: string;
	description: string;
	prompt?: string;
	status: string;
	triggeringSentences?: Array<string>;
	tags?: Array<string>;
}

export const IntentModel = mongoose.model<IntentDocument>("Intent", IntentObjectSchema);