export type Action = "read" | "write";

export interface Role {
	roleId: string;
	name: string;
	description?: string;
	resource: string; // ADK entity, e.g. "document"; "*" = any resource
	actions: Action[];
	category?: string; // optional category constraint; omit = applies to any category
	/** Scope dimension keys this role is restricted by, e.g. ["workplace"] or
	 * ["workplace", "section"]. Each key names a document label (and an
	 * assignment scope key) to match on. Empty array = global (no restriction). */
	scope: string[];
	createdAt: string;
	updatedAt: string;
}

export interface RoleAssignment {
	assignmentId: string;
	email: string; // the user's email / UPN (authz principal)
	roleId: string;
	/** Values for the role's scope dimensions, e.g. { workplace: "피자힐" }. A
	 * dimension the role declares but the assignment omits acts as a wildcard
	 * (e.g. grant a whole workplace across all sections). */
	scope?: Record<string, string>;
	createdAt: string;
	createdBy: string;
}

// Store surface the agent needs at runtime: reads for enforcement (RoleResolver).
// Roles/assignments are created/edited out-of-band (e.g. an admin UI directly
// against Mongo); the create* methods are used by the in-memory store in tests.
export interface RoleStore {
	listRoles(): Promise<Role[]>;
	createRole(role: Role): Promise<Role>;
	listAssignmentsByEmail(email: string): Promise<RoleAssignment[]>;
	createAssignment(a: RoleAssignment): Promise<RoleAssignment>;
}
