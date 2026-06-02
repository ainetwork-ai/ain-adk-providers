import type { Content } from "@google/genai";
import { GeminiModel } from "../index";

function makeProvider(): GeminiModel {
	return new GeminiModel("test-key", "gemini-test");
}

describe("GeminiModel tool-call protocol", () => {
	it("appendAssistantToolCallTurn pushes role='model' with functionCall parts", () => {
		const provider = makeProvider();
		const messages: Content[] = [];

		provider.appendAssistantToolCallTurn(messages, {
			content: "Checking",
			toolCalls: [
				{
					id: "call_1",
					type: "function",
					function: { name: "search", arguments: '{"q":"a"}' },
				},
			],
		});

		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("model");
		const parts = messages[0].parts ?? [];
		expect(parts[0]).toEqual({ text: "Checking" });
		expect(parts[1]).toEqual({
			functionCall: {
				id: "call_1",
				name: "search",
				args: { q: "a" },
			},
		});
	});

	it("appendAssistantToolCallTurn omits the text part when content is null", () => {
		const provider = makeProvider();
		const messages: Content[] = [];

		provider.appendAssistantToolCallTurn(messages, {
			content: null,
			toolCalls: [
				{
					id: "call_1",
					type: "function",
					function: { name: "search", arguments: "{}" },
				},
			],
		});

		const parts = messages[0].parts ?? [];
		expect(parts).toHaveLength(1);
		expect(parts[0]).toMatchObject({ functionCall: { name: "search" } });
	});

	it("appendAssistantToolCallTurn preserves the raw argument string when JSON parsing fails", () => {
		const provider = makeProvider();
		const messages: Content[] = [];

		provider.appendAssistantToolCallTurn(messages, {
			content: null,
			toolCalls: [
				{
					id: "call_1",
					type: "function",
					function: { name: "search", arguments: "{not json" },
				},
			],
		});

		const parts = messages[0].parts ?? [];
		expect(parts[0]).toMatchObject({
			functionCall: { args: { __raw: "{not json" } },
		});
	});

	it("appendToolResult emits role='user' with functionResponse keyed by id", () => {
		const provider = makeProvider();
		const messages: Content[] = [];

		provider.appendToolResult(messages, {
			toolCallId: "call_1",
			toolName: "search",
			content: "result body",
		});

		expect(messages).toEqual([
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "call_1",
							name: "search",
							response: { output: "result body" },
						},
					},
				],
			},
		]);
	});

	it("appendToolResult wraps errors under the 'error' key in the response", () => {
		const provider = makeProvider();
		const messages: Content[] = [];

		provider.appendToolResult(messages, {
			toolCallId: "call_bad",
			toolName: "search",
			content: "Invalid arguments",
			isError: true,
		});

		const part = messages[0].parts?.[0];
		expect(part).toMatchObject({
			functionResponse: {
				id: "call_bad",
				response: { error: "Invalid arguments" },
			},
		});
	});

	it("emits assistant turn and tool result ids that match across the pair", () => {
		const provider = makeProvider();
		const messages: Content[] = [];

		provider.appendAssistantToolCallTurn(messages, {
			content: null,
			toolCalls: [
				{
					id: "id_a",
					type: "function",
					function: { name: "t1", arguments: "{}" },
				},
				{
					id: "id_b",
					type: "function",
					function: { name: "t2", arguments: "{}" },
				},
			],
		});
		provider.appendToolResult(messages, {
			toolCallId: "id_a",
			toolName: "t1",
			content: "a",
		});
		provider.appendToolResult(messages, {
			toolCallId: "id_b",
			toolName: "t2",
			content: "b",
		});

		const assistantIds = (messages[0].parts ?? [])
			.flatMap((p) => (p.functionCall?.id ? [p.functionCall.id] : []))
			.sort();
		const resultIds = messages
			.slice(1)
			.flatMap((m) =>
				(m.parts ?? []).flatMap((p) =>
					p.functionResponse?.id ? [p.functionResponse.id] : [],
				),
			)
			.sort();
		expect(resultIds).toEqual(assistantIds);
	});
});
