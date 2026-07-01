import { managedCategoriesFromRoles } from "../implements/mongo-authz";
import { buildResourceRouteRequirements } from "../implements/route-requirements";
import type { Action, Role } from "../implements/types";

const DOC = { resource: "document", basePath: "/api/document" } as const;

function role(name: string, category: string | undefined, actions: Action[]): Role {
	return {
		roleId: name,
		name,
		resource: "document",
		actions,
		category,
		scope: [],
		createdAt: "t",
		updatedAt: "t",
	};
}

describe("managedCategoriesFromRoles", () => {
	it("derives categories that have a write role", () => {
		const set = managedCategoriesFromRoles([
			role("logbook-mgr", "logbook", ["read", "write"]),
			role("report-viewer", "report", ["read"]), // read-only → not managed
			role("global-writer", undefined, ["write"]), // no category → not managed
		]);
		expect(set.has("logbook")).toBe(true);
		expect(set.has("report")).toBe(false);
		expect(set.size).toBe(1);
	});

	it("picks up a new category as soon as it has a write role (no restart)", () => {
		const before = managedCategoriesFromRoles([role("logbook-mgr", "logbook", ["write"])]);
		expect(before.has("schedule")).toBe(false);
		const after = managedCategoriesFromRoles([
			role("logbook-mgr", "logbook", ["write"]),
			role("schedule-mgr", "schedule", ["write"]),
		]);
		expect(after.has("schedule")).toBe(true);
	});

	it("unions extra static categories", () => {
		const set = managedCategoriesFromRoles([], ["announcement"]);
		expect(set.has("announcement")).toBe(true);
	});
});

describe("buildDocumentRouteRequirements create-gating", () => {
	const bodyAttrsOf = (isManaged: (c: string) => boolean) => {
		const routes = buildResourceRouteRequirements({ ...DOC, isManaged });
		const post = routes.find((r) => r.method === "POST" && r.path === "/api/document");
		return post?.bodyAttrs as (r: unknown) => unknown;
	};
	const req = (labels: Record<string, string>) => ({ baseUrl: "/api", path: "/document", body: { labels } });

	it("gates create only for managed categories", () => {
		const bodyAttrs = bodyAttrsOf((c) => c === "logbook");
		expect(bodyAttrs(req({ category: "logbook", workplace: "피자힐" }))).toEqual({
			category: "logbook",
			workplace: "피자힐",
		});
		expect(bodyAttrs(req({ category: "note" }))).toBe("skip"); // personal → not gated
		expect(bodyAttrs(req({}))).toBe("skip"); // no category → not gated
	});
});

describe("byId routes are gated on a loader (load)", () => {
	const paths = (routes: ReturnType<typeof buildResourceRouteRequirements>) =>
		routes.map((r) => `${r.method} ${r.path}`);

	it("omits update/delete/read-byId routes when no loader is supplied", () => {
		const p = paths(buildResourceRouteRequirements({ ...DOC }));
		expect(p).toEqual(["GET /api/document", "POST /api/document"]); // list + create only
	});

	it("adds byId routes when a loader is supplied", () => {
		const p = paths(buildResourceRouteRequirements({ ...DOC, load: async () => null }));
		expect(p).toContain("POST /api/document/update/:id");
		expect(p).toContain("POST /api/document/delete/:id");
		expect(p).toContain("GET /api/document/:id");
	});

	it("derives byId paths from a custom basePath (e.g. workflow)", () => {
		const p = paths(
			buildResourceRouteRequirements({ resource: "workflow", basePath: "/api/workflows", load: async () => null }),
		);
		expect(p).toContain("GET /api/workflows");
		expect(p).toContain("POST /api/workflows/update/:id");
		expect(p).toContain("POST /api/workflows/delete/:id");
	});
});
