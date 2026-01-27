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
import { AzureOpenAI as AzureOpenAIClient } from "openai";
import type {
	ChatCompletionMessageParam as CCMessageParam,
	ChatCompletionChunk,
	ChatCompletionMessageFunctionToolCall,
	ChatCompletionMessageToolCall,
	ChatCompletionTool,
} from "openai/resources";

export class AzureOpenAI extends BaseModel<CCMessageParam, ChatCompletionTool> {
	private client: AzureOpenAIClient;
	private modelName: string;

	constructor(
		baseUrl: string,
		apiKey: string,
		apiVersion: string,
		modelName: string,
	) {
		super();
		this.client = new AzureOpenAIClient({
			baseURL: baseUrl,
			apiKey: apiKey,
			apiVersion: apiVersion,
		});
		this.modelName = modelName;
	}

	private getMessageRole(role: MessageRole) {
		switch (role) {
			case MessageRole.USER:
				return "user";
			case MessageRole.MODEL:
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
	}): CCMessageParam[] {
		const { query, thread, systemPrompt } = params;
		const messages: CCMessageParam[] = !systemPrompt
			? []
			: [{ role: "system", content: systemPrompt.trim() }];
		const sessionContent: CCMessageParam[] = !thread
			? []
			: thread.messages.map((message: MessageObject) => {
					return {
						role: this.getMessageRole(message.role),
						content: message.content.parts[0],
					};
				});
		const userContent: CCMessageParam = { role: "user", content: query };
		return messages.concat(sessionContent).concat(userContent);
	}

	appendMessages(messages: CCMessageParam[], message: string): void {
		messages.push({
			role: "user",
			content: message,
		});
	}

	async fetch(
		messages: CCMessageParam[],
		options?: ModelFetchOptions,
	): Promise<FetchResponse> {
		const response = await this.client.chat.completions.create({
			model: this.modelName,
			messages,
			reasoning_effort: options?.reasoning,
			verbosity: options?.verbosity,
		});

		return {
			content: response.choices[0].message.content || undefined,
		};
	}

	async fetchWithContextMessage(
		messages: CCMessageParam[],
		functions: ChatCompletionTool[],
		options?: ModelFetchOptions,
	): Promise<FetchResponse> {
		if (functions.length > 0) {
			const response = await this.client.chat.completions.create({
				model: this.modelName,
				messages,
				tools: functions,
				tool_choice: functions.length > 0 ? "auto" : "none",
				reasoning_effort: options?.reasoning,
				verbosity: options?.verbosity,
			});

			const { content, tool_calls } = response.choices[0].message;

			const toolCalls: ToolCall[] | undefined = tool_calls?.map(
				(value: ChatCompletionMessageToolCall) => {
					const v = value as ChatCompletionMessageFunctionToolCall;
					return {
						name: v.function.name,
						// FIXME: value.function.arguments could not be a valid JSON
						arguments: JSON.parse(v.function.arguments),
					};
				},
			);

			return {
				content: content || undefined,
				toolCalls,
			};
		}
		return await this.fetch(messages);
	}

	async fetchStreamWithContextMessage(
		messages: CCMessageParam[],
		functions: ChatCompletionTool[],
		options?: ModelFetchOptions,
	): Promise<LLMStream> {
		const stream = await this.client.chat.completions.create({
			model: this.modelName,
			messages,
			tools: functions,
			tool_choice: functions.length > 0 ? "auto" : "none",
			stream: true,
			reasoning_effort: options?.reasoning,
			verbosity: options?.verbosity,
		});
		return this.createOpenAIStreamAdapter(stream);
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
