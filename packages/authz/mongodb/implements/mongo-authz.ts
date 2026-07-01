import type { IDocumentMemory } from "@ainetwork/adk/modules";
import type { AuthzConfig, PermissionResolver, RouteRequirement } from "@ainetwork/adk/types/authz";
import mongoose from "mongoose";
import { MongoRoleStore } from "./mongo-role-store";
import { RoleResolver } from "./role-resolver";
import { buildDocumentRouteRequirements, type DocumentRouteOptions } from "./route-requirements";
import type { Role, RoleStore } from "./types";

/** Categories governed by a write role are "managed" (their creation is gated).
 * `extra` is an optional static set unioned in for categories with no role yet. */
export function managedCategoriesFromRoles(roles: Role[], extra?: Iterable<string>): Set<string> {
	const set = new Set<string>(extra ?? []);
	for (const r of roles) {
		if (r.category && r.actions.includes("write")) set.add(r.category);
	}
	return set;
}

export interface MongoAuthzOptions extends DocumentRouteOptions {
	/** Mongo connection string for the role/assignment store (roles,
	 * role_assignments collections). Usually the agent's own memory DB. */
	connectionString: string;
	/** The agent's document memory. Only needed to authorize update/delete of an
	 * existing document (loads the target's labels to check its category/scope).
	 * Omit if you only gate creation — create reads labels from the request body
	 * and reads are open. */
	documentMemory?: IDocumentMemory;
	/** Resolver cache TTL in ms (default 30s). */
	cacheTtlMs?: number;
	/** Managed-category cache TTL in ms (default 30s). The set of managed
	 * categories is derived from the roles in the DB, so adding a role for a new
	 * category makes it managed within this TTL — no restart needed. */
	managedCacheTtlMs?: number;
}

/**
 * One-shot authz module for an ADK agent. Construct it and pass it to AINAgent
 * as `modules.authz` — it satisfies AuthzConfig ({ resolver, routes }):
 *
 *   const authz = new MongoAuthz({ connectionString, documentMemory });
 *   new AINAgent(manifest, { authModule, modelModule, memoryModule, authz });
 *
 * Opens its OWN named mongoose connection (so it never clobbers the memory
 * module's global mongoose models). Roles/assignments are managed out-of-band
 * (e.g. an admin UI writing to Mongo); this only reads them to enforce.
 *
 * The set of "managed" categories (whose creation is gated) is derived from the
 * roles themselves: any category that has a write role is managed. So creating a
 * role for a new category via the admin UI governs it without a restart.
 */
export class MongoAuthz implements AuthzConfig {
	readonly resolver: PermissionResolver;
	readonly routes: RouteRequirement[];

	private store: RoleStore;
	private staticManaged: Set<string>;
	private managedTtl: number;
	private managedSet = new Set<string>();
	private managedAt = 0;
	private managedPrimed = false;

	constructor(opts: MongoAuthzOptions) {
		const conn = mongoose.createConnection(opts.connectionString);
		this.store = new MongoRoleStore(conn);
		this.resolver = new RoleResolver(this.store, { cacheTtlMs: opts.cacheTtlMs });
		this.staticManaged = new Set(opts.managedCategories ?? []);
		this.managedTtl = opts.managedCacheTtlMs ?? 30_000;
		this.routes = buildDocumentRouteRequirements({
			documentMemory: opts.documentMemory,
			categoryLabel: opts.categoryLabel,
			isManaged: (category) => this.isManaged(category),
		});
		// Prime the managed-category cache so the first create is gated correctly.
		this.refreshManaged();
	}

	/** Categories governed by a write role are "managed" (creation is gated). */
	private refreshManaged(): void {
		this.store
			.listRoles()
			.then((roles) => {
				this.managedSet = managedCategoriesFromRoles(roles, this.staticManaged);
				this.managedAt = Date.now();
				this.managedPrimed = true;
			})
			.catch(() => {
				// keep the previous cache; a transient DB error shouldn't flap policy
			});
	}

	private isManaged(category: string): boolean {
		if (Date.now() - this.managedAt > this.managedTtl) this.refreshManaged(); // non-blocking
		// Fail closed until the first load completes: treat unknown as managed so a
		// governed category can't slip through a cold-start window.
		if (!this.managedPrimed) return true;
		return this.managedSet.has(category);
	}
}
