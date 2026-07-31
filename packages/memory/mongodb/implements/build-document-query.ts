import type { DocumentFilter } from "@ainetwork/adk/types/document";

/** Keys containing `$` or `.` could smuggle Mongo operators or path
 * traversal into the query, so they are skipped entirely. */
function isSafeLabelKey(key: string): boolean {
	return !key.includes("$") && !key.includes(".");
}

/** Builds the Mongo query object for listDocuments. Scalar label values match
 * exactly; array values use $in.
 *
 * Filter values come from user-controlled input (Express qs parsing turns
 * `?labels[category][$ne]=x` into an operator object), so only `string` and
 * `string[]` values are accepted — everything else is dropped. */
export function buildDocumentQuery(
	userId: string | undefined,
	filter?: DocumentFilter,
): Record<string, unknown> {
	const query: Record<string, unknown> = {};
	if (userId) query.userId = userId;
	if (typeof filter?.workflowId === "string" && filter.workflowId) {
		query.workflowId = filter.workflowId;
	}
	if (typeof filter?.threadId === "string" && filter.threadId) {
		query.threadId = filter.threadId;
	}
	if (typeof filter?.source === "string" && filter.source) {
		query.source = filter.source;
	}
	if (filter?.labels) {
		for (const [key, value] of Object.entries(filter.labels)) {
			if (!isSafeLabelKey(key)) continue;
			if (typeof value === "string") {
				query[`labels.${key}`] = value;
			} else if (Array.isArray(value)) {
				const strings = value.filter(
					(item): item is string => typeof item === "string",
				);
				if (strings.length > 0) {
					query[`labels.${key}`] = { $in: strings };
				}
			}
			// Any other shape (operator objects, numbers, ...) is dropped.
		}
	}
	return query;
}
