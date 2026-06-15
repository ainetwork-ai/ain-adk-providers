import { IDocumentMemory } from "@ainetwork/adk/modules";
import type { Document, DocumentFilter } from "@ainetwork/adk/types/document";

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
    if (filter?.groupId) {
      documents = documents.filter((d) => d.groupId === filter.groupId);
    }

    return documents;
  }
}
