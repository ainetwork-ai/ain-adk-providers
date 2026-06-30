export type Action = "read" | "write";
export type RoleScope = "all" | "venue";

export interface Role {
	roleId: string;
	name: string;
	description?: string;
	resource: string; // ADK entity, e.g. "document"; "*" = any resource
	actions: Action[];
	category?: string; // optional document category constraint (e.g. "logbook"); omit = any category
	scope: RoleScope; // all = any venue; venue = the venue from the assignment
	createdAt: string;
	updatedAt: string;
}

export interface RoleAssignment {
	assignmentId: string;
	email: string; // the user's email / UPN (authz principal)
	roleId: string;
	venue?: string; // required for scope:"venue" roles
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
