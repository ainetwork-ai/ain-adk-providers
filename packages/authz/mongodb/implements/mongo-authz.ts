import type { IDocumentMemory } from "@ainetwork/adk/modules";
import type { AuthzConfig, PermissionResolver, RouteRequirement } from "@ainetwork/adk/types/authz";
import mongoose from "mongoose";
import { MongoRoleStore } from "./mongo-role-store";
import { RoleResolver } from "./role-resolver";
import { buildDocumentRouteRequirements, type DocumentRouteOptions } from "./route-requirements";

export interface MongoAuthzOptions extends DocumentRouteOptions {
	/** Mongo connection string for the role/assignment store (roles,
	 * role_assignments collections). Usually the agent's own memory DB. */
	connectionString: string;
	/** The agent's document memory — needed to load a document's labels for
	 * per-record (byId) authorization. */
	documentMemory: IDocumentMemory;
	/** Resolver cache TTL in ms (default 30s). */
	cacheTtlMs?: number;
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
 */
export class MongoAuthz implements AuthzConfig {
	readonly resolver: PermissionResolver;
	readonly routes: RouteRequirement[];

	constructor(opts: MongoAuthzOptions) {
		const conn = mongoose.createConnection(opts.connectionString);
		const store = new MongoRoleStore(conn);
		this.resolver = new RoleResolver(store, { cacheTtlMs: opts.cacheTtlMs });
		this.routes = buildDocumentRouteRequirements(opts.documentMemory, opts);
	}
}
