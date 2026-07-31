import { MongoDBScheduleRun } from "../implements/schedule-run.memory";
import { MongoDBThread } from "../implements/thread.memory";
import { ScheduleRunModel } from "../models/schedule-run.model";
import { ThreadModel } from "../models/threads.model";

const passthrough = async <T>(operation: () => Promise<T>): Promise<T> =>
	operation();
const timeout = (): number => 1000;

afterEach(() => {
	jest.restoreAllMocks();
});

describe("listThreads filter sanitization", () => {
	it("drops non-string filter values (operator-object injection)", async () => {
		const findSpy = jest.spyOn(ThreadModel, "find").mockReturnValue({
			sort: () => ({ maxTimeMS: jest.fn().mockResolvedValue([]) }),
		} as never);
		const thread = new MongoDBThread(passthrough, timeout);

		await thread.listThreads("u1", {
			workflowId: { $ne: "" },
			type: "CHAT",
		} as never);

		expect(findSpy).toHaveBeenCalledWith({ userId: "u1", type: "CHAT" });
	});
});

describe("listScheduleRuns filter sanitization", () => {
	it("drops non-string filter values (operator-object injection)", async () => {
		const findSpy = jest.spyOn(ScheduleRunModel, "find").mockReturnValue({
			sort: () => ({
				limit: () => ({
					maxTimeMS: () => ({ lean: jest.fn().mockResolvedValue([]) }),
				}),
			}),
		} as never);
		const scheduleRun = new MongoDBScheduleRun(passthrough, timeout);

		await scheduleRun.listScheduleRuns({
			jobKey: { $ne: "" },
			status: "running",
		} as never);

		expect(findSpy).toHaveBeenCalledWith({ status: "running" });
	});
});
