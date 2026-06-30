import type { PermissionResolver } from "@ainetwork/adk/types/authz";
import type { DocumentFilter } from "@ainetwork/adk/types/document";
import type { Action, Role, RoleStore } from "./types";

interface Effective {
	at: number;
	roleById: Map<string, Role>;
	assignments: { roleId: string; scope?: Record<string, string> }[];
}

function roleMatches(role: Role, resource: string, action: Action, category?: string): boolean {
	if (role.resource !== resource && role.resource !== "*") return false;
	if (!role.actions.includes(action)) return false;
	// A category-constrained role only applies to documents of that category.
	if (role.category && role.category !== category) return false;
	return true;
}

/**
 * PermissionResolver backed by roles + per-user assignments.
 *
 * Policy: read is open to all authenticated users; writes are gated by role +
 * scope (and optional category). The principal passed in is the caller's email
 * (see the AuthzModule wiring), matched against assignments by email.
 */
export class RoleResolver implements PermissionResolver {
	private cache = new Map<string, Effective>();
	private ttl: number;

	constructor(
		private store: RoleStore,
		opts?: { cacheTtlMs?: number },
	) {
		this.ttl = opts?.cacheTtlMs ?? 30_000;
	}

	private async load(principal: string): Promise<Effective> {
		const cached = this.cache.get(principal);
		if (cached && Date.now() - cached.at < this.ttl) return cached;
		const [roles, assignments] = await Promise.all([
			this.store.listRoles(),
			this.store.listAssignmentsByEmail(principal),
		]);
		const eff: Effective = {
			at: Date.now(),
			roleById: new Map(roles.map((r) => [r.roleId, r])),
			assignments: assignments.map((a) => ({ roleId: a.roleId, scope: a.scope })),
		};
		this.cache.set(principal, eff);
		return eff;
	}

	async can(
		principal: string,
		resource: string,
		action: string,
		attrs?: Record<string, string>,
	): Promise<boolean> {
		// Read is open to all authenticated users by default; only writes are
		// gated by role + scope.
		if (action === "read") return true;
		const eff = await this.load(principal);
		for (const a of eff.assignments) {
			const role = eff.roleById.get(a.roleId);
			if (!role || !roleMatches(role, resource, action as Action, attrs?.category)) continue;
			// Global role (no scope dimensions) → allowed.
			if (!role.scope || role.scope.length === 0) return true;
			// Scoped: every dimension the assignment specifies must equal the
			// document's label of the same key; dimensions the assignment omits
			// are wildcards (e.g. a whole workplace across all sections). At least
			// one declared dimension must be specified, else the grant is empty.
			let specified = 0;
			let ok = true;
			for (const key of role.scope) {
				const want = a.scope?.[key];
				if (want === undefined) continue; // wildcard for this dimension
				specified++;
				if (attrs?.[key] !== want) {
					ok = false;
					break;
				}
			}
			if (ok && specified > 0) return true;
		}
		return false;
	}

	async listFilter(_principal: string, _resource: string): Promise<DocumentFilter[] | null> {
		// Read is open by default: no row-level restriction on listing.
		// (Write remains gated in can().)
		return null;
	}
}
