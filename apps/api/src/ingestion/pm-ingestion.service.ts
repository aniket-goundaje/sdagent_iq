import type { DocumentVersion } from "@sd-agent-iq/shared";

import { getLatestDocument } from "../documents/document-files.js";
import { parsePmPdf } from "../parsing/pm-pdf.parser.js";
import { replacePmReferences, upsertDocumentVersion } from "../vector-db/script-repository.js";

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
  await upsertDocumentVersion({ ...documentVersion, status: "indexed" });

  return {
    documentVersion,
    referenceCount: parsed.references.length
  };
}
