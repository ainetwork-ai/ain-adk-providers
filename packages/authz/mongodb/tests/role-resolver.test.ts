import { InMemoryRoleStore } from "../implements/inmemory-role-store";
import { RoleResolver } from "../implements/role-resolver";
import type { Action, Role, RoleAssignment, RoleScope } from "../implements/types";

function role(
	name: string,
	opts: { resource?: string; actions: Action[]; category?: string; scope: RoleScope },
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
function assign(email: string, roleId: string, fnb?: string): RoleAssignment {
	return {
		assignmentId: `${email}-${roleId}-${fnb ?? "all"}`,
		email,
		roleId,
		fnb,
		createdAt: "t",
		createdBy: "seed",
	};
}

async function fixture() {
	const store = new InMemoryRoleStore();
	await store.createRole(role("admin", { resource: "*", actions: ["read", "write"], scope: "all" }));
	await store.createRole(role("fnb-manager", { actions: ["read", "write"], category: "logbook", scope: "fnb" }));
	await store.createRole(role("fnb-viewer", { actions: ["read"], category: "logbook", scope: "fnb" }));
	await store.createRole(role("fnb-writer", { actions: ["read", "write"], scope: "fnb" }));
	await store.createAssignment(assign("mgr@x.com", "fnb-manager", "walkerhill"));
	await store.createAssignment(assign("boss@x.com", "admin"));
	await store.createAssignment(assign("ops@x.com", "fnb-writer", "busan"));
	return new RoleResolver(store, { cacheTtlMs: 0 });
}

describe("RoleResolver", () => {
	it("opens read to everyone (incl. users with no roles)", async () => {
		const r = await fixture();
		expect(await r.can("mgr@x.com", "document", "read", { category: "logbook", fnb: "seoul" })).toBe(true);
		expect(await r.can("ghost@x.com", "document", "read", { category: "logbook", fnb: "busan" })).toBe(true);
		expect(await r.listFilter("ghost@x.com", "document")).toBeNull();
		expect(await r.listFilter("boss@x.com", "document")).toBeNull();
	});

	it("gates writes by fnb", async () => {
		const r = await fixture();
		expect(await r.can("mgr@x.com", "document", "write", { category: "logbook", fnb: "walkerhill" })).toBe(true);
		expect(await r.can("mgr@x.com", "document", "write", { category: "logbook", fnb: "seoul" })).toBe(false);
		expect(await r.can("mgr@x.com", "document", "write", {})).toBe(false);
	});

	it("respects a role's category constraint on writes", async () => {
		const r = await fixture();
		// fnb-manager is logbook-only → cannot write a 'report' even in its fnb
		expect(await r.can("mgr@x.com", "document", "write", { category: "report", fnb: "walkerhill" })).toBe(false);
		// fnb-writer has no category constraint → can write any category in its fnb
		expect(await r.can("ops@x.com", "document", "write", { category: "report", fnb: "busan" })).toBe(true);
		expect(await r.can("ops@x.com", "document", "write", { category: "report", fnb: "seoul" })).toBe(false);
	});

	it("admin (scope all, resource *) can write anything", async () => {
		const r = await fixture();
		expect(await r.can("boss@x.com", "document", "write", { category: "x", fnb: "y" })).toBe(true);
	});
});
