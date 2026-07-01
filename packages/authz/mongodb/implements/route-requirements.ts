import type { IDocumentMemory } from "@ainetwork/adk/modules";
import type { RouteRequirement } from "@ainetwork/adk/types/authz";

// Minimal request shape we read. Avoids depending on a specific @types/express
// copy (which would conflict with the one the ADK's RouteRequirement uses).
// A wider express Request is assignable to this (function param contravariance).
type DocReq = { baseUrl: string; path: string; body?: unknown };

export interface DocumentRouteOptions {
	/** Document label key holding the category. Default: "category". */
	categoryLabel?: string;
	/** Predicate deciding whether a document category is "managed": creating one
	 * requires a matching write role. Other (personal) documents are freely
	 * creatable by their owner. Called synchronously per create request, so it
	 * must read from a cache. MongoAuthz supplies one derived from the roles in
	 * the DB (a category with a write role is managed), so new categories need no
	 * restart. Default: nothing is managed. */
	isManaged?: (category: string) => boolean;
	/** Static fallback used only when `isManaged` is not supplied. */
	managedCategories?: string[];
}

/**
 * Route requirements for the generic ADK `/api/document/*` routes.
 *
 * - list/byId reads: governed (the resolver opens reads by default).
 * - byId writes (update/delete): scope/category checked against the target doc.
 * - create (fromBody): gated only for managed categories; other documents are
 *   left to the handler's own owner check.
 */
export function buildDocumentRouteRequirements(
	documentMemory: IDocumentMemory,
	opts: DocumentRouteOptions = {},
): RouteRequirement[] {
	const categoryLabel = opts.categoryLabel ?? "category";
	const staticManaged = new Set(opts.managedCategories ?? []);
	const isManaged = opts.isManaged ?? ((category: string) => staticManaged.has(category));

	// Surface the document's labels as authz attrs. The resolver matches
	// role.category against attrs.category and each role.scope dimension key
	// against attrs[key], so the scope dimensions are just the document's own
	// label keys (e.g. "workplace") — no per-agent scope config needed.
	const toAttrs = (labels: Record<string, string>) => {
		const attrs: Record<string, string> = { ...labels };
		const category = labels[categoryLabel];
		if (category) attrs.category = category;
		return attrs;
	};

	const attrsOfDoc = async (req: DocReq) => {
		// The authz middleware runs at the /api mount, before the inner ":id"
		// route matches, so req.params is empty here. Derive the id from the URL
		// path (last segment of /api/document/:id, /update/:id, /delete/:id).
		const id = `${req.baseUrl}${req.path}`.split("/").filter(Boolean).pop();
		if (!id) return null;
		const doc = await documentMemory.getDocument(id);
		if (!doc) return null;
		return toAttrs((doc.labels ?? {}) as Record<string, string>);
	};

	const attrsFromBody = (req: DocReq) => {
		const labels = (req.body as { labels?: Record<string, string> })?.labels ?? {};
		const category = labels[categoryLabel];
		// Non-managed (personal) documents: not gated — owner creates their own.
		if (!category || !isManaged(category)) return "skip" as const;
		return toAttrs(labels);
	};

	return [
		{ method: "GET", path: "/api/document", resource: "document", action: "read", mode: "list" },
		{ method: "GET", path: "/api/document/:id", resource: "document", action: "read", mode: "byId", loadAttrs: attrsOfDoc },
		{ method: "POST", path: "/api/document", resource: "document", action: "write", mode: "fromBody", bodyAttrs: attrsFromBody },
		{ method: "POST", path: "/api/document/update/:id", resource: "document", action: "write", mode: "byId", loadAttrs: attrsOfDoc },
		{ method: "POST", path: "/api/document/delete/:id", resource: "document", action: "write", mode: "byId", loadAttrs: attrsOfDoc },
	];
}
