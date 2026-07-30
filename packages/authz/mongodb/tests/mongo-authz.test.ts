import { loggers } from "@ainetwork/adk/utils/logger";
import mongoose from "mongoose";
import { MongoAuthz } from "../implements/mongo-authz";

type Listener = (...args: unknown[]) => void;

function fakeConnection() {
	const listeners = new Map<string, Listener[]>();
	const fakeModel = { find: () => ({ lean: async () => [] }) };
	const conn = {
		models: {} as Record<string, unknown>,
		model: () => fakeModel,
		on(event: string, cb: Listener) {
			const arr = listeners.get(event) ?? [];
			arr.push(cb);
			listeners.set(event, arr);
			return conn;
		},
		emit(event: string, ...args: unknown[]) {
			for (const cb of listeners.get(event) ?? []) cb(...args);
		},
	};
	return { conn, listeners };
}

describe("MongoAuthz mongo connection observability", () => {
	let createSpy: jest.SpyInstance;
	let infoSpy: jest.SpyInstance;
	let warnSpy: jest.SpyInstance;
	let errorSpy: jest.SpyInstance;

	beforeEach(() => {
		infoSpy = jest
			.spyOn(loggers.agent, "info")
			.mockImplementation((() => loggers.agent) as never);
		warnSpy = jest
			.spyOn(loggers.agent, "warn")
			.mockImplementation((() => loggers.agent) as never);
		errorSpy = jest
			.spyOn(loggers.agent, "error")
			.mockImplementation((() => loggers.agent) as never);
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	function build() {
		const fake = fakeConnection();
		createSpy = jest
			.spyOn(mongoose, "createConnection")
			.mockReturnValue(
				fake.conn as unknown as ReturnType<typeof mongoose.createConnection>,
			);
		const authz = new MongoAuthz({
			connectionString: "mongodb://example/authz",
		});
		return { ...fake, authz };
	}

	it("passes an explicit serverSelectionTimeoutMS", () => {
		build();
		expect(createSpy).toHaveBeenCalledWith(
			"mongodb://example/authz",
			expect.objectContaining({ serverSelectionTimeoutMS: 10_000 }),
		);
	});

	it("attaches connected / disconnected / error listeners", () => {
		const { listeners } = build();
		expect([...listeners.keys()]).toEqual(
			expect.arrayContaining(["connected", "disconnected", "error"]),
		);
	});

	it("logs connection lifecycle events", () => {
		const { conn } = build();
		conn.emit("connected");
		expect(infoSpy).toHaveBeenCalled();
		conn.emit("disconnected");
		expect(warnSpy).toHaveBeenCalled();
		conn.emit("error", new Error("socket closed"));
		expect(errorSpy).toHaveBeenCalled();
		expect(
			errorSpy.mock.calls.some((c) => c.join(" ").includes("socket closed")),
		).toBe(true);
	});
});
