import type { RouteRequirement } from "@ainetwork/adk/types/authz";

// Minimal request shape we read. Avoids depending on a specific @types/express
// copy (which would conflict with the one the ADK's RouteRequirement uses).
// A wider express Request is assignable to this (function param contravariance).
type DocReq = { baseUrl: string; path: string; body?: unknown };

export interface ResourceRouteOptions {
	/** ADK resource name, matched against Role.resource (e.g. "document"). */
	resource: string;
	/** Route mount base for this resource, e.g. "/api/document". The byId routes
	 * are derived as `${basePath}/:id`, `${basePath}/update/:id`,
	 * `${basePath}/delete/:id`. */
	basePath: string;
	/** Loads an existing record's labels for byId (update/delete/read) authz.
	 * Omit to gate only create (+ list); update/delete then fall back to the
	 * handler's own owner check. This is the only thing that needs storage
	 * access, so route building itself stays memory-agnostic. */
	load?: (id: string) => Promise<{ labels?: Record<string, string> } | null | undefined>;
	/** Document label key holding the category. Default: "category". */
	categoryLabel?: string;
	/** Predicate deciding whether a document category is "managed": creating one
	 * requires a matching write role. Called synchronously per create request, so
	 * it must read from a cache. Default: nothing is managed. */
	isManaged?: (category: string) => boolean;
	/** Static fallback used only when `isManaged` is not supplied. */
	managedCategories?: string[];
	/** Extra write sub-actions on an existing record, relative to `${basePath}/:id`,
	 * e.g. ["advice/stream", "slots/:slotId/fill/stream"]. Each becomes a byId
	 * write route at `${basePath}/:id/${subpath}` gated by the target's scope
	 * (same as update/delete). Requires `load`. */
	byIdWriteSubpaths?: string[];
}

/**
 * Route requirements for a generic ADK resource CRUD surface under `basePath`.
 *
 * - list / read: open (the resolver opens reads by default).
 * - create (fromBody): gated only for managed categories; other records are
 *   left to the handler's own owner check. Reads labels from the request body.
 * - update/delete (byId): scope/category checked against the target record —
 *   only added when `load` is supplied (needed to load the target's labels).
 */
export function buildResourceRouteRequirements(opts: ResourceRouteOptions): RouteRequirement[] {
	const { resource, basePath, load } = opts;
	const categoryLabel = opts.categoryLabel ?? "category";
	const staticManaged = new Set(opts.managedCategories ?? []);
	const isManaged = opts.isManaged ?? ((category: string) => staticManaged.has(category));

	// Surface the record's labels as authz attrs. The resolver matches
	// role.category against attrs.category and each role.scope dimension key
	// against attrs[key], so scope dimensions are just the record's own label
	// keys (e.g. "workplace") — no per-agent scope config needed.
	const toAttrs = (labels: Record<string, string>) => {
		const attrs: Record<string, string> = { ...labels };
		const category = labels[categoryLabel];
		if (category) attrs.category = category;
		return attrs;
	};

	const attrsFromBody = (req: DocReq) => {
		const labels = (req.body as { labels?: Record<string, string> })?.labels ?? {};
		const category = labels[categoryLabel];
		// Non-managed (personal) records: not gated — owner creates their own.
		if (!category || !isManaged(category)) return "skip" as const;
		return toAttrs(labels);
	};

	const routes: RouteRequirement[] = [
		{ method: "GET", path: basePath, resource, action: "read", mode: "list" },
		{ method: "POST", path: basePath, resource, action: "write", mode: "fromBody", bodyAttrs: attrsFromBody },
		// Reading a single record is open (the resolver opens reads), so we grant
		// cross-user access without loading the record — no storage hit needed.
		{ method: "GET", path: `${basePath}/:id`, resource, action: "read", mode: "byId", loadAttrs: async () => ({}) },
	];

	// update/delete (and any extra byId write sub-actions) gate on the target's
	// category/scope, which requires loading the stored record. Without a loader
	// they fall back to the owner check.
	if (load) {
		// The authz middleware runs at the /api mount, before the inner route
		// matches, so req.params is empty. Derive the id from the URL by the
		// position of ":id" in each route's own template — the id is not always
		// the last segment (e.g. `/:id/slots/:slotId/fill/stream`).
		const loadAttrsFor = (pathTemplate: string) => {
			const idIndex = pathTemplate.split("/").filter(Boolean).indexOf(":id");
			return async (req: DocReq) => {
				const parts = `${req.baseUrl}${req.path}`.split("/").filter(Boolean);
				const id = idIndex >= 0 ? parts[idIndex] : undefined;
				if (!id) return null;
				const rec = await load(id);
				if (!rec) return null;
				return toAttrs((rec.labels ?? {}) as Record<string, string>);
			};
		};

		const writePaths = [
			`${basePath}/update/:id`,
			`${basePath}/delete/:id`,
			...(opts.byIdWriteSubpaths ?? []).map((sub) => `${basePath}/:id/${sub}`),
		];
		for (const path of writePaths) {
			routes.push({ method: "POST", path, resource, action: "write", mode: "byId", loadAttrs: loadAttrsFor(path) });
		}
	}

	return routes;
}
