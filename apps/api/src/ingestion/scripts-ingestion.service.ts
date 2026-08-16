import type { DocumentVersion } from "@sd-agent-iq/shared";

import { buildScriptRetrievalChunks } from "../chunking/index.js";
import { getLatestDocument } from "../documents/document-files.js";
import { createEmbeddings, getEmbeddingModel } from "../embeddings/index.js";
import { parseScriptsPdf } from "../parsing/script-pdf.parser.js";
import { replaceRetrievalChunks, replaceScriptEntries, upsertDocumentVersion } from "../vector-db/script-repository.js";

export async function ingestLatestScriptsDocument() {
  const latest = await getLatestDocument("scripts");

  if (!latest) {
    throw new Error("No Scripts PDF found in documents/incoming.");
  }

  const parsed = await parseScriptsPdf(latest.absolutePath);
  const documentVersion: DocumentVersion = {
    id: latest.id,
    kind: "scripts",
    fileName: latest.fileName,
    documentDate: latest.documentDate,
    uploadedAt: new Date().toISOString(),
    status: "pending"
  };

  await upsertDocumentVersion(documentVersion);
  await replaceScriptEntries(documentVersion.id, parsed.entries);
  const chunks = buildScriptRetrievalChunks(documentVersion.id, parsed.entries);
  const embeddingModel = getEmbeddingModel();
  const embeddings = await createEmbeddings(chunks.map((chunk) => chunk.content), embeddingModel);
  await replaceRetrievalChunks(documentVersion.id, chunks, embeddings, embeddingModel);
  await upsertDocumentVersion({ ...documentVersion, status: "indexed" });

  return {
    documentVersion,
    entryCount: parsed.entries.length,
    chunkCount: chunks.length
  };
}
