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
		// Case-insensitive, whitespace-tolerant match: the principal (M365 UPN)
		// case can differ from the stored email.
		const norm = email.trim().toLowerCase();
		return [...this.assignments.values()].filter((a) => a.email.trim().toLowerCase() === norm);
	}
	async createAssignment(a: RoleAssignment): Promise<RoleAssignment> {
		this.assignments.set(a.assignmentId, a);
		return a;
	}
}
