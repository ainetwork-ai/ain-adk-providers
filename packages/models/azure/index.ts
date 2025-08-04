import { BaseModel } from "@ainetwork/adk/modules";
import { ChatRole, type SessionObject } from "@ainetwork/adk/types/memory";
import type {
	LLMStream,
	StreamChunk,
	ToolCallDelta,
} from "@ainetwork/adk/types/stream";
import type {
	FetchResponse,
	IA2ATool,
	IAgentTool,
	IMCPTool,
	ToolCall,
} from "@ainetwork/adk/types/tool";
import { TOOL_PROTOCOL_TYPE } from "@ainetwork/adk/types/tool";
import { AzureOpenAI as AzureOpenAIClient } from "openai";
import type {
	ChatCompletionMessageParam as CCMessageParam,
	ChatCompletionChunk,
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

	private getMessageRole(role: ChatRole) {
		switch (role) {
			case ChatRole.USER:
				return "user";
			case ChatRole.MODEL:
			case ChatRole.SYSTEM:
				return "system";
			default:
				return "system"; /*FIXME*/
		}
	}

	generateMessages(params: {
		query: string;
		sessionHistory?: SessionObject;
		systemPrompt?: string;
	}): CCMessageParam[] {
		const { query, sessionHistory, systemPrompt } = params;
		const messages: CCMessageParam[] = !systemPrompt
			? []
			: [{ role: "system", content: systemPrompt.trim() }];
		const sessionContent: CCMessageParam[] = !sessionHistory
			? []
			: Object.keys(sessionHistory.chats).map((chatId: string) => {
					const chat = sessionHistory.chats[chatId];
					return {
						role: this.getMessageRole(chat.role),
						content: chat.content.parts[0],
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

	async fetch(messages: CCMessageParam[]): Promise<FetchResponse> {
		const response = await this.client.chat.completions.create({
			model: this.modelName,
			messages,
		});

		return {
			content: response.choices[0].message.content || undefined,
		};
	}

	async fetchWithContextMessage(
		messages: CCMessageParam[],
		functions: ChatCompletionTool[],
	): Promise<FetchResponse> {
		if (functions.length > 0) {
			const response = await this.client.chat.completions.create({
				model: this.modelName,
				messages,
				tools: functions,
				tool_choice: "auto",
			});

			const { content, tool_calls } = response.choices[0].message;

			const toolCalls: ToolCall[] | undefined = tool_calls?.map(
				(value: ChatCompletionMessageToolCall) => {
					return {
						name: value.function.name,
						// FIXME: value.function.arguments could not be a valid JSON
						arguments: JSON.parse(value.function.arguments),
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
	) {
		const stream = await this.client.chat.completions.create({
			model: this.modelName,
			messages,
			tools: functions,
			tool_choice: "auto",
			stream: true,
		});
		return await this.createOpenAIStreamAdapter(stream);
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
								role: choice.delta.role,
								content: choice.delta.content || undefined,
								tool_calls: choice.delta.tool_calls?.map(
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

	convertToolsToFunctions(tools: IAgentTool[]): ChatCompletionTool[] {
		const functions: ChatCompletionTool[] = [];
		for (const tool of tools) {
			if (!tool.enabled) {
				continue;
			}
			if (tool.protocol === TOOL_PROTOCOL_TYPE.MCP) {
				const { mcpTool, id } = tool as IMCPTool;
				functions.push({
					type: "function",
					function: {
						name: id,
						description: mcpTool.description,
						parameters: mcpTool.inputSchema,
					},
				});
			} else {
				// PROTOCOL_TYPE.A2A
				const { id, card } = tool as IA2ATool;
				functions.push({
					type: "function",
					function: {
						name: id,
						description: card.description,
					},
				});
			}
		}
		return functions;
	}
}
