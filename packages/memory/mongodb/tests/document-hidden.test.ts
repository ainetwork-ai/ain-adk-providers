import {
	buildDocumentOrQuery,
	buildDocumentQuery,
} from "../implements/build-document-query";
import { MongoDBDocument } from "../implements/document.memory";
import { DocumentModel, DocumentObjectSchema } from "../models/document.model";

const passthrough = async <T>(operation: () => Promise<T>): Promise<T> =>
	operation();
const timeout = (): number => 1000;

afterEach(() => {
	jest.restoreAllMocks();
});

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

describe("hidden exclusion in MongoDBDocument (inline filters)", () => {
	it("getDocument passes hidden: { $ne: true } alongside documentId", async () => {
		const findOneSpy = jest.spyOn(DocumentModel, "findOne").mockReturnValue({
			maxTimeMS: () => ({ lean: jest.fn().mockResolvedValue(null) }),
		} as never);
		const document = new MongoDBDocument(passthrough, timeout);

		await document.getDocument("d1");

		expect(findOneSpy).toHaveBeenCalledWith({
			documentId: "d1",
			hidden: { $ne: true },
		});
	});

	it("listAutoRefreshPendingDocuments passes hidden: { $ne: true } alongside the autoRefresh conditions", async () => {
		const findSpy = jest.spyOn(DocumentModel, "find").mockReturnValue({
			maxTimeMS: () => ({ lean: jest.fn().mockResolvedValue([]) }),
		} as never);
		const document = new MongoDBDocument(passthrough, timeout);

		await document.listAutoRefreshPendingDocuments();

		expect(findSpy).toHaveBeenCalledWith({
			"autoRefresh.active": true,
			"autoRefresh.completedAt": { $exists: false },
			hidden: { $ne: true },
		});
	});
});
