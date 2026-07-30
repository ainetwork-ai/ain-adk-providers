import { loggers } from "@ainetwork/adk/utils/logger";
import type { Content } from "@google/genai";
import { GeminiModel } from "../index";

const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();

jest.mock("@google/genai", () => {
	const actual = jest.requireActual("@google/genai");
	return {
		...actual,
		GoogleGenAI: jest.fn().mockImplementation(() => ({
			models: {
				generateContent: mockGenerateContent,
				generateContentStream: mockGenerateContentStream,
			},
		})),
	};
});

const MockedGoogleGenAI = jest.requireMock("@google/genai")
	.GoogleGenAI as jest.Mock;

function makeProvider(timeout?: number): GeminiModel {
	return new GeminiModel({
		apiKey: "test-key",
		modelName: "gemini-test",
		timeout,
	});
}

async function* fakeGeminiStream() {
	yield {
		candidates: [
			{
				content: { role: "model", parts: [{ text: "hi" }] },
				finishReason: "STOP",
			},
		],
	};
}

const userMessages: Content[] = [{ role: "user", parts: [{ text: "hello" }] }];

beforeEach(() => {
	mockGenerateContent.mockReset();
	mockGenerateContentStream.mockReset();
	MockedGoogleGenAI.mockClear();
});

describe("GeminiModel client configuration", () => {
	it("passes a default httpOptions.timeout of 120000ms", () => {
		makeProvider();
		expect(MockedGoogleGenAI).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: "test-key",
				httpOptions: expect.objectContaining({ timeout: 120_000 }),
			}),
		);
	});

	it("honors a configured timeout", () => {
		makeProvider(5_000);
		expect(MockedGoogleGenAI).toHaveBeenCalledWith(
			expect.objectContaining({
				httpOptions: expect.objectContaining({ timeout: 5_000 }),
			}),
		);
	});

	it("supports the legacy positional constructor", () => {
		const provider = new GeminiModel("legacy-key", "gemini-test");
		expect(provider).toBeInstanceOf(GeminiModel);
		expect(MockedGoogleGenAI).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: "legacy-key",
				httpOptions: expect.objectContaining({ timeout: 120_000 }),
			}),
		);
	});
});

describe("GeminiModel system prompt handling", () => {
	it("does not inject the systemPrompt as a role:'model' message", () => {
		const provider = makeProvider();
		const messages = provider.generateMessages({
			query: "hi",
			systemPrompt: "You are helpful.",
		});

		expect(
			messages.some(
				(m) =>
					m.role === "model" &&
					(m.parts ?? []).some((p) => p.text === "You are helpful."),
			),
		).toBe(false);
	});

	it("sends the systemPrompt via config.systemInstruction on fetch", async () => {
		mockGenerateContent.mockResolvedValue({ text: "ok" });
		const provider = makeProvider();
		const messages = provider.generateMessages({
			query: "hi",
			systemPrompt: "You are helpful.",
		});

		await provider.fetch(messages);

		const payload = mockGenerateContent.mock.calls[0][0];
		expect(payload.config?.systemInstruction).toBe("You are helpful.");
		// The system prompt must not remain in contents.
		expect(JSON.stringify(payload.contents).includes("You are helpful.")).toBe(
			false,
		);
		expect(payload.contents[payload.contents.length - 1].role).toBe("user");
	});

	it("sends the systemPrompt via config.systemInstruction on the streaming path", async () => {
		mockGenerateContentStream.mockResolvedValue(fakeGeminiStream());
		const provider = makeProvider();
		const messages = provider.generateMessages({
			query: "hi",
			systemPrompt: "You are helpful.",
		});

		await provider.fetchStreamWithContextMessage(messages, []);

		const payload = mockGenerateContentStream.mock.calls[0][0];
		expect(payload.config?.systemInstruction).toBe("You are helpful.");
		expect(JSON.stringify(payload.contents).includes("You are helpful.")).toBe(
			false,
		);
	});
});

describe("GeminiModel empty-tools guard", () => {
	it("omits tools/toolConfig on the streaming path when functions are empty", async () => {
		mockGenerateContentStream.mockResolvedValue(fakeGeminiStream());
		const provider = makeProvider();

		await provider.fetchStreamWithContextMessage(userMessages, []);

		const payload = mockGenerateContentStream.mock.calls[0][0];
		expect(payload.config ?? {}).not.toHaveProperty("tools");
		expect(payload.config ?? {}).not.toHaveProperty("toolConfig");
	});

	it("still sends tools/toolConfig on the streaming path when functions exist", async () => {
		mockGenerateContentStream.mockResolvedValue(fakeGeminiStream());
		const provider = makeProvider();
		const tools = provider.convertToolsToFunctions([
			{ toolName: "t1", description: "d", inputSchema: { type: "object" } },
			// biome-ignore lint/suspicious/noExplicitAny: minimal test fixture
		] as any);

		await provider.fetchStreamWithContextMessage(userMessages, tools);

		const payload = mockGenerateContentStream.mock.calls[0][0];
		expect(payload.config.tools).toEqual([{ functionDeclarations: tools }]);
	});

	it("does not send an empty functionDeclarations wrapper on the non-streaming path", async () => {
		mockGenerateContent.mockResolvedValue({ text: "ok" });
		const provider = makeProvider();

		await provider.fetchWithContextMessage(userMessages, []);

		const payload = mockGenerateContent.mock.calls[0][0];
		expect(JSON.stringify(payload)).not.toContain("functionDeclarations");
	});
});

describe("GeminiModel options forwarding", () => {
	it("forwards ModelFetchOptions when falling back to fetch on empty functions", async () => {
		mockGenerateContent.mockResolvedValue({ text: "ok" });
		const provider = makeProvider();
		const fetchSpy = jest.spyOn(provider, "fetch");
		const options = { reasoning: "low" as const };

		await provider.fetchWithContextMessage(userMessages, [], options);

		expect(fetchSpy).toHaveBeenCalledWith(userMessages, options);
	});
});

describe("GeminiModel model-call logging", () => {
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
		mockGenerateContent.mockResolvedValue({ text: "ok" });
		const provider = makeProvider();

		await provider.fetch(userMessages);

		expect(debugSpy).toHaveBeenCalledWith(
			expect.stringContaining("fetch"),
			expect.objectContaining({
				provider: "gemini",
				model: "gemini-test",
				messageCount: 1,
			}),
		);
		expect(infoSpy).toHaveBeenCalledWith(
			expect.stringContaining("fetch"),
			expect.objectContaining({ durationMs: expect.any(Number) }),
		);
	});

	it("never logs message contents or the apiKey", async () => {
		mockGenerateContent.mockResolvedValue({ text: "ok" });
		const provider = makeProvider();

		await provider.fetch([
			{ role: "user", parts: [{ text: "SECRET-CONTENT" }] },
		]);

		const allMeta = JSON.stringify([
			...debugSpy.mock.calls,
			...infoSpy.mock.calls,
		]);
		expect(allMeta).not.toContain("SECRET-CONTENT");
		expect(allMeta).not.toContain("test-key");
	});

	it("logs an error with the failure message and rethrows", async () => {
		mockGenerateContent.mockRejectedValue(new Error("boom"));
		const provider = makeProvider();

		await expect(provider.fetch(userMessages)).rejects.toThrow("boom");
		expect(errorSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ error: "boom" }),
		);
	});

	it("logs stream completion only after the stream is fully consumed", async () => {
		mockGenerateContentStream.mockResolvedValue(fakeGeminiStream());
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
