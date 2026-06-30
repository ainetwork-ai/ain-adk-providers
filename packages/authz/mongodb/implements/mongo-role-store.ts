import { Schema, type Connection, type Model } from "mongoose";
import type { Role, RoleAssignment, RoleStore } from "./types";

const RoleSchema = new Schema<Role>(
	{
		roleId: { type: String, required: true, unique: true },
		name: { type: String, required: true, unique: true },
		description: { type: String },
		resource: { type: String, required: true },
		actions: { type: [String], required: true },
		category: { type: String },
		scope: { type: String, enum: ["all", "fnb"], required: true },
		createdAt: { type: String, required: true },
		updatedAt: { type: String, required: true },
	},
	{ timestamps: false },
);

const AssignmentSchema = new Schema<RoleAssignment>(
	{
		assignmentId: { type: String, required: true, unique: true },
		email: { type: String, required: true, index: true },
		roleId: { type: String, required: true },
		fnb: { type: String },
		createdAt: { type: String, required: true },
		createdBy: { type: String, required: true },
	},
	{ timestamps: false },
);

export class MongoRoleStore implements RoleStore {
	private Role: Model<Role>;
	private Assignment: Model<RoleAssignment>;

	constructor(conn: Connection) {
		// Register models on the provided connection (avoids clobbering the
		// memory module's global mongoose models).
		this.Role = conn.models.Role ?? conn.model<Role>("Role", RoleSchema, "roles");
		this.Assignment =
			conn.models.RoleAssignment ??
			conn.model<RoleAssignment>("RoleAssignment", AssignmentSchema, "role_assignments");
	}

	async listRoles(): Promise<Role[]> {
		return this.Role.find().lean<Role[]>();
	}
	async createRole(role: Role): Promise<Role> {
		await this.Role.create(role);
		return role;
	}
	async listAssignmentsByEmail(email: string): Promise<RoleAssignment[]> {
		return this.Assignment.find({ email }).lean<RoleAssignment[]>();
	}
	async createAssignment(a: RoleAssignment): Promise<RoleAssignment> {
		await this.Assignment.create(a);
		return a;
	}
}
