import { buildDocumentQuery } from "../implements/build-document-query";

describe("buildDocumentQuery", () => {
	it("adds userId and scalar fields", () => {
		const q = buildDocumentQuery("u1", {
			workflowId: "w1",
			source: "MANUAL" as any,
		});
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

	describe("injection hardening", () => {
		it("drops operator-object label values (qs ?labels[category][$ne]=x)", () => {
			const q = buildDocumentQuery(undefined, {
				labels: { category: { $ne: "x" } as never },
			});
			expect(q).toEqual({});
		});

		it("skips label keys containing $ or .", () => {
			const q = buildDocumentQuery(undefined, {
				labels: {
					$where: "sleep(1000)",
					"a.b": "y",
					ok: "z",
				} as never,
			});
			expect(q).toEqual({ "labels.ok": "z" });
		});

		it("keeps only string elements of array label values", () => {
			const q = buildDocumentQuery(undefined, {
				labels: { category: ["a", { $ne: "b" }, 3] as never },
			});
			expect(q).toEqual({ "labels.category": { $in: ["a"] } });
		});

		it("drops array label values with no string elements", () => {
			const q = buildDocumentQuery(undefined, {
				labels: { category: [{ $ne: "b" }] as never },
			});
			expect(q).toEqual({});
		});

		it("drops non-string top-level filter fields (qs ?workflowId[$ne]=)", () => {
			const q = buildDocumentQuery(undefined, {
				workflowId: { $ne: "" } as never,
				threadId: { $gt: "" } as never,
				source: { $ne: "" } as never,
			});
			expect(q).toEqual({});
		});
	});
});
