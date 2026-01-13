import { BaseModel, ModelFetchOptions } from "@ainetwork/adk/modules";
import { MessageObject, MessageRole, type ThreadObject } from "@ainetwork/adk/types/memory";
import type {
	LLMStream,
	StreamChunk,
	ToolCallDelta,
} from "@ainetwork/adk/types/stream";
import type {
	FetchResponse,
	ToolCall,
	ConnectorTool,
} from "@ainetwork/adk/types/connector";
import {
	type Content,
	type FunctionCall,
	type FunctionDeclaration,
	type GenerateContentResponse,
	GoogleGenAI,
	Model,
} from "@google/genai";

export class GeminiModel extends BaseModel<Content, FunctionDeclaration> {
	private client: GoogleGenAI;
	private modelName: string;

	constructor(apiKey: string, modelName: string) {
		super();
		this.client = new GoogleGenAI({ apiKey });
		this.modelName = modelName;
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

	generateMessages(params: {
		query: string;
		thread?: ThreadObject;
		systemPrompt?: string;
	}): Content[] {
		const { query, thread, systemPrompt } = params;
		const messages: Content[] = !systemPrompt
			? []
			: [{ role: "model", parts: [{ text: systemPrompt.trim() }] }];
		const sessionContent: Content[] = !thread
			? []
			: thread.messages.map((message: MessageObject) => {
					// TODO: check message.content.type
					return {
						role: this.getMessageRole(message.role),
						parts: [{ text: message.content.parts[0] }],
					};
				});
		const userContent: Content = { role: "user", parts: [{ text: query }] };
		return messages.concat(sessionContent).concat(userContent);
	}

	appendMessages(messages: Content[], message: string): void {
		messages.push({
			role: "user",
			parts: [{ text: message }],
		});
	}

	async fetch(messages: Content[], options?: ModelFetchOptions): Promise<FetchResponse> {
		const response = await this.client.models.generateContent({
			model: this.modelName,
			contents: messages,
		});

		return { content: response.text };
	}

	async fetchWithContextMessage(
		messages: Content[],
		functions: FunctionDeclaration[],
		options?: ModelFetchOptions,
	): Promise<FetchResponse> {
		if (functions.length > 0) {
			const response = await this.client.models.generateContent({
				model: this.modelName,
				contents: messages,
				config: {
					tools: [{ functionDeclarations: functions }],
				},
			});

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
		}
		return await this.fetch(messages);
	}

	async fetchStreamWithContextMessage(
		messages: Content[],
		functions: FunctionDeclaration[],
		options?: ModelFetchOptions,
	): Promise<LLMStream> {
		const stream = await this.client.models.generateContentStream({
			model: this.modelName,
			contents: messages,
			config: { tools: [{ functionDeclarations: functions }] },
		});

		return this.createGeminiStreamAdapter(stream);
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
