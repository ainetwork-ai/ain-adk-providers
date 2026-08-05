import { loggers } from "@ainetwork/adk/utils/logger";
import {
	ManagedCategoryCache,
	managedCategoriesFromRoles,
} from "../implements/managed-cache";
import { buildResourceRouteRequirements } from "../implements/route-requirements";
import type { Action, Role } from "../implements/types";

const DOC = { resource: "document", basePath: "/api/document" } as const;
const flush = () => new Promise((r) => setImmediate(r));

function role(
	name: string,
	category: string | undefined,
	actions: Action[],
	resource = "document",
): Role {
	return {
		roleId: name,
		name,
		resource,
		actions,
		category,
		scope: [],
		createdAt: "t",
		updatedAt: "t",
	};
}

describe("managedCategoriesFromRoles", () => {
	it("derives categories that have a write role for the resource", () => {
		const set = managedCategoriesFromRoles(
			[
				role("logbook-mgr", "logbook", ["read", "write"]),
				role("report-viewer", "report", ["read"]), // read-only → not managed
				role("global-writer", undefined, ["write"]), // no category → not managed
			],
			"document",
		);
		expect(set.has("logbook")).toBe(true);
		expect(set.has("report")).toBe(false);
		expect(set.size).toBe(1);
	});

	it("filters by resource (a workflow role does not manage a document category)", () => {
		const roles = [role("sched", "schedule", ["write"], "workflow")];
		expect(managedCategoriesFromRoles(roles, "workflow").has("schedule")).toBe(
			true,
		);
		expect(managedCategoriesFromRoles(roles, "document").has("schedule")).toBe(
			false,
		);
	});

	it("counts resource '*' roles for every resource", () => {
		const roles = [role("super", "logbook", ["write"], "*")];
		expect(managedCategoriesFromRoles(roles, "document").has("logbook")).toBe(
			true,
		);
		expect(managedCategoriesFromRoles(roles, "workflow").has("logbook")).toBe(
			true,
		);
	});

	it("unions extra static categories", () => {
		const set = managedCategoriesFromRoles([], "document", ["announcement"]);
		expect(set.has("announcement")).toBe(true);
	});
});

describe("ManagedCategoryCache", () => {
	it("fails closed (treats as managed) before the first load completes", () => {
		const cache = new ManagedCategoryCache(() => new Promise(() => {})); // never resolves
		expect(cache.isManaged("document", "anything")).toBe(true);
	});

	it("reflects derived categories after the load resolves", async () => {
		const cache = new ManagedCategoryCache(async () => [
			role("m", "logbook", ["write"]),
		]);
		cache.prime();
		await flush();
		expect(cache.isManaged("document", "logbook")).toBe(true);
		expect(cache.isManaged("document", "note")).toBe(false);
	});

	it("scopes the managed set per resource", async () => {
		const cache = new ManagedCategoryCache(async () => [
			role("w", "schedule", ["write"], "workflow"),
		]);
		cache.prime();
		await flush();
		expect(cache.isManaged("workflow", "schedule")).toBe(true);
		expect(cache.isManaged("document", "schedule")).toBe(false);
	});
});

describe("ManagedCategoryCache refresh-failure logging", () => {
	let errorSpy: jest.SpyInstance;
	let infoSpy: jest.SpyInstance;

	beforeEach(() => {
		errorSpy = jest
			.spyOn(loggers.agent, "error")
			.mockImplementation((() => loggers.agent) as never);
		infoSpy = jest
			.spyOn(loggers.agent, "info")
			.mockImplementation((() => loggers.agent) as never);
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("logs the first refresh failure with the error message", async () => {
		const cache = new ManagedCategoryCache(async () => {
			throw new Error("mongo unreachable");
		});
		cache.prime();
		await flush();
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(String(errorSpy.mock.calls[0][0])).toContain("mongo unreachable");
	});

	it("dedupes repeated failures and logs recovery once (state transitions)", async () => {
		let fail = true;
		const cache = new ManagedCategoryCache(async () => {
			if (fail) throw new Error("mongo unreachable");
			return [role("m", "logbook", ["write"])];
		}, -1); // ttl -1 → every isManaged() triggers a refresh
		cache.prime();
		await flush(); // failure #1 → logged
		cache.isManaged("document", "x");
		await flush(); // failure #2 → deduped
		cache.isManaged("document", "x");
		await flush(); // failure #3 → deduped
		expect(errorSpy).toHaveBeenCalledTimes(1);

		fail = false;
		cache.isManaged("document", "x");
		await flush(); // recovery → logged once
		expect(infoSpy).toHaveBeenCalledTimes(1);
		cache.isManaged("document", "x");
		await flush(); // still healthy → no more recovery logs
		expect(infoSpy).toHaveBeenCalledTimes(1);

		fail = true;
		cache.isManaged("document", "x");
		await flush(); // new outage → logged again
		expect(errorSpy).toHaveBeenCalledTimes(2);
	});

	it("keeps the previous snapshot when a refresh fails", async () => {
		let fail = false;
		const cache = new ManagedCategoryCache(async () => {
			if (fail) throw new Error("boom");
			return [role("m", "logbook", ["write"])];
		}, -1);
		cache.prime();
		await flush();
		fail = true;
		cache.isManaged("document", "logbook");
		await flush();
		expect(cache.isManaged("document", "logbook")).toBe(true);
		expect(cache.isManaged("document", "note")).toBe(false);
	});
});

describe("buildResourceRouteRequirements create-gating", () => {
	const bodyAttrsOf = (isManaged: (c: string) => boolean) => {
		const routes = buildResourceRouteRequirements({ ...DOC, isManaged });
		const post = routes.find(
			(r) => r.method === "POST" && r.path === "/api/document",
		);
		return post?.bodyAttrs as (r: unknown) => unknown;
	};
	const req = (labels: Record<string, string>) => ({
		baseUrl: "/api",
		path: "/document",
		body: { labels },
	});

	it("gates create only for managed categories", () => {
		const bodyAttrs = bodyAttrsOf((c) => c === "logbook");
		expect(
			bodyAttrs(req({ category: "logbook", workplace: "피자힐" })),
		).toEqual({
			category: "logbook",
			workplace: "피자힐",
		});
		expect(bodyAttrs(req({ category: "note" }))).toBe("skip"); // personal → not gated
		expect(bodyAttrs(req({}))).toBe("skip"); // no category → not gated
	});
});

describe("byId routes", () => {
	const paths = (routes: ReturnType<typeof buildResourceRouteRequirements>) =>
		routes.map((r) => `${r.method} ${r.path}`);

	it("registers list + create + open read-byId even without a loader", () => {
		const p = paths(buildResourceRouteRequirements({ ...DOC }));
		expect(p).toEqual([
			"GET /api/document",
			"POST /api/document",
			"GET /api/document/:id",
		]);
	});

	it("read-byId does not load the record (read is open)", async () => {
		const routes = buildResourceRouteRequirements({ ...DOC });
		const read = routes.find(
			(r) => r.method === "GET" && r.path === "/api/document/:id",
		);
		const loadAttrs = read?.loadAttrs as (r: unknown) => Promise<unknown>;
		expect(await loadAttrs({ baseUrl: "/api", path: "/document/abc" })).toEqual(
			{},
		);
	});

	it("adds update/delete byId routes only when a loader is supplied", () => {
		const p = paths(
			buildResourceRouteRequirements({ ...DOC, load: async () => null }),
		);
		expect(p).toContain("POST /api/document/update/:id");
		expect(p).toContain("POST /api/document/delete/:id");
		expect(p).toContain("POST /api/document/hide/:id");
	});

	it("derives byId paths from a custom basePath (e.g. workflow)", () => {
		const p = paths(
			buildResourceRouteRequirements({
				resource: "workflow",
				basePath: "/api/workflows",
				load: async () => null,
			}),
		);
		expect(p).toContain("POST /api/workflows/update/:id");
		expect(p).toContain("POST /api/workflows/delete/:id");
	});

	it("registers byIdWriteSubpaths as byId write routes under :id", () => {
		const p = paths(
			buildResourceRouteRequirements({
				...DOC,
				load: async () => null,
				byIdWriteSubpaths: ["advice/stream", "slots/:slotId/fill/stream"],
			}),
		);
		expect(p).toContain("POST /api/document/:id/advice/stream");
		expect(p).toContain("POST /api/document/:id/slots/:slotId/fill/stream");
	});

	it("extracts the record id by :id position, not the last segment (deep subpath)", async () => {
		const seen: string[] = [];
		const routes = buildResourceRouteRequirements({
			...DOC,
			load: async (id) => {
				seen.push(id);
				return { labels: { workplace: id } };
			},
			byIdWriteSubpaths: ["slots/:slotId/fill/stream"],
		});
		const fill = routes.find(
			(r) => r.path === "/api/document/:id/slots/:slotId/fill/stream",
		);
		const fillLoadAttrs = fill?.loadAttrs as (r: unknown) => Promise<unknown>;
		const attrs = await fillLoadAttrs({
			baseUrl: "/api",
			path: "/document/DOC1/slots/S1/fill/stream",
		});
		expect(seen).toContain("DOC1"); // not "stream"
		expect(attrs).toEqual({ workplace: "DOC1" });
	});

	it("still extracts id for update/delete (verb-before-id shape)", async () => {
		const routes = buildResourceRouteRequirements({
			...DOC,
			load: async (id) => ({ labels: { workplace: id } }),
		});
		const upd = routes.find((r) => r.path === "/api/document/update/:id");
		const updLoadAttrs = upd?.loadAttrs as (r: unknown) => Promise<unknown>;
		const attrs = await updLoadAttrs({
			baseUrl: "/api",
			path: "/document/update/DOC9",
		});
		expect(attrs).toEqual({ workplace: "DOC9" });
	});
});
