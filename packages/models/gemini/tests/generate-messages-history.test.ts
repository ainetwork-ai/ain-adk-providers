import type { ThreadObject } from "@ainetwork/adk/types/memory";
import { GeminiModel } from "../index";

describe("GeminiModel.generateMessages history reconstruction", () => {
	// Regression: the ADK hands providers normalized (schemaVersion 2) threads;
	// history turns used to flatten to "".
	it("flattens canonical history messages", () => {
		const provider = new GeminiModel({ apiKey: "k", modelName: "m" });
		const thread = {
			messages: [
				{
					messageId: "m1",
					role: "USER",
					timestamp: 1,
					schemaVersion: 2,
					parts: [{ kind: "text", text: "첫 질문" }],
				},
				{
					messageId: "m2",
					role: "MODEL",
					timestamp: 2,
					schemaVersion: 2,
					parts: [
						{ kind: "text", text: "답변" },
						{ kind: "document", documentId: "doc-1", title: "리포트" },
					],
				},
			],
		} as unknown as ThreadObject;

		const messages = provider.generateMessages({ query: "다음", thread });

		expect(messages).toEqual([
			{ role: "user", parts: [{ text: "첫 질문" }] },
			{ role: "model", parts: [{ text: "답변\n[Document: 리포트 (doc-1)]" }] },
			{ role: "user", parts: [{ text: "다음" }] },
		]);
	});
});
