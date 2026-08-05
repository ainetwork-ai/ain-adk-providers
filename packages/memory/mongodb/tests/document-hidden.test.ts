import {
	buildDocumentOrQuery,
	buildDocumentQuery,
} from "../implements/build-document-query";
import { DocumentObjectSchema } from "../models/document.model";

describe("Document schema — hidden", () => {
	it("declares hidden as a Boolean path (strict mode persists it)", () => {
		const path = DocumentObjectSchema.path("hidden");
		expect(path).toBeDefined();
		expect(path.instance).toBe("Boolean");
	});
});

describe("hidden exclusion in queries", () => {
	it("buildDocumentQuery always excludes hidden documents", () => {
		const q = buildDocumentQuery("u1", {});
		expect(q).toEqual({ hidden: { $ne: true }, userId: "u1" });
	});

	it("buildDocumentOrQuery excludes hidden in every clause", () => {
		const q = buildDocumentOrQuery([
			{ userId: "u1", filter: {} },
			{ filter: { labels: { workplace: "seoul" } } },
		]);
		expect(q).toEqual({
			$or: [
				{ hidden: { $ne: true }, userId: "u1" },
				{ hidden: { $ne: true }, "labels.workplace": "seoul" },
			],
		});
	});
});
