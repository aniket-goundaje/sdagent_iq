import type { DocumentVersion } from "@sd-agent-iq/shared";

import { buildPmRetrievalChunks } from "../chunking/index.js";
import { getLatestDocument } from "../documents/document-files.js";
import { createEmbeddings, getEmbeddingModel } from "../embeddings/index.js";
import { parsePmPdf } from "../parsing/pm-pdf.parser.js";
import { replacePmReferences, replaceRetrievalChunks, upsertDocumentVersion } from "../vector-db/script-repository.js";

export async function ingestLatestPmDocument() {
  const latest = await getLatestDocument("pm");

  if (!latest) {
    throw new Error("No PM PDF found in documents/incoming.");
  }

  const parsed = await parsePmPdf(latest.absolutePath);
  const documentVersion: DocumentVersion = {
    id: latest.id,
    kind: "pm",
    fileName: latest.fileName,
    documentDate: latest.documentDate,
    uploadedAt: new Date().toISOString(),
    status: "pending"
  };

  await upsertDocumentVersion(documentVersion);
  await replacePmReferences(documentVersion.id, parsed.references);
  const chunks = buildPmRetrievalChunks(documentVersion.id, parsed.references);
  const embeddingModel = getEmbeddingModel();
  const embeddings = await createEmbeddings(chunks.map((chunk) => chunk.content), embeddingModel);
  await replaceRetrievalChunks(documentVersion.id, chunks, embeddings, embeddingModel);
  await upsertDocumentVersion({ ...documentVersion, status: "indexed" });

  return {
    documentVersion,
    referenceCount: parsed.references.length,
    chunkCount: chunks.length
  };
}
