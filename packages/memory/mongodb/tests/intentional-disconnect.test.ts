import mongoose from "mongoose";
import { MongoDBMemory } from "../implements/base.memory";

const flushAsync = async (): Promise<void> => {
	for (let i = 0; i < 10; i++) {
		await new Promise((resolve) => {
			setImmediate(resolve);
		});
	}
};

describe("MongoDBMemory intentional disconnect", () => {
	let memory: MongoDBMemory;
	let connectSpy: jest.SpyInstance;

	beforeAll(() => {
		connectSpy = jest
			.spyOn(mongoose, "connect")
			.mockResolvedValue(mongoose as unknown as typeof mongoose);
		jest.spyOn(mongoose, "disconnect").mockResolvedValue(undefined);
		memory = new MongoDBMemory({
			uri: "mongodb://unit-test",
			reconnectInterval: 1,
		});
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	it("does not start the reconnect loop when disconnect() was requested", async () => {
		await memory.connect();
		connectSpy.mockClear();

		await memory.disconnect();
		mongoose.connection.emit("disconnected");
		await flushAsync();

		expect(connectSpy).not.toHaveBeenCalled();
		expect(memory.isConnected()).toBe(false);
	});

	it("still reconnects on unexpected disconnects after a fresh connect()", async () => {
		await memory.connect();
		connectSpy.mockClear();

		mongoose.connection.emit("disconnected");
		await flushAsync();

		expect(connectSpy).toHaveBeenCalled();
	});
});
