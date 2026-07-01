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
	];

	if (load) {
		const attrsOfRecord = async (req: DocReq) => {
			// The authz middleware runs at the /api mount, before the inner ":id"
			// route matches, so req.params is empty here. Derive the id from the URL
			// path (last segment of :id / update/:id / delete/:id).
			const id = `${req.baseUrl}${req.path}`.split("/").filter(Boolean).pop();
			if (!id) return null;
			const rec = await load(id);
			if (!rec) return null;
			return toAttrs((rec.labels ?? {}) as Record<string, string>);
		};
		routes.push(
			{ method: "GET", path: `${basePath}/:id`, resource, action: "read", mode: "byId", loadAttrs: attrsOfRecord },
			{ method: "POST", path: `${basePath}/update/:id`, resource, action: "write", mode: "byId", loadAttrs: attrsOfRecord },
			{ method: "POST", path: `${basePath}/delete/:id`, resource, action: "write", mode: "byId", loadAttrs: attrsOfRecord },
		);
	}

	return routes;
}
