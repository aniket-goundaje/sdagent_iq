import fs from "node:fs/promises";
import path from "node:path";

import { env } from "../config/env.js";

export type DocumentKind = "scripts" | "pm";

export interface DiscoveredDocumentFile {
  id: string;
  kind: DocumentKind;
  fileName: string;
  absolutePath: string;
  documentDate: string;
}

function parseDateFromFileName(fileName: string) {
  const match = fileName.match(/(\d{2})(\d{2})(\d{4})/);

  if (!match) {
    return null;
  }

  const [, month, day, year] = match;
  return `${year}-${month}-${day}`;
}

function detectKind(fileName: string): DocumentKind | null {
  const lower = fileName.toLowerCase();

  if (lower.includes("scripts")) {
    return "scripts";
  }

  if (lower.includes(" pm ")) {
    return "pm";
  }

  if (lower.includes(" pm.")) {
    return "pm";
  }

  return null;
}

export async function listDiscoveredDocuments() {
  const entries = await fs.readdir(env.documentsIncomingPath, { withFileTypes: true });
  const files: DiscoveredDocumentFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pdf")) {
      continue;
    }

    const kind = detectKind(entry.name);
    const documentDate = parseDateFromFileName(entry.name);

    if (!kind || !documentDate) {
      continue;
    }

    files.push({
      id: `${kind}:${documentDate}:${entry.name}`,
      kind,
      fileName: entry.name,
      absolutePath: path.join(env.documentsIncomingPath, entry.name),
      documentDate
    });
  }

  return files.sort((left, right) => right.documentDate.localeCompare(left.documentDate));
}

export async function getLatestDocument(kind: DocumentKind) {
  const discovered = await listDiscoveredDocuments();
  return discovered.find((file) => file.kind === kind) ?? null;
}
