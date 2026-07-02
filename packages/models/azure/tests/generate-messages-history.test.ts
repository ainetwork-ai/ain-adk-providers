import type { MessageObject, ThreadObject } from "@ainetwork/adk/types/memory";
import { AzureOpenAI } from "../index";

function makeProvider(): AzureOpenAI {
	return new AzureOpenAI({
		endpoint: "https://example.azure.test",
		apiKey: "test-key",
		apiVersion: "2024-10-21",
		modelName: "gpt-test",
	});
}

function userMessage(
	content: string,
	metadata?: Record<string, unknown>,
): MessageObject {
	return {
		messageId: "m1",
		role: "USER" as MessageObject["role"],
		timestamp: 1,
		content: { type: "text", parts: [content] },
		metadata,
	};
}

describe("AzureOpenAI.generateMessages history reconstruction", () => {
	it("uses metadata.query (the real query) over the displayed label in history", () => {
		const provider = makeProvider();
		const thread = {
			messages: [
				// A seeded message: the user saw a short label, but the real query
				// (with embedded document) was stashed in metadata.query.
				userMessage("이 일지에 대해 대화해보기", {
					query: "전체 문서 내용: 피자힐 2026-07-01 매출 100만원 ...",
				}),
			],
		} as unknown as ThreadObject;

		const messages = provider.generateMessages({
			query: "작년과의 차이를 분석해봐",
			thread,
		});

		// The historical user turn must carry the real query, not the short label.
		const historyTurn = messages.find(
			(m) =>
				m.role === "user" &&
				typeof m.content === "string" &&
				m.content.includes("피자힐"),
		);
		expect(historyTurn).toBeDefined();
		expect(
			messages.some((m) => m.content === "이 일지에 대해 대화해보기"),
		).toBe(false);
	});

	it("falls back to content.parts[0] when no metadata.query is present", () => {
		const provider = makeProvider();
		const thread = {
			messages: [userMessage("평범한 질문입니다")],
		} as unknown as ThreadObject;

		const messages = provider.generateMessages({ query: "다음 질문", thread });
		expect(messages.some((m) => m.content === "평범한 질문입니다")).toBe(true);
	});
});
