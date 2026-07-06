import type { MemoryModule } from "@ainetwork/adk/modules";
import type { AuthzConfig, PermissionResolver, RouteRequirement } from "@ainetwork/adk/types/authz";
import mongoose from "mongoose";
import { ManagedCategoryCache } from "./managed-cache";
import { MongoRoleStore } from "./mongo-role-store";
import { RoleResolver } from "./role-resolver";
import { buildResourceRouteRequirements, type ResourceRouteOptions } from "./route-requirements";
import type { RoleStore } from "./types";

/** A resource to protect: a built-in ADK resource name (routes + byId loader
 * derived from the MemoryModule) or a full custom spec. */
export type ResourceSpec = "document" | ResourceRouteOptions;

export interface MongoAuthzOptions {
	/** Mongo connection string for the role/assignment store (roles,
	 * role_assignments collections). Usually the agent's own memory DB. */
	connectionString: string;
	/** The agent's MemoryModule, passed once. byId loaders for built-in resources
	 * are derived from it (e.g. `getDocumentMemory().getDocument`). Omit to gate
	 * only create/list for built-ins (update/delete fall back to the owner check). */
	memoryModule?: MemoryModule;
	/** Resources to protect. Strings use built-in ADK defaults; objects configure
	 * a custom resource. Default: ["document"]. */
	resources?: ResourceSpec[];
	/** Label key holding a record's category. Default: "category". */
	categoryLabel?: string;
	/** Static managed-category set, unioned with the set derived from roles. */
	managedCategories?: string[];
	/** Resolver cache TTL in ms (default 30s). */
	cacheTtlMs?: number;
	/** Managed-category cache TTL in ms (default 30s). Adding a write role for a
	 * new category makes it managed within this TTL — no restart needed. */
	managedCacheTtlMs?: number;
}

/**
 * One-shot authz module for an ADK agent. Construct it and pass it to AINAgent
 * as `modules.authz` — it satisfies AuthzConfig ({ resolver, routes }):
 *
 *   const authz = new MongoAuthz({ connectionString, memoryModule });
 *   new AINAgent(manifest, { authModule, modelModule, memoryModule, authz });
 *
 * Opens its OWN named mongoose connection (so it never clobbers the memory
 * module's global mongoose models). Roles/assignments are managed out-of-band
 * (e.g. an admin UI writing to Mongo); this only reads them to enforce.
 *
 * Everything is data-driven: scope dimensions come from role.scope, and the set
 * of "managed" categories (whose creation is gated) is derived from the roles
 * (a category with a write role is managed), so new categories/roles need no
 * restart.
 */
export class MongoAuthz implements AuthzConfig {
	readonly resolver: PermissionResolver;
	readonly routes: RouteRequirement[];

	private store: RoleStore;
	private managed: ManagedCategoryCache;

	constructor(opts: MongoAuthzOptions) {
		const conn = mongoose.createConnection(opts.connectionString);
		this.store = new MongoRoleStore(conn);
		this.resolver = new RoleResolver(this.store, { cacheTtlMs: opts.cacheTtlMs });
		this.managed = new ManagedCategoryCache(
			() => this.store.listRoles(),
			opts.managedCacheTtlMs ?? 30_000,
			opts.managedCategories ?? [],
		);

		const specs = opts.resources ?? ["document"];
		this.routes = specs.flatMap((spec) => buildResourceRouteRequirements(this.resolveSpec(spec, opts)));

		// Prime the managed-category cache so the first create is gated correctly.
		this.managed.prime();
	}

	/** Resolve a resource spec to full route options: inject the shared managed
	 * predicate (bound to this resource) + categoryLabel, and derive built-in
	 * loaders from the MemoryModule. A custom spec's own fields win. */
	private resolveSpec(spec: ResourceSpec, opts: MongoAuthzOptions): ResourceRouteOptions {
		let resolved: ResourceRouteOptions;
		if (spec === "document") {
			const mem = opts.memoryModule?.getDocumentMemory();
			resolved = {
				resource: "document",
				basePath: "/api/document",
				load: mem ? (id) => mem.getDocument(id).then((d) => d ?? null) : undefined,
				// Sub-actions on an existing document (generate advice, fill a data
				// slot) are gated like a write on that document — only holders of a
				// write role for its scope (or the owner) may invoke them.
				byIdWriteSubpaths: ["slots/:slotId/fill", "slots/:slotId/fill/stream", "advice/stream"],
			};
		} else {
			resolved = spec;
		}
		return {
			categoryLabel: opts.categoryLabel,
			isManaged: (c: string) => this.managed.isManaged(resolved.resource, c),
			...resolved,
		};
	}
}
