import type { Document } from "@ainetwork/adk/types/document";
import { InMemoryDocument } from "../implements/document.memory";

function doc(
	id: string,
	userId: string,
	over: Partial<Document> = {},
): Document {
	return {
		documentId: id,
		userId,
		title: id,
		format: "MARKDOWN",
		content: "x",
		source: "MANUAL",
		version: 1,
		createdAt: "t",
		updatedAt: "2026-08-01T00:00:00.000Z",
		slots: [{ slotId: "s1", status: "empty" }],
		...over,
	};
}

async function seed(): Promise<InMemoryDocument> {
	const m = new InMemoryDocument();
	// A: u1 소유, 8/1. B: u2 소유 + seoul, 8/3. C: u1 소유 + seoul, 8/2.
	await m.createDocument(doc("A", "u1"));
	await m.createDocument(
		doc("B", "u2", {
			updatedAt: "2026-08-03T00:00:00.000Z",
			labels: { workplace: "seoul", date: "2026-08-03" },
		}),
	);
	await m.createDocument(
		doc("C", "u1", {
			updatedAt: "2026-08-02T00:00:00.000Z",
			labels: { workplace: "seoul", date: "2026-07-15" },
		}),
	);
	return m;
}

describe("InMemoryDocument date range + listDocumentsAny", () => {
	it("filters by labels.date range; documents without the label are excluded", async () => {
		const m = await seed();
		const out = await m.listDocuments(undefined, {
			dateFrom: "2026-08-01",
			dateTo: "2026-08-31",
		});
		expect(out.map((d) => d.documentId)).toEqual(["B"]);
	});

	it("unions filter sets, dedupes by documentId, sorts updatedAt desc", async () => {
		const m = await seed();
		// C는 두 집합(u1 소유, seoul) 모두에 걸리지만 한 번만 나와야 한다
		const items = await m.listDocumentsAny([
			{ userId: "u1" },
			{ filter: { labels: { workplace: "seoul" } } },
		]);
		expect(items.map((d) => d.documentId)).toEqual(["B", "C", "A"]);
	});

	it("applies offset/limit after sorting", async () => {
		const m = await seed();
		const items = await m.listDocumentsAny(
			[{ userId: "u1" }, { filter: { labels: { workplace: "seoul" } } }],
			{ limit: 1, offset: 1 },
		);
		expect(items.map((d) => d.documentId)).toEqual(["C"]);
	});

	it("summary omits slots via a copy, leaving stored documents intact", async () => {
		const m = await seed();
		const items = await m.listDocumentsAny([{ userId: "u1" }], {
			summary: true,
		});
		expect(items[0]).not.toHaveProperty("slots");
		const stored = await m.getDocument("A");
		expect(stored?.slots).toBeDefined();
	});

	it("countDocumentsAny counts the deduped union", async () => {
		const m = await seed();
		await expect(
			m.countDocumentsAny([
				{ userId: "u1" },
				{ filter: { labels: { workplace: "seoul" } } },
			]),
		).resolves.toBe(3);
	});
});
