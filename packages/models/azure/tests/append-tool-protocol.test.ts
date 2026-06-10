import type {
	ResponseInputItem,
	ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { AzureOpenAI } from "../index";

function makeProvider(): AzureOpenAI {
	return new AzureOpenAI({
		endpoint: "https://example.azure.test",
		apiKey: "test-key",
		apiVersion: "2024-10-21",
		modelName: "gpt-test",
	});
}

/** Minimal async-iterable wrapper around a fixed list of stream events. */
function streamOf(
	events: ResponseStreamEvent[],
): AsyncIterable<ResponseStreamEvent> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const event of events) {
				yield event;
			}
		},
	};
}

type FunctionCallItem = Extract<ResponseInputItem, { type: "function_call" }>;
type FunctionCallOutputItem = Extract<
	ResponseInputItem,
	{ type: "function_call_output" }
>;

describe("AzureOpenAI Responses tool-call protocol", () => {
	it("appendAssistantToolCallTurn emits function_call items keyed by call_id", () => {
		const provider = makeProvider();
		const messages: ResponseInputItem[] = [];

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

		// assistant text message + two function_call items.
		expect(messages).toHaveLength(3);
		expect(messages[0]).toEqual({
			role: "assistant",
			content: "Let me check.",
		});
		expect(messages[1]).toEqual({
			type: "function_call",
			call_id: "call_1",
			name: "search",
			arguments: '{"q":"a"}',
		});
		expect(messages[2]).toEqual({
			type: "function_call",
			call_id: "call_2",
			name: "lookup",
			arguments: '{"k":1}',
		});
	});

	it("appendAssistantToolCallTurn omits the assistant message when content is null", () => {
		const provider = makeProvider();
		const messages: ResponseInputItem[] = [];

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

		expect(messages).toHaveLength(1);
		expect((messages[0] as FunctionCallItem).type).toBe("function_call");
	});

	it("appendToolResult pushes a function_call_output keyed by call_id", () => {
		const provider = makeProvider();
		const messages: ResponseInputItem[] = [];

		provider.appendToolResult(messages, {
			toolCallId: "call_1",
			toolName: "search",
			content: "result body",
		});

		expect(messages).toEqual([
			{
				type: "function_call_output",
				call_id: "call_1",
				output: "result body",
			},
		]);
	});

	it("appendToolResult preserves the call_id even on errors", () => {
		const provider = makeProvider();
		const messages: ResponseInputItem[] = [];

		provider.appendToolResult(messages, {
			toolCallId: "call_bad",
			toolName: "search",
			content: "Invalid tool arguments JSON",
			isError: true,
		});

		expect(messages[0]).toMatchObject({
			type: "function_call_output",
			call_id: "call_bad",
		});
	});

	it("emits function_call / function_call_output pairs matched by call_id", () => {
		const provider = makeProvider();
		const messages: ResponseInputItem[] = [];

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

		const callIds = messages
			.filter(
				(m): m is FunctionCallItem =>
					(m as FunctionCallItem).type === "function_call",
			)
			.map((m) => m.call_id);
		const outputIds = messages
			.filter(
				(m): m is FunctionCallOutputItem =>
					(m as FunctionCallOutputItem).type === "function_call_output",
			)
			.map((m) => m.call_id);
		expect(outputIds.sort()).toEqual(callIds.sort());
	});

	it("fetchToolCallTurn assembles tool calls from Responses output (non-streaming)", async () => {
		const provider = makeProvider();
		const create = jest.fn(async () => ({
			output_text: "",
			output: [
				{
					type: "function_call",
					id: "fc_1",
					call_id: "call_1",
					name: "search",
					arguments: '{"q":"foo"}',
				},
			],
		}));
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(provider as any).client = { responses: { create } };

		const turn = await provider.fetchToolCallTurn([], [], {
			toolChoice: "auto",
		});

		expect(turn.content).toBeNull();
		expect(turn.finishReason).toBe("tool_calls");
		expect(turn.toolCalls).toEqual([
			{
				id: "call_1",
				type: "function",
				function: { name: "search", arguments: '{"q":"foo"}' },
			},
		]);
	});

	it("fetchWithContextMessage does not throw on invalid JSON tool arguments", async () => {
		const provider = makeProvider();
		const create = jest.fn(async () => ({
			output_text: "",
			output: [
				{
					type: "function_call",
					id: "fc_bad",
					call_id: "call_bad",
					name: "search",
					arguments: "{not valid json",
				},
			],
		}));
		// biome-ignore lint/suspicious/noExplicitAny: test stub
		(provider as any).client = { responses: { create } };

		const response = await provider.fetchWithContextMessage(
			[],
			[
				{
					type: "function",
					name: "search",
					parameters: null,
					strict: false,
				},
			],
		);

		// Invalid args fall back to {} instead of throwing.
		expect(response.toolCalls).toEqual([{ name: "search", arguments: {} }]);
	});

	it("convertToolsToFunctions produces flat Responses function tools", () => {
		const provider = makeProvider();
		const functions = provider.convertToolsToFunctions([
			{
				toolName: "search",
				description: "search the web",
				inputSchema: { type: "object", properties: {} },
				// biome-ignore lint/suspicious/noExplicitAny: partial ConnectorTool stub
			} as any,
		]);

		expect(functions).toEqual([
			{
				type: "function",
				name: "search",
				description: "search the web",
				parameters: { type: "object", properties: {} },
				strict: false,
			},
		]);
	});

	describe("reasoning preservation across tool rounds", () => {
		// Reproduces ADK's tool loop: drain the stream to assemble the turn, then
		// record it via appendAssistantToolCallTurn — and assert the streamed
		// reasoning item is re-attached ahead of the function_call.
		async function assembleTurn(provider: AzureOpenAI) {
			const stream = await provider.fetchStreamWithContextMessage([], [], {});
			const assembledToolCalls: Array<{
				id: string;
				type: "function";
				function: { name: string; arguments: string };
			}> = [];
			let assistantText = "";
			for await (const chunk of stream) {
				const delta = chunk.delta;
				if (delta?.tool_calls) {
					for (const { index, id, function: func } of delta.tool_calls) {
						assembledToolCalls[index] ??= {
							id: "",
							type: "function",
							function: { name: "", arguments: "" },
						};
						if (id) assembledToolCalls[index].id = id;
						if (func?.name) assembledToolCalls[index].function.name = func.name;
						if (func?.arguments)
							assembledToolCalls[index].function.arguments += func.arguments;
					}
				} else if (delta?.content) {
					assistantText += delta.content;
				}
			}
			return { assembledToolCalls, assistantText };
		}

		it("re-attaches the encrypted reasoning item before the function_call", async () => {
			const provider = makeProvider();
			const events: ResponseStreamEvent[] = [
				{
					type: "response.output_item.done",
					output_index: 0,
					sequence_number: 1,
					item: {
						type: "reasoning",
						id: "rs_1",
						summary: [],
						encrypted_content: "enc-abc",
					},
					// biome-ignore lint/suspicious/noExplicitAny: minimal event stub
				} as any,
				{
					type: "response.output_item.added",
					output_index: 1,
					sequence_number: 2,
					item: {
						type: "function_call",
						id: "fc_1",
						call_id: "call_1",
						name: "search",
						arguments: "",
					},
					// biome-ignore lint/suspicious/noExplicitAny: minimal event stub
				} as any,
				{
					type: "response.function_call_arguments.delta",
					item_id: "fc_1",
					output_index: 1,
					sequence_number: 3,
					delta: '{"q":"x"}',
					// biome-ignore lint/suspicious/noExplicitAny: minimal event stub
				} as any,
				{
					type: "response.completed",
					sequence_number: 4,
					response: { id: "resp_1" },
					// biome-ignore lint/suspicious/noExplicitAny: minimal event stub
				} as any,
			];
			const create = jest.fn(async () => streamOf(events));
			// biome-ignore lint/suspicious/noExplicitAny: test stub
			(provider as any).client = { responses: { create } };

			const { assembledToolCalls } = await assembleTurn(provider);
			expect(assembledToolCalls).toEqual([
				{
					id: "call_1",
					type: "function",
					function: { name: "search", arguments: '{"q":"x"}' },
				},
			]);

			const messages: ResponseInputItem[] = [];
			provider.appendAssistantToolCallTurn(messages, {
				content: null,
				toolCalls: assembledToolCalls,
			});

			// Reasoning item (with its encrypted payload) must lead, then the call.
			expect(messages).toHaveLength(2);
			expect(messages[0]).toMatchObject({
				type: "reasoning",
				id: "rs_1",
				encrypted_content: "enc-abc",
			});
			expect(messages[1]).toMatchObject({
				type: "function_call",
				call_id: "call_1",
				name: "search",
			});
		});

		it("is consumed once — a second turn without reasoning attaches nothing", async () => {
			const provider = makeProvider();
			const events: ResponseStreamEvent[] = [
				{
					type: "response.output_item.done",
					output_index: 0,
					sequence_number: 1,
					item: {
						type: "reasoning",
						id: "rs_1",
						summary: [],
						encrypted_content: "enc-abc",
					},
					// biome-ignore lint/suspicious/noExplicitAny: minimal event stub
				} as any,
				{
					type: "response.output_item.added",
					output_index: 1,
					sequence_number: 2,
					item: {
						type: "function_call",
						id: "fc_1",
						call_id: "call_1",
						name: "search",
						arguments: "",
					},
					// biome-ignore lint/suspicious/noExplicitAny: minimal event stub
				} as any,
				{
					type: "response.completed",
					sequence_number: 3,
					response: { id: "resp_1" },
					// biome-ignore lint/suspicious/noExplicitAny: minimal event stub
				} as any,
			];
			const create = jest.fn(async () => streamOf(events));
			// biome-ignore lint/suspicious/noExplicitAny: test stub
			(provider as any).client = { responses: { create } };

			const { assembledToolCalls } = await assembleTurn(provider);

			const first: ResponseInputItem[] = [];
			provider.appendAssistantToolCallTurn(first, {
				content: null,
				toolCalls: assembledToolCalls,
			});
			expect(first).toHaveLength(2); // reasoning + function_call

			// Same call_id reused, but reasoning was already taken → not re-added.
			const second: ResponseInputItem[] = [];
			provider.appendAssistantToolCallTurn(second, {
				content: null,
				toolCalls: assembledToolCalls,
			});
			expect(second).toHaveLength(1); // function_call only
			expect((second[0] as FunctionCallItem).type).toBe("function_call");
		});
	});
});
