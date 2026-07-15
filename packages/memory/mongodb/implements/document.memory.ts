import type { IDocumentMemory } from "@ainetwork/adk/modules";
import type {
  Document,
  DocumentFilter,
  DocumentSlot,
} from "@ainetwork/adk/types/document";
import { DocumentModel } from "../models/document.model";
import { buildDocumentQuery } from "./build-document-query";

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

  public async updateDocumentSlot(
    documentId: string,
    slotId: string,
    patch: Partial<DocumentSlot>
  ): Promise<void> {
    // Target only the matched slot via the positional `$` operator so
    // concurrent fills of other slots are never overwritten. `slotId` is the
    // slot's identity and must not be patched.
    const { slotId: _slotId, ...fields } = patch;
    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const unset: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) {
        unset[`slots.$.${key}`] = "";
      } else {
        set[`slots.$.${key}`] = value;
      }
    }

    const update: Record<string, unknown> = { $set: set, $inc: { version: 1 } };
    if (Object.keys(unset).length > 0) {
      update.$unset = unset;
    }

    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await DocumentModel.updateOne(
        { documentId, "slots.slotId": slotId },
        update
      ).maxTimeMS(timeout);
    }, "updateDocumentSlot()");
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
      const query = buildDocumentQuery(userId, filter);

      const documents = await DocumentModel.find(query)
        .maxTimeMS(timeout)
        .lean<Document[]>();
      return documents;
    }, "listDocuments()");
  }

  public async listAutoRefreshPendingDocuments(): Promise<Document[]> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      return await DocumentModel.find({
        "autoRefresh.active": true,
        "autoRefresh.completedAt": { $exists: false },
      })
        .maxTimeMS(timeout)
        .lean<Document[]>();
    }, "listAutoRefreshPendingDocuments()");
  }

  public async markAutoRefreshSlotDone(
    documentId: string,
    slotId: string
  ): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await DocumentModel.updateOne(
        { documentId },
        { $addToSet: { "autoRefresh.doneSlotIds": slotId } }
      ).maxTimeMS(timeout);
    }, "markAutoRefreshSlotDone()");
  }

  public async completeAutoRefresh(
    documentId: string,
    completedAt: number
  ): Promise<void> {
    return this.executeWithRetry(async () => {
      const timeout = this.getOperationTimeout();
      await DocumentModel.updateOne(
        { documentId },
        { $set: { "autoRefresh.completedAt": completedAt } }
      ).maxTimeMS(timeout);
    }, "completeAutoRefresh()");
  }
}
