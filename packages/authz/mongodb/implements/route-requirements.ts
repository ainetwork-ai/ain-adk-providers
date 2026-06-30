import type { IDocumentMemory } from "@ainetwork/adk/modules";
import type { RouteRequirement } from "@ainetwork/adk/types/authz";

// Minimal request shape we read. Avoids depending on a specific @types/express
// copy (which would conflict with the one the ADK's RouteRequirement uses).
// A wider express Request is assignable to this (function param contravariance).
type DocReq = { baseUrl: string; path: string; body?: unknown };

export interface DocumentRouteOptions {
	/** Categories that are "managed": creating one requires a matching write
	 * role. Other documents are personal and freely creatable by their owner.
	 * Default: [] (nothing gated on create). The consumer supplies its own set. */
	managedCategories?: string[];
	/** Document label key holding the category. Default: "category". */
	categoryLabel?: string;
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
	const managed = new Set(opts.managedCategories ?? []);

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
		if (!category || !managed.has(category)) return "skip" as const;
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
