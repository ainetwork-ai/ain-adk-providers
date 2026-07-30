import { loggers } from "@ainetwork/adk/utils/logger";
import type { ChatCompletionMessageParam } from "openai/resources";
import { AzureOpenAI } from "../index";

const mockCreate = jest.fn();

jest.mock("openai", () => ({
	AzureOpenAI: jest.fn().mockImplementation(() => ({
		chat: { completions: { create: mockCreate } },
	})),
}));

const MockedClient = jest.requireMock("openai").AzureOpenAI as jest.Mock;

function makeProvider(extra?: {
	timeout?: number;
	maxRetries?: number;
}): AzureOpenAI {
	return new AzureOpenAI({
		endpoint: "https://example.azure.test",
		apiKey: "test-key",
		apiVersion: "2024-10-21",
		modelName: "gpt-test",
		...extra,
	});
}

function textResponse(content: string | null) {
	return { choices: [{ message: { content } }] };
}

async function* fakeStream() {
	yield {
		id: "c1",
		model: "gpt-test",
		choices: [
			{ delta: { role: "assistant", content: "hi" }, finish_reason: null },
		],
	};
	yield {
		id: "c1",
		model: "gpt-test",
		choices: [{ delta: {}, finish_reason: "stop" }],
	};
}

const userMessages: ChatCompletionMessageParam[] = [
	{ role: "user", content: "hello" },
];

beforeEach(() => {
	mockCreate.mockReset();
	MockedClient.mockClear();
});

describe("AzureOpenAI client configuration", () => {
	it("passes default timeout (120000ms) and maxRetries (1) to the client", () => {
		makeProvider();
		expect(MockedClient).toHaveBeenCalledWith(
			expect.objectContaining({ timeout: 120_000, maxRetries: 1 }),
		);
	});

	it("honors configured timeout and maxRetries", () => {
		makeProvider({ timeout: 5_000, maxRetries: 3 });
		expect(MockedClient).toHaveBeenCalledWith(
			expect.objectContaining({ timeout: 5_000, maxRetries: 3 }),
		);
	});
});

describe("AzureOpenAI empty-tools guard", () => {
	it("omits tools/tool_choice on the non-streaming path when functions are empty", async () => {
		mockCreate.mockResolvedValue(textResponse("ok"));
		const provider = makeProvider();

		await provider.fetchWithContextMessage(userMessages, []);

		expect(mockCreate).toHaveBeenCalledTimes(1);
		const payload = mockCreate.mock.calls[0][0];
		expect(payload).not.toHaveProperty("tools");
		expect(payload).not.toHaveProperty("tool_choice");
	});

	it("omits tools/tool_choice on the streaming path when functions are empty", async () => {
		mockCreate.mockResolvedValue(fakeStream());
		const provider = makeProvider();

		await provider.fetchStreamWithContextMessage(userMessages, []);

		const payload = mockCreate.mock.calls[0][0];
		expect(payload).not.toHaveProperty("tools");
		expect(payload).not.toHaveProperty("tool_choice");
		expect(payload.stream).toBe(true);
	});

	it("still sends tools/tool_choice on the streaming path when functions exist", async () => {
		mockCreate.mockResolvedValue(fakeStream());
		const provider = makeProvider();
		const tools = provider.convertToolsToFunctions([
			{ toolName: "t1", description: "d", inputSchema: { type: "object" } },
			// biome-ignore lint/suspicious/noExplicitAny: minimal test fixture
		] as any);

		await provider.fetchStreamWithContextMessage(userMessages, tools);

		const payload = mockCreate.mock.calls[0][0];
		expect(payload.tools).toHaveLength(1);
		expect(payload.tool_choice).toBe("auto");
	});
});

describe("AzureOpenAI tool-call argument parsing", () => {
	it("forwards malformed tool-call JSON as {__raw} instead of throwing", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: {
						content: null,
						tool_calls: [
							{
								id: "call_1",
								type: "function",
								function: { name: "search", arguments: "{not json" },
							},
						],
					},
				},
			],
		});
		const provider = makeProvider();
		const tools = provider.convertToolsToFunctions([
			{ toolName: "search", description: "d", inputSchema: { type: "object" } },
			// biome-ignore lint/suspicious/noExplicitAny: minimal test fixture
		] as any);

		const result = await provider.fetchWithContextMessage(userMessages, tools);

		expect(result.toolCalls).toEqual([
			{ name: "search", arguments: { __raw: "{not json" } },
		]);
	});
});

describe("AzureOpenAI options forwarding", () => {
	it("forwards ModelFetchOptions when falling back to fetch on empty functions", async () => {
		mockCreate.mockResolvedValue(textResponse("ok"));
		const provider = makeProvider();

		await provider.fetchWithContextMessage(userMessages, [], {
			reasoning: "low",
			verbosity: "high",
		});

		const payload = mockCreate.mock.calls[0][0];
		expect(payload.reasoning_effort).toBe("low");
		expect(payload.verbosity).toBe("high");
	});
});

describe("AzureOpenAI role mapping", () => {
	it("maps MODEL history messages to role 'assistant'", () => {
		const provider = makeProvider();
		const messages = provider.generateMessages({
			query: "next",
			thread: {
				messages: [
					{
						messageId: "m1",
						role: "MODEL",
						timestamp: 1,
						content: { type: "text", parts: ["previous answer"] },
					},
				],
				// biome-ignore lint/suspicious/noExplicitAny: minimal test fixture
			} as any,
		});

		const history = messages.find((m) => m.content === "previous answer");
		expect(history?.role).toBe("assistant");
	});
});

describe("AzureOpenAI model-call logging", () => {
	let debugSpy: jest.SpyInstance;
	let infoSpy: jest.SpyInstance;
	let errorSpy: jest.SpyInstance;

	beforeEach(() => {
		debugSpy = jest.spyOn(loggers.model, "debug").mockImplementation();
		infoSpy = jest.spyOn(loggers.model, "info").mockImplementation();
		errorSpy = jest.spyOn(loggers.model, "error").mockImplementation();
	});

	afterEach(() => {
		debugSpy.mockRestore();
		infoSpy.mockRestore();
		errorSpy.mockRestore();
	});

	it("logs start (debug) and completion (info with durationMs) on fetch", async () => {
		mockCreate.mockResolvedValue(textResponse("ok"));
		const provider = makeProvider();

		await provider.fetch(userMessages);

		expect(debugSpy).toHaveBeenCalledWith(
			expect.stringContaining("fetch"),
			expect.objectContaining({
				provider: "azure-openai",
				model: "gpt-test",
				messageCount: 1,
			}),
		);
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringContaining("fetch"),
			expect.objectContaining({ durationMs: expect.any(Number) }),
		);
	});

	it("never logs message contents or the apiKey", async () => {
		mockCreate.mockResolvedValue(textResponse("ok"));
		const provider = makeProvider();

		await provider.fetch([{ role: "user", content: "SECRET-CONTENT" }]);

		const allMeta = JSON.stringify([
			...debugSpy.mock.calls,
			...infoSpy.mock.calls,
		]);
		expect(allMeta).not.toContain("SECRET-CONTENT");
		expect(allMeta).not.toContain("test-key");
	});

	it("logs an error with the failure message and rethrows", async () => {
		mockCreate.mockRejectedValue(new Error("boom"));
		const provider = makeProvider();

		await expect(provider.fetch(userMessages)).rejects.toThrow("boom");
		expect(errorSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ error: "boom" }),
		);
	});

	it("logs stream completion only after the stream is fully consumed", async () => {
		mockCreate.mockResolvedValue(fakeStream());
		const provider = makeProvider();

		const stream = await provider.fetchStreamWithContextMessage(
			userMessages,
			[],
		);
		expect(infoSpy).not.toHaveBeenCalled();

		for await (const _chunk of stream) {
			// drain
		}

		expect(infoSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ durationMs: expect.any(Number) }),
		);
	});
});
