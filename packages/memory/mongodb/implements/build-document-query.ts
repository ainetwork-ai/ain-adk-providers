import type {
	DocumentFilter,
	DocumentFilterSet,
} from "@ainetwork/adk/types/document";

/** Keys containing `$` or `.` could smuggle Mongo operators or path
 * traversal into the query, so they are skipped entirely. */
function isSafeLabelKey(key: string): boolean {
	return !key.includes("$") && !key.includes(".");
}

/** YYYY-MM-DD only — anything else (operators, other shapes) is dropped. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
	// Inclusive range over labels.date. Applied after the labels loop so a
	// range always wins over an exact labels.date value from the same query.
	const range: Record<string, string> = {};
	if (typeof filter?.dateFrom === "string" && DATE_RE.test(filter.dateFrom)) {
		range.$gte = filter.dateFrom;
	}
	if (typeof filter?.dateTo === "string" && DATE_RE.test(filter.dateTo)) {
		range.$lte = filter.dateTo;
	}
	if (Object.keys(range).length > 0) {
		query["labels.date"] = range;
	}
	return query;
}

/**
 * Union (OR) of filter sets as one Mongo query, so skip/limit/count stay
 * correct across RBAC scopes. Callers guarantee at least one set — an empty
 * union would silently mean "match everything", so fail loudly instead.
 */
export function buildDocumentOrQuery(
	filters: DocumentFilterSet[],
): Record<string, unknown> {
	if (filters.length === 0) {
		throw new Error("buildDocumentOrQuery: empty filter sets");
	}
	const clauses = filters.map((s) => buildDocumentQuery(s.userId, s.filter));
	return clauses.length === 1 ? clauses[0] : { $or: clauses };
}
