import { MongoDBThread } from "../implements/thread.memory";
import { MessageModel } from "../models/messages.model";
import { ThreadModel } from "../models/threads.model";

const passthrough = async <T>(operation: () => Promise<T>): Promise<T> =>
	operation();
const timeout = (): number => 1000;

const canonical = {
	messageId: "m1",
	role: "USER" as never,
	timestamp: 1,
	schemaVersion: 2 as const,
	parts: [
		{ kind: "text" as const, text: "hi" },
		{ kind: "artifact" as const, artifactId: "a1", name: "x.png" },
	],
};

const findResult = (value: unknown) => ({
	maxTimeMS: jest.fn().mockResolvedValue(value),
	sort: () => ({ maxTimeMS: jest.fn().mockResolvedValue(value) }),
});

afterEach(() => {
	jest.restoreAllMocks();
});

describe("MongoDBThread canonical (schemaVersion 2) messages", () => {
	const thread = new MongoDBThread(passthrough, timeout);

	// Regression: `content` was required, so the ADK's normalized writes
	// (parts only, no content) failed validation and were never stored.
	it("validates a canonical message without content", () => {
		const doc = new MessageModel({
			...canonical,
			threadId: "t1",
			userId: "u1",
		});
		expect(doc.validateSync()).toBeUndefined();
	});

	it("does not default parts on a legacy record", () => {
		const doc = new MessageModel({
			messageId: "m0",
			threadId: "t1",
			userId: "u1",
			role: "USER",
			timestamp: 0,
			content: { type: "text", parts: ["hi"] },
		});
		expect(doc.parts).toBeUndefined();
	});

	it("writes schemaVersion and parts", async () => {
		jest
			.spyOn(ThreadModel, "updateOne")
			.mockResolvedValue({ matchedCount: 1 } as never);
		jest.spyOn(MessageModel, "deleteMany").mockResolvedValue({} as never);
		const insertSpy = jest
			.spyOn(MessageModel, "insertMany")
			.mockResolvedValue([] as never);

		await thread.addMessagesToThread("u1", "t1", [canonical]);

		expect(insertSpy).toHaveBeenCalledWith([
			expect.objectContaining({
				schemaVersion: 2,
				parts: canonical.parts,
			}),
		]);
	});

	it("reads canonical and legacy records back in their own shape", async () => {
		jest
			.spyOn(ThreadModel, "findOne")
			.mockReturnValue(
				findResult({ threadId: "t1", userId: "u1", type: "CHAT" }) as never,
			);
		jest.spyOn(MessageModel, "find").mockReturnValue(
			findResult([
				{
					messageId: "m0",
					role: "USER",
					timestamp: 0,
					content: { type: "text", parts: ["old"] },
				},
				{ ...canonical, metadata: {} },
			]) as never,
		);

		const result = await thread.getThread("u1", "t1");

		expect(result?.messages).toEqual([
			{
				messageId: "m0",
				role: "USER",
				timestamp: 0,
				content: { type: "text", parts: ["old"] },
				metadata: undefined,
			},
			{
				messageId: "m1",
				role: "USER",
				timestamp: 1,
				schemaVersion: 2,
				parts: canonical.parts,
				metadata: {},
			},
		]);
	});
});
