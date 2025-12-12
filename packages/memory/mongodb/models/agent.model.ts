import { type Document, Schema } from "mongoose";
import mongoose from "mongoose";

export const AgentObjectSchema = new Schema(
	{
		agent_prompt: {
			type: String,
		},
	},
);

export interface AgentDocument extends Document {
	agent_prompt: string;
}

export const AgentModel = mongoose.model<AgentDocument>("Agent", AgentObjectSchema);
