import type { UserWorkflow } from "@ainetwork/adk/types/memory";
import { InMemoryUserWorkflow } from "../implements/user-workflow.memory";

function wf(id: string, updatedAt: string): UserWorkflow {
	return { workflowId: id, userId: "u1", updatedAt } as UserWorkflow;
}

describe("InMemoryUserWorkflow pagination", () => {
	it("sorts updatedAt desc and slices when options given; count reports all", async () => {
		const m = new InMemoryUserWorkflow();
		await m.createUserWorkflow(wf("old", "2026-08-01"));
		await m.createUserWorkflow(wf("new", "2026-08-03"));
		await m.createUserWorkflow(wf("mid", "2026-08-02"));

		const items = await m.listUserWorkflows("u1", { limit: 2, offset: 0 });
		expect(items.map((w) => w.workflowId)).toEqual(["new", "mid"]);
		await expect(m.countUserWorkflows("u1")).resolves.toBe(3);
	});

	it("without options returns everything unchanged (legacy behavior)", async () => {
		const m = new InMemoryUserWorkflow();
		await m.createUserWorkflow(wf("a", "2026-08-01"));
		await expect(m.listUserWorkflows("u1")).resolves.toHaveLength(1);
	});
});
