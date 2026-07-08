import { InMemoryRoleStore } from "../implements/inmemory-role-store";
import { RoleResolver } from "../implements/role-resolver";
import type { Action, Role, RoleAssignment } from "../implements/types";

function role(
	name: string,
	opts: { resource?: string; actions: Action[]; category?: string; scope: string[] },
): Role {
	return {
		roleId: name,
		name,
		resource: opts.resource ?? "document",
		actions: opts.actions,
		category: opts.category,
		scope: opts.scope,
		createdAt: "t",
		updatedAt: "t",
	};
}
function assign(email: string, roleId: string, scope?: Record<string, string>): RoleAssignment {
	return {
		assignmentId: `${email}-${roleId}`,
		email,
		roleId,
		scope,
		createdAt: "t",
		createdBy: "seed",
	};
}

async function fixture() {
	const store = new InMemoryRoleStore();
	await store.createRole(role("admin", { resource: "*", actions: ["read", "write"], scope: [] }));
	await store.createRole(role("wp-manager", { actions: ["read", "write"], category: "logbook", scope: ["workplace"] }));
	await store.createRole(role("wp-writer", { actions: ["read", "write"], scope: ["workplace"] }));
	await store.createRole(role("multi", { actions: ["read", "write"], category: "logbook", scope: ["workplace", "section"] }));
	await store.createAssignment(assign("mgr@x.com", "wp-manager", { workplace: "walkerhill" }));
	await store.createAssignment(assign("boss@x.com", "admin"));
	await store.createAssignment(assign("ops@x.com", "wp-writer", { workplace: "busan" }));
	await store.createAssignment(assign("kit@x.com", "multi", { workplace: "피자힐", section: "주방" }));
	await store.createAssignment(assign("all@x.com", "multi", { workplace: "피자힐" })); // whole workplace
	return new RoleResolver(store, { cacheTtlMs: 0 });
}

describe("RoleResolver", () => {
	it("opens read to everyone (incl. users with no roles)", async () => {
		const r = await fixture();
		expect(await r.can("mgr@x.com", "document", "read", { category: "logbook", workplace: "seoul" })).toBe(true);
		expect(await r.can("ghost@x.com", "document", "read", { category: "logbook", workplace: "busan" })).toBe(true);
		expect(await r.listFilter("ghost@x.com", "document")).toBeNull();
		expect(await r.listFilter("boss@x.com", "document")).toBeNull();
	});

	it("gates writes by scope dimension value", async () => {
		const r = await fixture();
		expect(await r.can("mgr@x.com", "document", "write", { category: "logbook", workplace: "walkerhill" })).toBe(true);
		expect(await r.can("mgr@x.com", "document", "write", { category: "logbook", workplace: "seoul" })).toBe(false);
		expect(await r.can("mgr@x.com", "document", "write", {})).toBe(false);
	});

	it("respects a role's category constraint on writes", async () => {
		const r = await fixture();
		// wp-manager is logbook-only → cannot write a 'report' even in its workplace
		expect(await r.can("mgr@x.com", "document", "write", { category: "report", workplace: "walkerhill" })).toBe(false);
		// wp-writer has no category constraint → can write any category in its workplace
		expect(await r.can("ops@x.com", "document", "write", { category: "report", workplace: "busan" })).toBe(true);
		expect(await r.can("ops@x.com", "document", "write", { category: "report", workplace: "seoul" })).toBe(false);
	});

	it("admin (empty scope, resource *) can write anything", async () => {
		const r = await fixture();
		expect(await r.can("boss@x.com", "document", "write", { category: "x", workplace: "y" })).toBe(true);
	});

	it("matches the principal email case-insensitively", async () => {
		const r = await fixture();
		// The M365 UPN (principal) case can differ from the stored assignment email.
		expect(await r.can("MGR@X.com", "document", "write", { category: "logbook", workplace: "walkerhill" })).toBe(true);
		expect(await r.can("Boss@X.Com", "document", "write", { category: "x", workplace: "y" })).toBe(true);
		expect(await r.can("  mgr@x.com  ", "document", "write", { category: "logbook", workplace: "walkerhill" })).toBe(true);
	});

	it("multi-dimension: every specified dimension must match", async () => {
		const r = await fixture();
		expect(await r.can("kit@x.com", "document", "write", { category: "logbook", workplace: "피자힐", section: "주방" })).toBe(true);
		expect(await r.can("kit@x.com", "document", "write", { category: "logbook", workplace: "피자힐", section: "홀" })).toBe(false);
		expect(await r.can("kit@x.com", "document", "write", { category: "logbook", workplace: "강남", section: "주방" })).toBe(false);
	});

	it("partial assignment leaves omitted dimensions as wildcards (whole workplace)", async () => {
		const r = await fixture();
		expect(await r.can("all@x.com", "document", "write", { category: "logbook", workplace: "피자힐", section: "주방" })).toBe(true);
		expect(await r.can("all@x.com", "document", "write", { category: "logbook", workplace: "피자힐", section: "홀" })).toBe(true);
		expect(await r.can("all@x.com", "document", "write", { category: "logbook", workplace: "강남", section: "주방" })).toBe(false);
	});
});
