import type { Role } from "./types";

/** Categories governed by a write role for `resource` are "managed" (their
 * creation is gated). Roles with resource "*" count for every resource. `extra`
 * is an optional static set unioned in for categories with no role yet. */
export function managedCategoriesFromRoles(
	roles: Role[],
	resource: string,
	extra?: Iterable<string>,
): Set<string> {
	const set = new Set<string>(extra ?? []);
	for (const r of roles) {
		if ((r.resource === resource || r.resource === "*") && r.category && r.actions.includes("write")) {
			set.add(r.category);
		}
	}
	return set;
}

/**
 * Synchronous "is this category managed?" lookup backed by a TTL-refreshed roles
 * snapshot. The authz middleware calls the create predicate synchronously, so
 * this returns immediately from cache and refreshes in the background.
 *
 * Adding a write role for a new category makes it managed within one TTL — no
 * restart. Fails closed until the first load completes so a governed category
 * can't slip through a cold-start window.
 */
export class ManagedCategoryCache {
	private roles: Role[] = [];
	private at = 0;
	private primed = false;

	constructor(
		private readonly listRoles: () => Promise<Role[]>,
		private readonly ttlMs = 30_000,
		private readonly extra: Iterable<string> = [],
	) {}

	/** Kick off the initial load (call once after construction). */
	prime(): void {
		this.refresh();
	}

	isManaged(resource: string, category: string): boolean {
		if (Date.now() - this.at > this.ttlMs) this.refresh(); // non-blocking
		if (!this.primed) return true; // fail closed until first load
		return managedCategoriesFromRoles(this.roles, resource, this.extra).has(category);
	}

	private refresh(): void {
		this.listRoles()
			.then((roles) => {
				this.roles = roles;
				this.at = Date.now();
				this.primed = true;
			})
			.catch(() => {
				// keep the previous snapshot; a transient DB error shouldn't flap policy
			});
	}
}
