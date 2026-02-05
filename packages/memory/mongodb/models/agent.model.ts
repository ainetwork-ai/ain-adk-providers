import { type Document, Schema } from "mongoose";
import mongoose from "mongoose";

export const AgentObjectSchema = new Schema(
	{
		id: {
			type: String,
			required: true,
			unique: true,
		},
		prompt: {
			type: String,
		},
	},
);

export interface AgentDocument extends Document {
	id: string;
	prompt: string;
}

export const AgentModel = mongoose.model<AgentDocument>("Agent", AgentObjectSchema);
