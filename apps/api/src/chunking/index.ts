import { createHash } from "node:crypto";

import type { ParsedPmReference, ParsedScriptEntry } from "../parsing/types.js";

const PM_CHUNK_MAX_CHARS = 6000;
const PM_CHUNK_OVERLAP_CHARS = 500;

export type RetrievalChunkSourceKind = "scripts" | "pm";
export type RetrievalChunkKind = "script_entry" | "pm_page" | "pm_page_part";

export interface RetrievalChunkInput {
  id: string;
  documentVersionId: string;
  sourceKind: RetrievalChunkSourceKind;
  chunkKind: RetrievalChunkKind;
  scriptEntryId: string | null;
  pmReferenceId: string | null;
  sectionCode: string;
  sectionTitle: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  content: string;
  contentHash: string;
}

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function buildScriptEntryId(documentVersionId: string, index: number) {
  return `${documentVersionId}:row:${index + 1}`;
}

function buildPmReferenceId(documentVersionId: string, index: number) {
  return `${documentVersionId}:page:${index + 1}`;
}

function compactLines(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function splitText(text: string) {
  if (text.length <= PM_CHUNK_MAX_CHARS) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const hardEnd = Math.min(start + PM_CHUNK_MAX_CHARS, text.length);
    const softBreak = text.lastIndexOf("\n", hardEnd);
    const end = softBreak > start + PM_CHUNK_MAX_CHARS / 2 ? softBreak : hardEnd;
    chunks.push(text.slice(start, end).trim());

    if (end === text.length) {
      break;
    }

    start = Math.max(0, end - PM_CHUNK_OVERLAP_CHARS);
  }

  return chunks.filter(Boolean);
}

export function buildScriptRetrievalChunks(documentVersionId: string, entries: ParsedScriptEntry[]) {
  return entries.map((entry, index) => {
    const scriptEntryId = buildScriptEntryId(documentVersionId, index);
    const content = compactLines([
      `Section: ${entry.sectionCode} ${entry.sectionTitle}`,
      `Scenario: ${entry.scenarioText}`,
      `Script: ${entry.scriptText}`,
      `Notes: ${entry.notesText}`
    ]);

    return {
      id: `${scriptEntryId}:chunk:0`,
      documentVersionId,
      sourceKind: "scripts",
      chunkKind: "script_entry",
      scriptEntryId,
      pmReferenceId: null,
      sectionCode: entry.sectionCode,
      sectionTitle: entry.sectionTitle,
      pageStart: entry.pageStart,
      pageEnd: entry.pageEnd,
      chunkIndex: 0,
      content,
      contentHash: hashContent(content)
    } satisfies RetrievalChunkInput;
  });
}

export function buildPmRetrievalChunks(documentVersionId: string, references: ParsedPmReference[]) {
  return references.flatMap((reference, referenceIndex) => {
    const pmReferenceId = buildPmReferenceId(documentVersionId, referenceIndex);
    const baseContent = compactLines([
      `Section: ${reference.sectionCode} ${reference.sectionTitle}`,
      `Page: ${reference.page}`,
      reference.text
    ]);
    const parts = splitText(baseContent);

    return parts.map((content, chunkIndex) => ({
      id: `${pmReferenceId}:chunk:${chunkIndex}`,
      documentVersionId,
      sourceKind: "pm",
      chunkKind: parts.length === 1 ? "pm_page" : "pm_page_part",
      scriptEntryId: null,
      pmReferenceId,
      sectionCode: reference.sectionCode,
      sectionTitle: reference.sectionTitle,
      pageStart: reference.page,
      pageEnd: reference.page,
      chunkIndex,
      content,
      contentHash: hashContent(content)
    }) satisfies RetrievalChunkInput);
  });
}
