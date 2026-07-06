import type { DocumentFilter } from "@ainetwork/adk/types/document";

/** Builds the Mongo query object for listDocuments. Scalar label values match
 * exactly; array values use $in. */
export function buildDocumentQuery(
	userId: string | undefined,
	filter?: DocumentFilter,
): Record<string, unknown> {
	const query: Record<string, unknown> = {};
	if (userId) query.userId = userId;
	if (filter?.workflowId) query.workflowId = filter.workflowId;
	if (filter?.threadId) query.threadId = filter.threadId;
	if (filter?.source) query.source = filter.source;
	if (filter?.labels) {
		for (const [key, value] of Object.entries(filter.labels)) {
			query[`labels.${key}`] = Array.isArray(value) ? { $in: value } : value;
		}
	}
	return query;
}
