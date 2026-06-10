import {
	type AssistantToolCallTurn,
	BaseModel,
	type ModelFetchOptions,
	type ToolResultMessage,
} from "@ainetwork/adk/modules";
import type {
	ConnectorTool,
	FetchResponse,
	ToolCall,
} from "@ainetwork/adk/types/connector";
import {
	type MessageObject,
	MessageRole,
	type ThreadObject,
} from "@ainetwork/adk/types/memory";
import type {
	AssembledToolCall,
	LLMStream,
	StreamChunk,
	ToolCallDelta,
} from "@ainetwork/adk/types/stream";
import { AzureOpenAI as AzureOpenAIClient } from "openai";
import type {
	FunctionTool,
	ResponseCreateParamsNonStreaming,
	ResponseInputItem,
	ResponseOutputItem,
	ResponseReasoningItem,
	ResponseStreamEvent,
} from "openai/resources/responses/responses";

export interface AzureOpenAIConfig {
	endpoint?: string;
	deployment?: string;
	baseUrl?: string;
	apiKey: string;
	apiVersion: string;
	modelName: string;
	/**
	 * Max automatic retries for transient failures (handled by the OpenAI SDK
	 * with exponential backoff). Azure reasoning models (e.g. GPT-5.1) can return
	 * intermittent 5xx — notably `500 "The model produced invalid content"` on
	 * tool-calling turns — that usually succeed on retry. Defaults to 4 (the SDK
	 * default is 2).
	 */
	maxRetries?: number;
}

/** Default automatic retries — higher than the SDK default to absorb Azure's
 * intermittent 5xx on reasoning-model tool calls. */
const DEFAULT_MAX_RETRIES = 4;

/**
 * Result of {@link AzureOpenAI.fetchToolCallTurn}. Structurally compatible with
 * the ADK `AssistantTurnResult` type (kept local so this package builds against
 * ADK releases that predate that export).
 */
interface ResolvedAssistantTurn {
	content: string | null;
	toolCalls: AssembledToolCall[];
	finishReason?: string | null;
}

/**
 * Parses tool-call arguments without throwing. Returns `{}` for missing or
 * invalid JSON (which the model can emit), so a bad argument string never
 * crashes the whole request.
 */
function safeParseArguments(raw: string | undefined): Record<string, unknown> {
	if (!raw) {
		return {};
	}
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

/**
 * Azure OpenAI provider built on the **Responses API** (`client.responses`)
 * rather than Chat Completions.
 *
 * Why Responses:
 * - Semantic streaming events (`response.function_call_arguments.delta`,
 *   `response.output_item.added/done`, `response.completed`) avoid the truncated
 *   tool-call argument deltas / missing `finish_reason` failure mode that GPT-5.1
 *   reasoning models exhibit over the streaming Chat Completions API.
 * - Reasoning continuity: a reasoning model's chain-of-thought is carried across
 *   tool-call rounds, improving multi-step tool calling and cutting the cost of
 *   re-deriving reasoning each round.
 *
 * Reasoning preservation under ADK's contract:
 * ADK's `ToolCallingService` assembles each assistant turn from the stream as
 * `{ content, toolCalls }` and hands only that to {@link appendAssistantToolCallTurn}
 * — the reasoning item never reaches the provider through that path. We capture
 * the reasoning item(s) while consuming the Responses stream and stash them in a
 * provider-internal map keyed by the turn's `call_id`s (provider-issued and
 * globally unique, so this is concurrency-safe across requests sharing one model
 * instance). When ADK records the assistant turn, we look the reasoning back up
 * by `call_id` and re-attach it to the message history before the `function_call`
 * items, so the next round's request carries it.
 *
 * Statelessness: requests use `store: false` with
 * `include: ["reasoning.encrypted_content"]`, so reasoning items round-trip via
 * their encrypted payload instead of server-side state. ADK keeps owning
 * conversation memory (`ThreadObject`); we never use `previous_response_id`.
 */
export class AzureOpenAI extends BaseModel<ResponseInputItem, FunctionTool> {
	private client: AzureOpenAIClient;
	private modelName: string;
	/**
	 * Reasoning items captured per streamed turn, keyed by every `call_id` in
	 * that turn. Consumed (and cleared) by {@link appendAssistantToolCallTurn}.
	 */
	private pendingReasoning = new Map<string, ResponseReasoningItem[]>();

	constructor({
		endpoint,
		deployment,
		baseUrl,
		apiKey,
		apiVersion,
		modelName,
		maxRetries,
	}: AzureOpenAIConfig) {
		super();
		const options = {
			endpoint,
			apiKey,
			deployment,
			apiVersion,
			baseURL: baseUrl,
			maxRetries: maxRetries ?? DEFAULT_MAX_RETRIES,
		};
		this.client = new AzureOpenAIClient(options);
		this.modelName = modelName;
	}

	private getMessageRole(role: MessageRole): "user" | "assistant" | "system" {
		switch (role) {
			case MessageRole.USER:
				return "user";
			case MessageRole.MODEL:
				return "assistant";
			case MessageRole.SYSTEM:
				return "system";
			default:
				return "system"; /*FIXME*/
		}
	}

	generateMessages(params: {
		query: string;
		thread?: ThreadObject;
		systemPrompt?: string;
	}): ResponseInputItem[] {
		const { query, thread, systemPrompt } = params;
		const messages: ResponseInputItem[] = systemPrompt
			? [{ role: "system", content: systemPrompt.trim() }]
			: [];
		if (thread) {
			for (const message of thread.messages as MessageObject[]) {
				messages.push({
					role: this.getMessageRole(message.role),
					content: message.content.parts[0] as string,
				});
			}
		}
		messages.push({ role: "user", content: query });
		return messages;
	}

	appendAssistantToolCallTurn(
		messages: ResponseInputItem[],
		turn: AssistantToolCallTurn,
	): void {
		const callIds = turn.toolCalls.map((tc) => tc.id);
		// Re-attach the chain-of-thought this turn produced (if any) so the model
		// keeps reasoning continuity into the next round. Reasoning items must
		// precede the `function_call` items they generated.
		for (const item of this.takePendingReasoning(callIds)) {
			messages.push(item);
		}
		if (turn.content) {
			messages.push({ role: "assistant", content: turn.content });
		}
		for (const tc of turn.toolCalls) {
			messages.push({
				type: "function_call",
				call_id: tc.id,
				name: tc.function.name,
				arguments: tc.function.arguments,
			});
		}
	}

	appendToolResult(
		messages: ResponseInputItem[],
		result: ToolResultMessage,
	): void {
		messages.push({
			type: "function_call_output",
			call_id: result.toolCallId,
			output: result.content,
		});
	}

	/**
	 * Shared request parameters for every Responses call. `stream` is added by
	 * the caller so the SDK overload resolves to the correct return type.
	 */
	private buildParams(
		messages: ResponseInputItem[],
		functions: FunctionTool[] | undefined,
		options?: ModelFetchOptions,
	): Omit<ResponseCreateParamsNonStreaming, "stream"> {
		const params: Omit<ResponseCreateParamsNonStreaming, "stream"> = {
			model: this.modelName,
			input: messages,
			// Stateless reasoning round-trip: ADK owns conversation memory, so we
			// never persist server-side state; the encrypted reasoning payload is
			// what carries chain-of-thought across rounds.
			store: false,
			include: ["reasoning.encrypted_content"],
		};
		if (functions && functions.length > 0) {
			params.tools = functions;
			params.tool_choice = options?.toolChoice ?? "auto";
		}
		if (options?.reasoning) {
			params.reasoning = { effort: options.reasoning };
		}
		if (options?.verbosity) {
			params.text = { verbosity: options.verbosity };
		}
		return params;
	}

	private extractToolCalls(output: ResponseOutputItem[]): ToolCall[] {
		const toolCalls: ToolCall[] = [];
		for (const item of output) {
			if (item.type === "function_call") {
				toolCalls.push({
					name: item.name,
					// The model can emit invalid/partial JSON arguments; never let a
					// parse failure crash the request — fall back to empty args.
					arguments: safeParseArguments(item.arguments),
				});
			}
		}
		return toolCalls;
	}

	async fetch(
		messages: ResponseInputItem[],
		options?: ModelFetchOptions,
	): Promise<FetchResponse> {
		const response = await this.client.responses.create({
			...this.buildParams(messages, undefined, options),
			stream: false,
		});

		return {
			content: response.output_text || undefined,
		};
	}

	async fetchWithContextMessage(
		messages: ResponseInputItem[],
		functions: FunctionTool[],
		options?: ModelFetchOptions,
	): Promise<FetchResponse> {
		if (functions.length === 0) {
			return await this.fetch(messages, options);
		}

		const response = await this.client.responses.create({
			...this.buildParams(messages, functions, options),
			stream: false,
		});

		const toolCalls = this.extractToolCalls(response.output);
		return {
			content: response.output_text || undefined,
			toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
		};
	}

	/**
	 * Non-streaming tool-call resolution. Returns fully-assembled tool calls
	 * (with provider-issued ids and raw string arguments) so a caller can
	 * resolve tool rounds without streaming. Not used by ADK 0.6.x's streaming
	 * tool loop, but kept for forward/back compatibility.
	 */
	async fetchToolCallTurn(
		messages: ResponseInputItem[],
		functions: FunctionTool[],
		options?: ModelFetchOptions,
	): Promise<ResolvedAssistantTurn> {
		const response = await this.client.responses.create({
			...this.buildParams(
				messages,
				functions.length > 0 ? functions : undefined,
				options,
			),
			stream: false,
		});

		const toolCalls: AssembledToolCall[] = [];
		for (const item of response.output) {
			if (item.type === "function_call") {
				toolCalls.push({
					id: item.call_id,
					type: "function",
					// Keep raw string args — the caller parses (and guards) it.
					function: { name: item.name, arguments: item.arguments },
				});
			}
		}

		return {
			content: response.output_text || null,
			toolCalls,
			finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
		};
	}

	async fetchStreamWithContextMessage(
		messages: ResponseInputItem[],
		functions: FunctionTool[],
		options?: ModelFetchOptions,
	): Promise<LLMStream> {
		const params = this.buildParams(
			messages,
			functions.length > 0 ? functions : undefined,
			options,
		);
		if (functions.length === 0) {
			params.tool_choice = "none";
		}
		const stream = await this.client.responses.create({
			...params,
			stream: true,
		});
		return this.createResponsesStreamAdapter(stream);
	}

	private createResponsesStreamAdapter(
		openaiStream: AsyncIterable<ResponseStreamEvent>,
	): LLMStream {
		const self = this;
		const model = this.modelName;
		return {
			async *[Symbol.asyncIterator](): AsyncIterator<StreamChunk> {
				// ADK assembles tool calls by a contiguous `index`. Responses output
				// items are indexed across ALL items (reasoning included), so we map
				// each function-call item id to a dense 0-based tool index rather than
				// reusing `output_index` — otherwise the assembled array would be
				// sparse and ADK would iterate `undefined` holes.
				const itemIdToToolIndex = new Map<string, number>();
				let nextToolIndex = 0;
				const reasoningItems: ResponseReasoningItem[] = [];
				const callIds: string[] = [];

				for await (const event of openaiStream) {
					switch (event.type) {
						case "response.output_text.delta": {
							yield {
								delta: { role: "assistant", content: event.delta },
								metadata: {
									provider: "openai",
									model,
									id: event.item_id,
								},
							};
							break;
						}
						case "response.output_item.added": {
							const item = event.item;
							if (item.type === "function_call") {
								const index = nextToolIndex++;
								itemIdToToolIndex.set(item.id ?? item.call_id, index);
								callIds.push(item.call_id);
								yield {
									delta: {
										tool_calls: [
											{
												index,
												id: item.call_id,
												type: "function",
												function: { name: item.name, arguments: "" },
											} as ToolCallDelta,
										],
									},
									metadata: { provider: "openai", model },
								};
							}
							break;
						}
						case "response.function_call_arguments.delta": {
							const index = itemIdToToolIndex.get(event.item_id);
							if (index !== undefined && event.delta) {
								yield {
									delta: {
										tool_calls: [
											{
												index,
												function: { arguments: event.delta },
											} as ToolCallDelta,
										],
									},
									metadata: { provider: "openai", model },
								};
							}
							break;
						}
						case "response.output_item.done": {
							if (event.item.type === "reasoning") {
								reasoningItems.push(event.item);
							}
							break;
						}
						case "response.completed": {
							yield {
								finish_reason: callIds.length > 0 ? "tool_calls" : "stop",
								metadata: {
									provider: "openai",
									model,
									id: event.response.id,
								},
							};
							break;
						}
						default:
							break;
					}
				}

				// Runs once the consumer finishes draining the stream and before ADK
				// records the assistant turn — so the reasoning is in place for the
				// subsequent appendAssistantToolCallTurn lookup.
				self.storePendingReasoning(callIds, reasoningItems);
			},
			metadata: { provider: "openai" },
		};
	}

	private storePendingReasoning(
		callIds: string[],
		items: ResponseReasoningItem[],
	): void {
		if (callIds.length === 0 || items.length === 0) {
			return;
		}
		for (const id of callIds) {
			this.pendingReasoning.set(id, items);
		}
	}

	private takePendingReasoning(callIds: string[]): ResponseReasoningItem[] {
		for (const id of callIds) {
			const items = this.pendingReasoning.get(id);
			if (items) {
				// All call_ids of a turn share the same array — clear them together.
				for (const cid of callIds) {
					this.pendingReasoning.delete(cid);
				}
				return items;
			}
		}
		return [];
	}

	convertToolsToFunctions(tools: ConnectorTool[]): FunctionTool[] {
		const functions: FunctionTool[] = [];
		for (const tool of tools) {
			functions.push({
				type: "function",
				name: tool.toolName,
				description: tool.description,
				parameters: tool.inputSchema ?? null,
				strict: false,
			});
		}
		return functions;
	}
}
