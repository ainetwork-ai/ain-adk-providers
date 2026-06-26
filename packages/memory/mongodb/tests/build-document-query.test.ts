import { buildDocumentQuery } from "../implements/build-document-query";

describe("buildDocumentQuery", () => {
	it("adds userId and scalar fields", () => {
		const q = buildDocumentQuery("u1", { workflowId: "w1", source: "MANUAL" as any });
		expect(q).toEqual({ userId: "u1", workflowId: "w1", source: "MANUAL" });
	});

	it("uses $in for array label values", () => {
		const q = buildDocumentQuery(undefined, {
			labels: { category: "logbook", workplace: ["walkerhill", "seoul"] },
		});
		expect(q).toEqual({
			"labels.category": "logbook",
			"labels.workplace": { $in: ["walkerhill", "seoul"] },
		});
	});

	it("uses exact match for scalar label values", () => {
		const q = buildDocumentQuery(undefined, { labels: { workplace: "seoul" } });
		expect(q).toEqual({ "labels.workplace": "seoul" });
	});

	it("omits userId when undefined", () => {
		const q = buildDocumentQuery(undefined, {});
		expect(q).toEqual({});
	});
});
