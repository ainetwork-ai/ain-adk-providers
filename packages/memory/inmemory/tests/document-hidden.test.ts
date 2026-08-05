import type { Document } from "@ainetwork/adk/types/document";
import { InMemoryDocument } from "../implements/document.memory";

function doc(id: string, userId = "u1"): Document {
	return {
		documentId: id,
		userId,
		title: id,
		format: "MARKDOWN",
		content: "x",
		source: "MANUAL",
		version: 1,
		createdAt: "t",
		updatedAt: "t",
	};
}

describe("InMemoryDocument — hidden (soft delete)", () => {
	it("getDocument reads a hidden document as absent", async () => {
		const m = new InMemoryDocument();
		await m.createDocument(doc("a"));
		await m.updateDocument("a", { hidden: true });
		expect(await m.getDocument("a")).toBeUndefined();
	});

	it("listDocuments excludes hidden documents", async () => {
		const m = new InMemoryDocument();
		await m.createDocument(doc("a"));
		await m.createDocument(doc("b"));
		await m.updateDocument("a", { hidden: true });
		const out = await m.listDocuments("u1");
		expect(out.map((d) => d.documentId)).toEqual(["b"]);
	});

	it("listDocumentsAny / countDocumentsAny exclude hidden documents", async () => {
		const m = new InMemoryDocument();
		await m.createDocument(doc("a"));
		await m.createDocument(doc("b", "u2"));
		await m.updateDocument("b", { hidden: true });
		const sets = [
			{ userId: "u1", filter: {} },
			{ userId: "u2", filter: {} },
		];
		expect((await m.listDocumentsAny(sets)).map((d) => d.documentId)).toEqual([
			"a",
		]);
		expect(await m.countDocumentsAny(sets)).toBe(1);
	});
});
