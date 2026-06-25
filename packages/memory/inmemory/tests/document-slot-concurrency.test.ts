import type { Document } from "@ainetwork/adk/types/document";
import { InMemoryDocument } from "../implements/document.memory";

function makeDoc(): Document {
  return {
    documentId: "doc-1",
    userId: "user-1",
    title: "Log book",
    format: "MARKDOWN",
    content: "{{slot:a}}{{slot:b}}",
    source: "MANUAL",
    version: 1,
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    slots: [
      { slotId: "a", status: "empty" },
      { slotId: "b", status: "empty" },
    ],
  };
}

describe("InMemoryDocument.updateDocumentSlot — concurrent fills", () => {
  it("patches only the target slot and preserves a sibling slot's fragment", async () => {
    const memory = new InMemoryDocument();
    await memory.createDocument(makeDoc());

    // Slot A finishes first and is resolved with a fragment.
    await memory.updateDocumentSlot("doc-1", "a", {
      status: "resolved",
      fragment: {
        content: "A result",
        source: { type: "WORKFLOW", workflowId: "wf-a" },
        resolvedAt: "2026-06-25T00:00:01.000Z",
      },
    });

    // Slot B finishes later. This used to clobber A when the whole slots array
    // was rewritten from a stale snapshot taken before A resolved.
    await memory.updateDocumentSlot("doc-1", "b", {
      status: "resolved",
      fragment: {
        content: "B result",
        source: { type: "WORKFLOW", workflowId: "wf-b" },
        resolvedAt: "2026-06-25T00:00:02.000Z",
      },
    });

    const doc = await memory.getDocument("doc-1");
    const a = doc?.slots?.find((s) => s.slotId === "a");
    const b = doc?.slots?.find((s) => s.slotId === "b");

    expect(a?.status).toBe("resolved");
    expect(a?.fragment?.content).toBe("A result");
    expect(b?.status).toBe("resolved");
    expect(b?.fragment?.content).toBe("B result");
  });

  it("clears keys whose patch value is undefined", async () => {
    const memory = new InMemoryDocument();
    const doc = makeDoc();
    doc.slots = [{ slotId: "a", status: "failed", error: "boom" }];
    await memory.createDocument(doc);

    await memory.updateDocumentSlot("doc-1", "a", {
      status: "running",
      error: undefined,
    });

    const a = (await memory.getDocument("doc-1"))?.slots?.find((s) => s.slotId === "a");
    expect(a?.status).toBe("running");
    expect("error" in (a ?? {})).toBe(false);
  });

  it("bumps version on each slot update", async () => {
    const memory = new InMemoryDocument();
    await memory.createDocument(makeDoc());

    await memory.updateDocumentSlot("doc-1", "a", { status: "running" });
    await memory.updateDocumentSlot("doc-1", "b", { status: "running" });

    expect((await memory.getDocument("doc-1"))?.version).toBe(3);
  });
});
