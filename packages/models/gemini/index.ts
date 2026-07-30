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
import {
	type Content,
	type FunctionCall,
	FunctionCallingConfigMode,
	type FunctionDeclaration,
	type GenerateContentConfig,
	type GenerateContentResponse,
	GoogleGenAI,
	type Part,
} from "@google/genai";

const DEFAULT_TIMEOUT_MS = 120_000;
const PROVIDER = "gemini";

// Sentinel role used to carry the system prompt inside the message array
// until fetch time, where it is extracted into config.systemInstruction.
// It is never sent to the Gemini API (which only accepts user/model roles).
const SYSTEM_INSTRUCTION_ROLE = "system";

export interface GeminiModelConfig {
	apiKey: string;
	modelName: string;
	/** Request timeout in milliseconds. Defaults to 120000 (2 minutes). */
	timeout?: number;
}

export class GeminiModel extends BaseModel<Content, FunctionDeclaration> {
	private client: GoogleGenAI;
	private modelName: string;

	constructor(config: GeminiModelConfig);
	/** @deprecated Use the config-object constructor instead. */
	constructor(apiKey: string, modelName: string);
	constructor(configOrApiKey: GeminiModelConfig | string, modelName?: string) {
		super();
		const config: GeminiModelConfig =
			typeof configOrApiKey === "string"
				? { apiKey: configOrApiKey, modelName: modelName as string }
				: configOrApiKey;
		this.client = new GoogleGenAI({
			apiKey: config.apiKey,
			httpOptions: { timeout: config.timeout ?? DEFAULT_TIMEOUT_MS },
		});
		this.modelName = config.modelName;
	}

	private getMessageRole(role: MessageRole) {
		switch (role) {
			case MessageRole.USER:
				return "user";
			case MessageRole.MODEL:
			case MessageRole.SYSTEM:
				return "model";
			default:
				return "model"; /*FIXME*/
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

	/**
	 * Splits the sentinel system-instruction entries out of the message array
	 * so they can be sent via the SDK's config.systemInstruction instead of
	 * being smuggled in as a (misattributed) conversation turn.
	 */
	private splitSystemInstruction(messages: Content[]): {
		contents: Content[];
		systemInstruction?: string;
	} {
		const systemParts: string[] = [];
		const contents: Content[] = [];
		for (const message of messages) {
			if (message.role === SYSTEM_INSTRUCTION_ROLE) {
				for (const part of message.parts ?? []) {
					if (part.text) systemParts.push(part.text);
				}
			} else {
				contents.push(message);
			}
		}
		return {
			contents,
			systemInstruction:
				systemParts.length > 0 ? systemParts.join("\n") : undefined,
		};
	}

	generateMessages(params: {
		query: string;
		thread?: ThreadObject;
		systemPrompt?: string;
	}): Content[] {
		const { query, thread, systemPrompt } = params;
		const messages: Content[] = !systemPrompt
			? []
			: [
					{
						role: SYSTEM_INSTRUCTION_ROLE,
						parts: [{ text: systemPrompt.trim() }],
					},
				];
		const sessionContent: Content[] = !thread
			? []
			: thread.messages.map((message: MessageObject) => {
					// TODO: check message.content.type
					// Prefer the real query stashed in metadata when a display text was
					// shown in its place (displayQuery), so multi-turn history carries
					// the actual query the model saw on the first turn — not the short
					// label. Falls back to the stored content otherwise.
					const text =
						typeof message.metadata?.query === "string"
							? message.metadata.query
							: (message.content.parts[0] as string);
					return {
						role: this.getMessageRole(message.role),
						parts: [{ text }],
					};
				});
		const userContent: Content = { role: "user", parts: [{ text: query }] };
		return messages.concat(sessionContent).concat(userContent);
	}

	appendAssistantToolCallTurn(
		messages: Content[],
		turn: AssistantToolCallTurn,
	): void {
		const parts: Part[] = [];
		if (turn.content) {
			parts.push({ text: turn.content });
		}
		for (const tc of turn.toolCalls) {
			let args: Record<string, unknown> = {};
			try {
				args = JSON.parse(tc.function.arguments || "{}");
			} catch {
				// Forward the raw argument string so the model can self-correct.
				args = { __raw: tc.function.arguments };
			}
			parts.push({
				functionCall: {
					id: tc.id,
					name: tc.function.name,
					args,
				},
			});
		}
		messages.push({ role: "model", parts });
	}

	appendToolResult(messages: Content[], result: ToolResultMessage): void {
		const response: Record<string, unknown> = result.isError
			? { error: result.content }
			: { output: result.content };
		messages.push({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: result.toolCallId,
						name: result.toolName,
						response,
					},
				},
			],
		});
	}

	async fetch(
		messages: Content[],
		options?: ModelFetchOptions,
	): Promise<FetchResponse> {
		void options; // No Gemini equivalent for reasoning/verbosity; kept for parity.
		const startedAt = Date.now();
		this.logCallStart("fetch", messages.length);
		try {
			const { contents, systemInstruction } =
				this.splitSystemInstruction(messages);
			const config: GenerateContentConfig = {
				...(systemInstruction ? { systemInstruction } : {}),
			};
			const response = await this.client.models.generateContent({
				model: this.modelName,
				contents,
				config,
			});
			this.logCallSuccess("fetch", startedAt);

			return { content: response.text };
		} catch (error) {
			this.logCallFailure("fetch", startedAt, error);
			throw error;
		}
	}

	async fetchWithContextMessage(
		messages: Content[],
		functions: FunctionDeclaration[],
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
				const toolChoiceMode =
					options?.toolChoice === "required"
						? FunctionCallingConfigMode.ANY
						: FunctionCallingConfigMode.AUTO;
				const { contents, systemInstruction } =
					this.splitSystemInstruction(messages);
				const response = await this.client.models.generateContent({
					model: this.modelName,
					contents,
					config: {
						...(systemInstruction ? { systemInstruction } : {}),
						tools: [{ functionDeclarations: functions }],
						toolConfig: {
							functionCallingConfig: { mode: toolChoiceMode },
						},
					},
				});
				this.logCallSuccess("fetchWithContextMessage", startedAt);

				const { text, functionCalls } = response;
				const hasName = (
					value: FunctionCall,
				): value is FunctionCall & { name: string } => {
					return value.name !== undefined;
				};
				const toolCalls: ToolCall[] | undefined = functionCalls
					?.filter(hasName)
					.map((value) => {
						return {
							name: value.name,
							arguments: value.args,
						};
					});

				return {
					content: text,
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
		messages: Content[],
		functions: FunctionDeclaration[],
		options?: ModelFetchOptions,
	): Promise<LLMStream> {
		const startedAt = Date.now();
		this.logCallStart(
			"fetchStreamWithContextMessage",
			messages.length,
			functions.length,
		);
		try {
			const toolChoiceMode =
				options?.toolChoice === "required"
					? FunctionCallingConfigMode.ANY
					: FunctionCallingConfigMode.AUTO;
			const { contents, systemInstruction } =
				this.splitSystemInstruction(messages);
			const config: GenerateContentConfig = {
				...(systemInstruction ? { systemInstruction } : {}),
				...(functions.length > 0
					? {
							tools: [{ functionDeclarations: functions }],
							toolConfig: {
								functionCallingConfig: { mode: toolChoiceMode },
							},
						}
					: {}),
			};
			const stream = await this.client.models.generateContentStream({
				model: this.modelName,
				contents,
				config,
			});

			return this.withStreamLogging(
				this.createGeminiStreamAdapter(stream),
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
	private createGeminiStreamAdapter(
		geminiStream: AsyncIterable<GenerateContentResponse>,
	): LLMStream {
		const hasName = (
			value: FunctionCall,
		): value is FunctionCall & { name: string } => {
			return value.name !== undefined;
		};

		return {
			async *[Symbol.asyncIterator](): AsyncIterator<StreamChunk> {
				let toolCallIndex = 0;
				for await (const geminiChunk of geminiStream) {
					const content = geminiChunk.candidates?.[0]?.content;
					if (!content) continue;

					const tool_calls: ToolCallDelta[] = [];
					let textContent = "";

					// Process all parts in the array
					for (const part of content.parts || []) {
						if (part.text) {
							textContent += part.text;
						} else if (part.functionCall && hasName(part.functionCall)) {
							tool_calls.push({
								index: toolCallIndex++,
								id: part.functionCall.id || `call_${toolCallIndex}`,
								function: {
									name: part.functionCall.name,
									arguments: JSON.stringify(part.functionCall.args),
								},
							} as unknown as ToolCallDelta);
						}
					}

					// Only yield when there's text content
					if (textContent) {
						yield {
							delta: {
								role: content.role,
								content: textContent,
								tool_calls: undefined,
							},
							finish_reason: geminiChunk.candidates?.[0]?.finishReason as any,
							metadata: { provider: "gemini" },
						};
					}

					// Only yield when there are tool calls
					if (tool_calls.length > 0) {
						yield {
							delta: {
								role: content.role,
								content: undefined,
								tool_calls,
							},
							finish_reason: geminiChunk.candidates?.[0]?.finishReason as any,
							metadata: { provider: "gemini" },
						};
					}
				}
			},
		};
	}

	convertToolsToFunctions(tools: ConnectorTool[]): FunctionDeclaration[] {
		const functions: FunctionDeclaration[] = [];
		for (const tool of tools) {
			functions.push({
				name: tool.toolName,
				description: tool.description,
				parametersJsonSchema: tool.inputSchema,
			});
		}
		return functions;
	}
}
