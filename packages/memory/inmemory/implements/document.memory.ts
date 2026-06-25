import { IDocumentMemory } from "@ainetwork/adk/modules";
import type {
  Document,
  DocumentFilter,
  DocumentSlot,
} from "@ainetwork/adk/types/document";

export class InMemoryDocument implements IDocumentMemory {
  private documents: Map<string, Document> = new Map();
  private userDocumentIndex: Map<string, Set<string>> = new Map();

  public async getDocument(documentId: string): Promise<Document | undefined> {
    return this.documents.get(documentId);
  }

  public async createDocument(document: Document): Promise<Document> {
    this.documents.set(document.documentId, document);

    if (!this.userDocumentIndex.has(document.userId)) {
      this.userDocumentIndex.set(document.userId, new Set());
    }
    this.userDocumentIndex.get(document.userId)?.add(document.documentId);

    return document;
  }

  public async updateDocument(
    documentId: string,
    document: Partial<Document>
  ): Promise<void> {
    const existing = this.documents.get(documentId);
    if (!existing) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // `documentId` is immutable; preserve it regardless of the payload.
    const updated = { ...existing, ...document, documentId };
    this.documents.set(documentId, updated);
  }

  public async updateDocumentSlot(
    documentId: string,
    slotId: string,
    patch: Partial<DocumentSlot>
  ): Promise<void> {
    const existing = this.documents.get(documentId);
    if (!existing) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Read-modify-write on the latest stored document (not a caller snapshot),
    // patching only the matched slot so concurrent fills of other slots are
    // preserved. `undefined` patch values clear the corresponding key.
    const { slotId: _slotId, ...fields } = patch;
    const slots = (existing.slots ?? []).map((slot) => {
      if (slot.slotId !== slotId) return slot;
      const next: Record<string, unknown> = { ...slot };
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) {
          delete next[key];
        } else {
          next[key] = value;
        }
      }
      return next as DocumentSlot;
    });

    this.documents.set(documentId, {
      ...existing,
      slots,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
      documentId,
    });
  }

  public async deleteDocument(documentId: string): Promise<void> {
    const document = this.documents.get(documentId);
    if (document) {
      this.documents.delete(documentId);
      this.userDocumentIndex.get(document.userId)?.delete(documentId);
    }
  }

  public async listDocuments(
    userId?: string,
    filter?: DocumentFilter
  ): Promise<Document[]> {
    let documents: Document[];

    if (userId) {
      const documentIds = this.userDocumentIndex.get(userId);
      if (!documentIds) return [];
      documents = [];
      for (const documentId of documentIds) {
        const document = this.documents.get(documentId);
        if (document) {
          documents.push(document);
        }
      }
    } else {
      documents = Array.from(this.documents.values());
    }

    if (filter?.workflowId) {
      documents = documents.filter((d) => d.workflowId === filter.workflowId);
    }
    if (filter?.threadId) {
      documents = documents.filter((d) => d.threadId === filter.threadId);
    }
    if (filter?.source) {
      documents = documents.filter((d) => d.source === filter.source);
    }
    if (filter?.labels) {
      const entries = Object.entries(filter.labels);
      documents = documents.filter((d) =>
        entries.every(([key, value]) => d.labels?.[key] === value)
      );
    }

    return documents;
  }
}
