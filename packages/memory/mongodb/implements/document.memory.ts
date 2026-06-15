import type { IDocumentMemory } from "@ainetwork/adk/modules";
import type { Document, DocumentFilter } from "@ainetwork/adk/types/document";
import { DocumentModel } from "../models/document.model";

export type ExecuteWithRetryFn = <T>(
  operation: () => Promise<T>,
  operationName?: string
) => Promise<T>;

export type GetOperationTimeoutFn = () => number;

export class MongoDBDocument implements IDocumentMemory {
  private executeWithRetry: ExecuteWithRetryFn;
  private getOperationTimeout: GetOperationTimeoutFn;

  constructor(
    executeWithRetry: ExecuteWithRetryFn,
    getOperationTimeout: GetOperationTimeoutFn
  ) {
    this.executeWithRetry = executeWithRetry;
    this.getOperationTimeout = getOperationTimeout;
  }

  public async getDocument(documentId: string): Promise<Document | undefined> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const document = await DocumentModel.findOne({ documentId })
        .maxTimeMS(timeout)
        .lean<Document>();
      return document || undefined;
    }, "getDocument()");
  }

  public async createDocument(document: Document): Promise<Document> {
    return this.executeWithRetry(async () => {
      const created = await DocumentModel.create(document);
      return created.toObject() as Document;
    }, "createDocument()");
  }

  public async updateDocument(
    documentId: string,
    document: Partial<Document>
  ): Promise<void> {
    // `documentId` is immutable; never let a payload reassign it.
    const { documentId: _documentId, ...mutableUpdates } = document;

    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await DocumentModel.updateOne(
        { documentId },
        { $set: mutableUpdates }
      ).maxTimeMS(timeout);
    }, "updateDocument()");
  }

  public async deleteDocument(documentId: string): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await DocumentModel.deleteOne({ documentId }).maxTimeMS(timeout);
    }, "deleteDocument()");
  }

  public async listDocuments(
    userId?: string,
    filter?: DocumentFilter
  ): Promise<Document[]> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      const query: Record<string, unknown> = {};
      if (userId) query.userId = userId;
      if (filter?.workflowId) query.workflowId = filter.workflowId;
      if (filter?.threadId) query.threadId = filter.threadId;
      if (filter?.source) query.source = filter.source;
      if (filter?.labels) {
        // Subset match: every provided label must equal the stored value.
        for (const [key, value] of Object.entries(filter.labels)) {
          query[`labels.${key}`] = value;
        }
      }

      const documents = await DocumentModel.find(query)
        .maxTimeMS(timeout)
        .lean<Document[]>();
      return documents;
    }, "listDocuments()");
  }
}
