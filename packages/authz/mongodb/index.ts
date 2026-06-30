// @ainetwork/adk-provider-authz-mongodb
//
// Reusable role-based authorization for ADK agents: a PermissionResolver
// implementation (RoleResolver) over a Mongo-backed role/assignment store,
// plus a builder for the document route requirements. Agents wire it in a few
// lines instead of duplicating this code.
export * from "./implements/types";
export * from "./implements/role-resolver";
export * from "./implements/mongo-role-store";
export * from "./implements/inmemory-role-store";
export * from "./implements/route-requirements";
