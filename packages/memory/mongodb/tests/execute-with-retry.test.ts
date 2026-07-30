import { loggers } from "@ainetwork/adk/utils/logger";
import mongoose from "mongoose";
import { MongoDBMemory } from "../implements/base.memory";

type RetryRunner = {
	executeWithRetry: <T>(
		operation: () => Promise<T>,
		operationName?: string,
	) => Promise<T>;
};

describe("MongoDBMemory.executeWithRetry", () => {
	let memory: MongoDBMemory;
	let connectSpy: jest.SpyInstance;
	let disconnectSpy: jest.SpyInstance;

	const run = <T>(op: () => Promise<T>, name?: string): Promise<T> =>
		(memory as unknown as RetryRunner).executeWithRetry(op, name);

	beforeAll(() => {
		connectSpy = jest
			.spyOn(mongoose, "connect")
			.mockResolvedValue(mongoose as unknown as typeof mongoose);
		disconnectSpy = jest
			.spyOn(mongoose, "disconnect")
			.mockResolvedValue(undefined);
		memory = new MongoDBMemory({
			uri: "mongodb://unit-test",
			reconnectInterval: 10,
		});
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.clearAllMocks();
	});

	it("logs a debug line when an operation starts", async () => {
		const debugSpy = jest.spyOn(loggers.agent, "debug").mockImplementation();
		await run(async () => "ok", "visibleOp");
		expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining("visibleOp"));
	});

	it("warns when an operation exceeds the slow-operation threshold", async () => {
		jest.useFakeTimers();
		const warnSpy = jest.spyOn(loggers.agent, "warn").mockImplementation();
		const promise = run(
			() =>
				new Promise<string>((resolve) => {
					setTimeout(() => resolve("slow-done"), 6000);
				}),
			"slowOp",
		);
		await jest.advanceTimersByTimeAsync(6000);
		await expect(promise).resolves.toBe("slow-done");
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringMatching(/slowOp.*durationMs|slowOp.*\d+ms/),
		);
	});

	it("retries once on transient network errors", async () => {
		const err = new Error("socket closed");
		err.name = "MongoNetworkError";
		const op = jest
			.fn<Promise<string>, []>()
			.mockRejectedValueOnce(err)
			.mockResolvedValueOnce("recovered");

		await expect(run(op, "networkOp")).resolves.toBe("recovered");
		expect(op).toHaveBeenCalledTimes(2);
	});

	it("retries once on errors labeled RetryableWriteError", async () => {
		const err = new Error("write failed") as Error & {
			hasErrorLabel: (label: string) => boolean;
		};
		err.name = "MongoServerError";
		err.hasErrorLabel = (label: string) => label === "RetryableWriteError";
		const op = jest
			.fn<Promise<string>, []>()
			.mockRejectedValueOnce(err)
			.mockResolvedValueOnce("recovered");

		await expect(run(op, "labeledOp")).resolves.toBe("recovered");
		expect(op).toHaveBeenCalledTimes(2);
	});

	it("does NOT retry generic MongoServerError (e.g. duplicate key), even when the message mentions connection", async () => {
		const err = new Error(
			"E11000 duplicate key error on connection",
		) as Error & { code: number; hasErrorLabel: (label: string) => boolean };
		err.name = "MongoServerError";
		err.code = 11000;
		err.hasErrorLabel = () => false;
		const op = jest.fn<Promise<string>, []>().mockRejectedValue(err);

		await expect(run(op, "dupOp")).rejects.toThrow("duplicate key");
		expect(op).toHaveBeenCalledTimes(1);
	});

	it("handles TooManyLogicalSessions loudly: error log, disconnect, then retry", async () => {
		jest.useFakeTimers();
		const errorSpy = jest.spyOn(loggers.agent, "error").mockImplementation();
		const err = new Error("too many sessions") as Error & {
			code: number;
			codeName: string;
		};
		err.code = 261;
		err.codeName = "TooManyLogicalSessions";
		const op = jest
			.fn<Promise<string>, []>()
			.mockRejectedValueOnce(err)
			.mockResolvedValueOnce("recovered");

		const promise = run(op, "sessionOp");
		await jest.advanceTimersByTimeAsync(5000);
		await expect(promise).resolves.toBe("recovered");

		expect(disconnectSpy).toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("TooManyLogicalSessions"),
		);
		expect(op).toHaveBeenCalledTimes(2);
		// The session-exhaustion teardown is NOT an intentional shutdown:
		// reconnection must still happen (via ensureConnection).
		expect(connectSpy).toHaveBeenCalled();
	});
});
