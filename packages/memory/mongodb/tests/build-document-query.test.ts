import { buildDocumentQuery, buildDocumentOrQuery } from "../implements/build-document-query";

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

describe("date range", () => {
	it("builds labels.date range from dateFrom/dateTo", () => {
		const q = buildDocumentQuery(undefined, {
			dateFrom: "2026-08-01",
			dateTo: "2026-08-31",
		});
		expect(q).toEqual({
			"labels.date": { $gte: "2026-08-01", $lte: "2026-08-31" },
		});
	});

	it("drops malformed date bounds independently", () => {
		const q = buildDocumentQuery(undefined, {
			dateFrom: "20260801",
			dateTo: "2026-08-31",
		});
		expect(q).toEqual({ "labels.date": { $lte: "2026-08-31" } });
	});

	it("drops operator smuggling in date bounds", () => {
		const q = buildDocumentQuery(undefined, {
			dateFrom: { $ne: "x" } as never,
		});
		expect(q).toEqual({});
	});

	it("date range wins over an exact labels.date filter", () => {
		const q = buildDocumentQuery(undefined, {
			labels: { date: "2026-08-15" },
			dateFrom: "2026-08-01",
		});
		expect(q).toEqual({ "labels.date": { $gte: "2026-08-01" } });
	});
});

describe("buildDocumentOrQuery", () => {
	it("single set → plain query (no $or)", () => {
		const q = buildDocumentOrQuery([
			{ userId: "u1", filter: { source: "MANUAL" as never } },
		]);
		expect(q).toEqual({ userId: "u1", source: "MANUAL" });
	});

	it("multiple sets → $or of per-set queries", () => {
		const q = buildDocumentOrQuery([
			{ userId: "u1", filter: {} },
			{ filter: { labels: { workplace: "seoul" } } },
		]);
		expect(q).toEqual({
			$or: [{ userId: "u1" }, { "labels.workplace": "seoul" }],
		});
	});

	it("throws on empty filter sets", () => {
		expect(() => buildDocumentOrQuery([])).toThrow();
	});
});
