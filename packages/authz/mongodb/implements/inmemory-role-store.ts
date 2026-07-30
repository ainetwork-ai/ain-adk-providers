import type { Role, RoleAssignment, RoleStore } from "./types";

export class InMemoryRoleStore implements RoleStore {
	private roles = new Map<string, Role>();
	private assignments = new Map<string, RoleAssignment>();

	async listRoles(): Promise<Role[]> {
		return [...this.roles.values()];
	}
	async createRole(role: Role): Promise<Role> {
		this.roles.set(role.roleId, role);
		return role;
	}
	async listAssignmentsByEmail(email: string): Promise<RoleAssignment[]> {
		// Mirrors MongoRoleStore: case-insensitive match, trimming ONLY the
		// principal (M365 UPN case can differ from the stored email). The stored
		// value is matched raw — the mongo store's anchored /i regex does not
		// tolerate stored-side whitespace, so neither does this store.
		const norm = email.trim().toLowerCase();
		return [...this.assignments.values()].filter(
			(a) => a.email.toLowerCase() === norm,
		);
	}
	async createAssignment(a: RoleAssignment): Promise<RoleAssignment> {
		this.assignments.set(a.assignmentId, a);
		return a;
	}
}
