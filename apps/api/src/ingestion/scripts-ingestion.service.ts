import type { DocumentVersion } from "@sd-agent-iq/shared";

import { getLatestDocument } from "../documents/document-files.js";
import { parseScriptsPdf } from "../parsing/script-pdf.parser.js";
import { replaceScriptEntries, upsertDocumentVersion } from "../vector-db/script-repository.js";

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
  await upsertDocumentVersion({ ...documentVersion, status: "indexed" });

  return {
    documentVersion,
    entryCount: parsed.entries.length
  };
}
