import { loggers } from "@ainetwork/adk/utils/logger";
import { InMemoryRoleStore } from "../implements/inmemory-role-store";
import { RoleResolver } from "../implements/role-resolver";
import type { Action, Role, RoleAssignment } from "../implements/types";

function role(
	name: string,
	opts: {
		resource?: string;
		actions: Action[];
		category?: string;
		scope: string[];
	},
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
function assign(
	email: string,
	roleId: string,
	scope?: Record<string, string>,
): RoleAssignment {
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
	await store.createRole(
		role("admin", { resource: "*", actions: ["read", "write"], scope: [] }),
	);
	await store.createRole(
		role("wp-manager", {
			actions: ["read", "write"],
			category: "logbook",
			scope: ["workplace"],
		}),
	);
	await store.createRole(
		role("wp-writer", { actions: ["read", "write"], scope: ["workplace"] }),
	);
	await store.createRole(
		role("multi", {
			actions: ["read", "write"],
			category: "logbook",
			scope: ["workplace", "section"],
		}),
	);
	await store.createAssignment(
		assign("mgr@x.com", "wp-manager", { workplace: "walkerhill" }),
	);
	await store.createAssignment(assign("boss@x.com", "admin"));
	await store.createAssignment(
		assign("ops@x.com", "wp-writer", { workplace: "busan" }),
	);
	await store.createAssignment(
		assign("kit@x.com", "multi", { workplace: "피자힐", section: "주방" }),
	);
	await store.createAssignment(
		assign("all@x.com", "multi", { workplace: "피자힐" }),
	); // whole workplace
	return new RoleResolver(store, { cacheTtlMs: 0 });
}

describe("RoleResolver", () => {
	it("opens read to everyone (incl. users with no roles)", async () => {
		const r = await fixture();
		expect(
			await r.can("mgr@x.com", "document", "read", {
				category: "logbook",
				workplace: "seoul",
			}),
		).toBe(true);
		expect(
			await r.can("ghost@x.com", "document", "read", {
				category: "logbook",
				workplace: "busan",
			}),
		).toBe(true);
		expect(await r.listFilter("ghost@x.com", "document")).toBeNull();
		expect(await r.listFilter("boss@x.com", "document")).toBeNull();
	});

	it("gates writes by scope dimension value", async () => {
		const r = await fixture();
		expect(
			await r.can("mgr@x.com", "document", "write", {
				category: "logbook",
				workplace: "walkerhill",
			}),
		).toBe(true);
		expect(
			await r.can("mgr@x.com", "document", "write", {
				category: "logbook",
				workplace: "seoul",
			}),
		).toBe(false);
		expect(await r.can("mgr@x.com", "document", "write", {})).toBe(false);
	});

	it("respects a role's category constraint on writes", async () => {
		const r = await fixture();
		// wp-manager is logbook-only → cannot write a 'report' even in its workplace
		expect(
			await r.can("mgr@x.com", "document", "write", {
				category: "report",
				workplace: "walkerhill",
			}),
		).toBe(false);
		// wp-writer has no category constraint → can write any category in its workplace
		expect(
			await r.can("ops@x.com", "document", "write", {
				category: "report",
				workplace: "busan",
			}),
		).toBe(true);
		expect(
			await r.can("ops@x.com", "document", "write", {
				category: "report",
				workplace: "seoul",
			}),
		).toBe(false);
	});

	it("admin (empty scope, resource *) can write anything", async () => {
		const r = await fixture();
		expect(
			await r.can("boss@x.com", "document", "write", {
				category: "x",
				workplace: "y",
			}),
		).toBe(true);
	});

	it("matches the principal email case-insensitively", async () => {
		const r = await fixture();
		// The M365 UPN (principal) case can differ from the stored assignment email.
		expect(
			await r.can("MGR@X.com", "document", "write", {
				category: "logbook",
				workplace: "walkerhill",
			}),
		).toBe(true);
		expect(
			await r.can("Boss@X.Com", "document", "write", {
				category: "x",
				workplace: "y",
			}),
		).toBe(true);
		expect(
			await r.can("  mgr@x.com  ", "document", "write", {
				category: "logbook",
				workplace: "walkerhill",
			}),
		).toBe(true);
	});

	it("multi-dimension: every specified dimension must match", async () => {
		const r = await fixture();
		expect(
			await r.can("kit@x.com", "document", "write", {
				category: "logbook",
				workplace: "피자힐",
				section: "주방",
			}),
		).toBe(true);
		expect(
			await r.can("kit@x.com", "document", "write", {
				category: "logbook",
				workplace: "피자힐",
				section: "홀",
			}),
		).toBe(false);
		expect(
			await r.can("kit@x.com", "document", "write", {
				category: "logbook",
				workplace: "강남",
				section: "주방",
			}),
		).toBe(false);
	});

	it("partial assignment leaves omitted dimensions as wildcards (whole workplace)", async () => {
		const r = await fixture();
		expect(
			await r.can("all@x.com", "document", "write", {
				category: "logbook",
				workplace: "피자힐",
				section: "주방",
			}),
		).toBe(true);
		expect(
			await r.can("all@x.com", "document", "write", {
				category: "logbook",
				workplace: "피자힐",
				section: "홀",
			}),
		).toBe(true);
		expect(
			await r.can("all@x.com", "document", "write", {
				category: "logbook",
				workplace: "강남",
				section: "주방",
			}),
		).toBe(false);
	});
});

describe("InMemoryRoleStore email matching (mongo store parity)", () => {
	it("matches the stored email case-insensitively, trimming only the principal", async () => {
		const store = new InMemoryRoleStore();
		await store.createAssignment(assign("MiXeD@X.com", "admin"));
		expect(await store.listAssignmentsByEmail("  mixed@x.com  ")).toHaveLength(
			1,
		);
		expect(await store.listAssignmentsByEmail("MIXED@X.COM")).toHaveLength(1);
	});

	it("does NOT trim the stored email (matches the mongo store's semantics)", async () => {
		const store = new InMemoryRoleStore();
		await store.createAssignment(assign(" padded@x.com ", "admin"));
		// The mongo store matches by anchored /i regex against the raw stored
		// value, so stored-side whitespace never matches — the inmemory store
		// must behave the same.
		expect(await store.listAssignmentsByEmail("padded@x.com")).toHaveLength(0);
		expect(await store.listAssignmentsByEmail("  PADDED@X.COM  ")).toHaveLength(
			0,
		);
	});
});

class FlakyStore extends InMemoryRoleStore {
	failing = false;

	override async listRoles(): Promise<Role[]> {
		if (this.failing) throw new Error("db down");
		return super.listRoles();
	}
	override async listAssignmentsByEmail(
		email: string,
	): Promise<RoleAssignment[]> {
		if (this.failing) throw new Error("db down");
		return super.listAssignmentsByEmail(email);
	}
}

describe("RoleResolver store-failure resilience", () => {
	let warnSpy: jest.SpyInstance;
	let errorSpy: jest.SpyInstance;

	beforeEach(() => {
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

	async function flakyFixture() {
		const store = new FlakyStore();
		await store.createRole(
			role("wp-manager", {
				actions: ["read", "write"],
				category: "logbook",
				scope: ["workplace"],
			}),
		);
		await store.createAssignment(
			assign("mgr@x.com", "wp-manager", { workplace: "walkerhill" }),
		);
		return { store, resolver: new RoleResolver(store, { cacheTtlMs: 0 }) };
	}

	it("serves the expired cached Effective when the store fails (stale-while-error)", async () => {
		const { store, resolver } = await flakyFixture();
		// Populate the cache while the store is healthy (ttl 0 → instantly stale).
		expect(
			await resolver.can("mgr@x.com", "document", "write", {
				category: "logbook",
				workplace: "walkerhill",
			}),
		).toBe(true);
		store.failing = true;
		// Store is down: stale cache keeps serving, scope still enforced.
		expect(
			await resolver.can("mgr@x.com", "document", "write", {
				category: "logbook",
				workplace: "walkerhill",
			}),
		).toBe(true);
		expect(
			await resolver.can("mgr@x.com", "document", "write", {
				category: "logbook",
				workplace: "seoul",
			}),
		).toBe(false);
		expect(warnSpy).toHaveBeenCalled();
	});

	it("fails closed (denies, no throw) when the store fails and nothing is cached", async () => {
		const { store, resolver } = await flakyFixture();
		store.failing = true;
		await expect(
			resolver.can("mgr@x.com", "document", "write", {
				category: "logbook",
				workplace: "walkerhill",
			}),
		).resolves.toBe(false);
		expect(errorSpy).toHaveBeenCalled();
	});

	it("does not cache the fail-closed denial (recovers on the next successful load)", async () => {
		const { store, resolver } = await flakyFixture();
		store.failing = true;
		expect(
			await resolver.can("mgr@x.com", "document", "write", {
				category: "logbook",
				workplace: "walkerhill",
			}),
		).toBe(false);
		store.failing = false;
		expect(
			await resolver.can("mgr@x.com", "document", "write", {
				category: "logbook",
				workplace: "walkerhill",
			}),
		).toBe(true);
	});

	it("keeps read open even while the store is down", async () => {
		const { store, resolver } = await flakyFixture();
		store.failing = true;
		expect(
			await resolver.can("ghost@x.com", "document", "read", {
				category: "logbook",
			}),
		).toBe(true);
	});
});
