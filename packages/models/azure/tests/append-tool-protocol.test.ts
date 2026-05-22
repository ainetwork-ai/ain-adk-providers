import type { ChatCompletionMessageParam } from "openai/resources";
import { AzureOpenAI } from "../index";

function makeProvider(): AzureOpenAI {
	return new AzureOpenAI({
		endpoint: "https://example.azure.test",
		apiKey: "test-key",
		apiVersion: "2024-10-21",
		modelName: "gpt-test",
	});
}

describe("AzureOpenAI tool-call protocol", () => {
	it("appendAssistantToolCallTurn pushes an assistant message with tool_calls", () => {
		const provider = makeProvider();
		const messages: ChatCompletionMessageParam[] = [];

		provider.appendAssistantToolCallTurn(messages, {
			content: "Let me check.",
			toolCalls: [
				{
					id: "call_1",
					type: "function",
					function: { name: "search", arguments: '{"q":"a"}' },
				},
				{
					id: "call_2",
					type: "function",
					function: { name: "lookup", arguments: '{"k":1}' },
				},
			],
		});

		expect(messages).toHaveLength(1);
		expect(messages[0]).toEqual({
			role: "assistant",
			content: "Let me check.",
			tool_calls: [
				{
					id: "call_1",
					type: "function",
					function: { name: "search", arguments: '{"q":"a"}' },
				},
				{
					id: "call_2",
					type: "function",
					function: { name: "lookup", arguments: '{"k":1}' },
				},
			],
		});
	});

	it("appendAssistantToolCallTurn supports null content (tool-calls only)", () => {
		const provider = makeProvider();
		const messages: ChatCompletionMessageParam[] = [];

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

		const msg = messages[0] as Extract<
			ChatCompletionMessageParam,
			{ role: "assistant" }
		>;
		expect(msg.role).toBe("assistant");
		expect(msg.content).toBeNull();
	});

	it("appendToolResult pushes a tool message keyed by tool_call_id", () => {
		const provider = makeProvider();
		const messages: ChatCompletionMessageParam[] = [];

		provider.appendToolResult(messages, {
			toolCallId: "call_1",
			toolName: "search",
			content: "result body",
		});

		expect(messages).toEqual([
			{
				role: "tool",
				tool_call_id: "call_1",
				content: "result body",
			},
		]);
	});

	it("appendToolResult preserves the tool_call_id even on errors", () => {
		const provider = makeProvider();
		const messages: ChatCompletionMessageParam[] = [];

		provider.appendToolResult(messages, {
			toolCallId: "call_bad",
			toolName: "search",
			content: "Invalid tool arguments JSON",
			isError: true,
		});

		expect(messages[0]).toMatchObject({
			role: "tool",
			tool_call_id: "call_bad",
		});
	});

	it("emits assistant turn and tool result pairs that satisfy OpenAI's matching invariant", () => {
		const provider = makeProvider();
		const messages: ChatCompletionMessageParam[] = [];

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
			content: "ok-a",
		});
		provider.appendToolResult(messages, {
			toolCallId: "id_b",
			toolName: "t2",
			content: "ok-b",
		});

		const assistant = messages[0] as Extract<
			ChatCompletionMessageParam,
			{ role: "assistant" }
		>;
		const assistantIds = assistant.tool_calls?.map((tc) => tc.id) ?? [];
		const toolResultIds = messages
			.slice(1)
			.map((m) =>
				m.role === "tool" ? (m as { tool_call_id: string }).tool_call_id : null,
			);
		expect(toolResultIds.sort()).toEqual(assistantIds.sort());
	});
});
