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
	LLMStream,
	StreamChunk,
	ToolCallDelta,
} from "@ainetwork/adk/types/stream";
import { loggers } from "@ainetwork/adk/utils/logger";
import { messageToPromptText } from "@ainetwork/adk/utils/message-content";
import { AzureOpenAI as AzureOpenAIClient } from "openai";
import type {
	ChatCompletionMessageParam as CCMessageParam,
	ChatCompletionChunk,
	ChatCompletionMessageFunctionToolCall,
	ChatCompletionMessageToolCall,
	ChatCompletionTool,
} from "openai/resources";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 1;
const PROVIDER = "azure-openai";

export interface AzureOpenAIConfig {
	endpoint?: string;
	deployment?: string;
	baseUrl?: string;
	apiKey: string;
	apiVersion: string;
	modelName: string;
	/** Request timeout in milliseconds. Defaults to 120000 (2 minutes). */
	timeout?: number;
	/** Maximum number of automatic retries. Defaults to 1. */
	maxRetries?: number;
}

export class AzureOpenAI extends BaseModel<CCMessageParam, ChatCompletionTool> {
	private client: AzureOpenAIClient;
	private modelName: string;

	constructor({
		endpoint,
		deployment,
		baseUrl,
		apiKey,
		apiVersion,
		modelName,
		timeout = DEFAULT_TIMEOUT_MS,
		maxRetries = DEFAULT_MAX_RETRIES,
	}: AzureOpenAIConfig) {
		super();
		const options = {
			endpoint,
			apiKey,
			deployment,
			apiVersion,
			baseURL: baseUrl,
			timeout,
			maxRetries,
		};
		this.client = new AzureOpenAIClient(options);
		this.modelName = modelName;
	}

	private getMessageRole(role: MessageRole) {
		switch (role) {
			case MessageRole.USER:
				return "user";
			case MessageRole.MODEL:
				return "assistant";
			case MessageRole.SYSTEM:
				return "system";
			default:
				return "system";
		}
	}

	private logCallStart(method: string, messageCount: number, toolCount = 0) {
		loggers.model.debug(`[${PROVIDER}] ${method} start`, {
			provider: PROVIDER,
			model: this.modelName,
			messageCount,
			toolCount,
		});
	}

	private logCallSuccess(method: string, startedAt: number) {
		loggers.model.info(`[${PROVIDER}] ${method} complete`, {
			provider: PROVIDER,
			model: this.modelName,
			durationMs: Date.now() - startedAt,
		});
	}

	private logCallFailure(method: string, startedAt: number, error: unknown) {
		loggers.model.error(`[${PROVIDER}] ${method} failed`, {
			provider: PROVIDER,
			model: this.modelName,
			durationMs: Date.now() - startedAt,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	generateMessages(params: {
		query: string;
		thread?: ThreadObject;
		systemPrompt?: string;
	}): CCMessageParam[] {
		const { query, thread, systemPrompt } = params;
		const messages: CCMessageParam[] = !systemPrompt
			? []
			: [{ role: "system", content: systemPrompt.trim() }];
		const sessionContent: CCMessageParam[] = !thread
			? []
			: thread.messages.map((message: MessageObject) => {
					// Prefer the real query stashed in metadata when a display text was
					// shown in its place (displayQuery), so multi-turn history carries
					// the actual query the model saw on the first turn — not the short
					// label. Falls back to the stored content otherwise, flattened via
					// messageToPromptText: `parts` is `unknown[]` and rich/document
					// messages hold objects, which this API rejects as `content`.
					const content =
						typeof message.metadata?.query === "string"
							? message.metadata.query
							: messageToPromptText(message);
					return {
						role: this.getMessageRole(message.role),
						content,
					};
				});
		const userContent: CCMessageParam = { role: "user", content: query };
		return messages.concat(sessionContent).concat(userContent);
	}

	appendAssistantToolCallTurn(
		messages: CCMessageParam[],
		turn: AssistantToolCallTurn,
	): void {
		messages.push({
			role: "assistant",
			content: turn.content,
			tool_calls: turn.toolCalls.map(
				(tc): ChatCompletionMessageFunctionToolCall => ({
					id: tc.id,
					type: "function",
					function: {
						name: tc.function.name,
						arguments: tc.function.arguments,
					},
				}),
			),
		});
	}

	appendToolResult(
		messages: CCMessageParam[],
		result: ToolResultMessage,
	): void {
		messages.push({
			role: "tool",
			tool_call_id: result.toolCallId,
			content: result.content,
		});
	}

	async fetch(
		messages: CCMessageParam[],
		options?: ModelFetchOptions,
	): Promise<FetchResponse> {
		const startedAt = Date.now();
		this.logCallStart("fetch", messages.length);
		try {
			const response = await this.client.chat.completions.create({
				model: this.modelName,
				messages,
				reasoning_effort: options?.reasoning,
				verbosity: options?.verbosity,
			});
			this.logCallSuccess("fetch", startedAt);

			return {
				content: response.choices[0].message.content || undefined,
			};
		} catch (error) {
			this.logCallFailure("fetch", startedAt, error);
			throw error;
		}
	}

	async fetchWithContextMessage(
		messages: CCMessageParam[],
		functions: ChatCompletionTool[],
		options?: ModelFetchOptions,
	): Promise<FetchResponse> {
		if (functions.length > 0) {
			const startedAt = Date.now();
			this.logCallStart(
				"fetchWithContextMessage",
				messages.length,
				functions.length,
			);
			try {
				const response = await this.client.chat.completions.create({
					model: this.modelName,
					messages,
					tools: functions,
					tool_choice: options?.toolChoice ?? "auto",
					reasoning_effort: options?.reasoning,
					verbosity: options?.verbosity,
				});
				this.logCallSuccess("fetchWithContextMessage", startedAt);

				const { content, tool_calls } = response.choices[0].message;

				const toolCalls: ToolCall[] | undefined = tool_calls?.map(
					(value: ChatCompletionMessageToolCall) => {
						const v = value as ChatCompletionMessageFunctionToolCall;
						let args: Record<string, unknown>;
						try {
							args = JSON.parse(v.function.arguments);
						} catch {
							// Forward the raw argument string so the caller can surface it
							// (and the model can self-correct) instead of killing the fetch.
							args = { __raw: v.function.arguments };
						}
						return {
							name: v.function.name,
							arguments: args,
						};
					},
				);

				return {
					content: content || undefined,
					toolCalls,
				};
			} catch (error) {
				this.logCallFailure("fetchWithContextMessage", startedAt, error);
				throw error;
			}
		}
		return await this.fetch(messages, options);
	}

	async fetchStreamWithContextMessage(
		messages: CCMessageParam[],
		functions: ChatCompletionTool[],
		options?: ModelFetchOptions,
	): Promise<LLMStream> {
		const startedAt = Date.now();
		this.logCallStart(
			"fetchStreamWithContextMessage",
			messages.length,
			functions.length,
		);
		try {
			const stream = await this.client.chat.completions.create({
				model: this.modelName,
				messages,
				...(functions.length > 0
					? {
							tools: functions,
							tool_choice: options?.toolChoice ?? "auto",
						}
					: {}),
				stream: true,
				reasoning_effort: options?.reasoning,
				verbosity: options?.verbosity,
			});
			return this.withStreamLogging(
				this.createOpenAIStreamAdapter(stream),
				"fetchStreamWithContextMessage",
				startedAt,
			);
		} catch (error) {
			this.logCallFailure("fetchStreamWithContextMessage", startedAt, error);
			throw error;
		}
	}

	/**
	 * Wraps an LLMStream so the completion log covers the whole stream
	 * lifetime, not just the initial request.
	 */
	private withStreamLogging(
		stream: LLMStream,
		method: string,
		startedAt: number,
	): LLMStream {
		const logSuccess = () => this.logCallSuccess(method, startedAt);
		const logFailure = (error: unknown) =>
			this.logCallFailure(method, startedAt, error);
		return {
			...stream,
			async *[Symbol.asyncIterator](): AsyncIterator<StreamChunk> {
				try {
					yield* stream;
					logSuccess();
				} catch (error) {
					logFailure(error);
					throw error;
				}
			},
		};
	}

	// NOTE(yoojin): Need to switch API Stream type to LLMStream.
	private createOpenAIStreamAdapter(
		openaiStream: AsyncIterable<ChatCompletionChunk>,
	): LLMStream {
		return {
			async *[Symbol.asyncIterator](): AsyncIterator<StreamChunk> {
				for await (const openaiChunk of openaiStream) {
					const choice = openaiChunk.choices[0];
					if (choice) {
						const streamChunk: StreamChunk = {
							delta: {
								role: choice.delta?.role || undefined,
								content: choice.delta?.content || undefined,
								tool_calls: choice.delta?.tool_calls?.map(
									(tc) =>
										({
											index: tc.index,
											id: tc.id,
											type: tc.type,
											function: tc.function,
										}) as ToolCallDelta,
								),
							},
							finish_reason: choice.finish_reason as any,
							metadata: {
								provider: "openai",
								model: openaiChunk.model,
								id: openaiChunk.id,
							},
						};
						yield streamChunk;
					}
				}
			},
			metadata: { provider: "openai" },
		};
	}

	convertToolsToFunctions(tools: ConnectorTool[]): ChatCompletionTool[] {
		const functions: ChatCompletionTool[] = [];
		for (const tool of tools) {
			functions.push({
				type: "function",
				function: {
					name: tool.toolName,
					description: tool.description,
					parameters: tool.inputSchema,
				},
			});
		}
		return functions;
	}
}
