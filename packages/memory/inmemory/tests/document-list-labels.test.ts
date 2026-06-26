import type { Document } from "@ainetwork/adk/types/document";
import { InMemoryDocument } from "../implements/document.memory";

function doc(id: string, workplace: string): Document {
	return {
		documentId: id,
		userId: `owner-${id}`,
		title: id,
		format: "MARKDOWN",
		content: "x",
		source: "MANUAL",
		version: 1,
		labels: { category: "logbook", workplace },
		createdAt: "t",
		updatedAt: "t",
	};
}

describe("InMemoryDocument.listDocuments — multi-value labels", () => {
	it("matches any value when label filter is an array ($in)", async () => {
		const m = new InMemoryDocument();
		await m.createDocument(doc("a", "walkerhill"));
		await m.createDocument(doc("b", "seoul"));
		await m.createDocument(doc("c", "busan"));

		const out = await m.listDocuments(undefined, {
			labels: { category: "logbook", workplace: ["walkerhill", "seoul"] },
		});
		expect(out.map((d) => d.documentId).sort()).toEqual(["a", "b"]);
	});

	it("still matches exact string values", async () => {
		const m = new InMemoryDocument();
		await m.createDocument(doc("a", "walkerhill"));
		await m.createDocument(doc("b", "seoul"));
		const out = await m.listDocuments(undefined, { labels: { workplace: "seoul" } });
		expect(out.map((d) => d.documentId)).toEqual(["b"]);
	});
});
