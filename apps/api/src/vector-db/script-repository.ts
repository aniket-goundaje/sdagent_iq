import { randomUUID } from "node:crypto";

import type { Citation, DocumentStatusResponse, DocumentVersion, ParsedScriptScenarioMatch, ReferenceScreenshot } from "@sd-agent-iq/shared";

import { pool } from "./client.js";
import { ensureSchema } from "./schema.js";
import { env } from "../config/env.js";
import type { ParsedPmReference, ParsedScriptEntry } from "../parsing/types.js";

export interface StoredScriptEntry {
  id: string;
  scenarioText: string;
  scriptText: string;
  notesText: string;
  pageStart: number;
  pageEnd: number;
  sectionCode: string;
  sectionTitle: string;
  score?: number;
}

interface StoredPmReference {
  id: string;
  sectionCode: string;
  sectionTitle: string;
  pageNumber: number;
  textExcerpt: string;
  imageCount: number;
}

function mapStoredScriptEntry(row: Record<string, string | number>): StoredScriptEntry {
  return {
    id: String(row.id),
    scenarioText: String(row.scenarioText),
    scriptText: String(row.scriptText),
    notesText: String(row.notesText),
    pageStart: Number(row.pageStart),
    pageEnd: Number(row.pageEnd),
    sectionCode: String(row.sectionCode),
    sectionTitle: String(row.sectionTitle)
  } satisfies StoredScriptEntry;
}

function mapDocumentVersion(row: Record<string, string>): DocumentVersion {
  return {
    id: row.id,
    kind: row.kind as "scripts" | "pm",
    fileName: row.file_name,
    documentDate: new Date(row.document_date).toISOString(),
    uploadedAt: row.uploaded_at,
    status: row.status as "pending" | "indexed" | "failed"
  };
}

export async function upsertDocumentVersion(version: DocumentVersion) {
  await ensureSchema();

  await pool.query(
    `
      INSERT INTO document_versions (id, kind, file_name, document_date, uploaded_at, indexed_at, status)
      VALUES ($1, $2, $3, $4, NOW(), CASE WHEN $5 = 'indexed' THEN NOW() ELSE NULL END, $5)
      ON CONFLICT (id)
      DO UPDATE SET
        file_name = EXCLUDED.file_name,
        document_date = EXCLUDED.document_date,
        indexed_at = CASE WHEN EXCLUDED.status = 'indexed' THEN NOW() ELSE document_versions.indexed_at END,
        status = EXCLUDED.status
    `,
    [version.id, version.kind, version.fileName, version.documentDate, version.status]
  );
}

export async function replaceScriptEntries(documentVersionId: string, entries: ParsedScriptEntry[]) {
  await ensureSchema();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM script_entries WHERE document_version_id = $1", [documentVersionId]);

    for (const [index, entry] of entries.entries()) {
      const searchText = [
        entry.sectionTitle,
        entry.sectionCode,
        entry.scenarioText,
        entry.scriptText,
        entry.notesText
      ]
        .filter(Boolean)
        .join("\n");

      await client.query(
        `
          INSERT INTO script_entries (
            id,
            document_version_id,
            section_code,
            section_title,
            page_start,
            page_end,
            scenario_text,
            script_text,
            notes_text,
            search_text
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          `${documentVersionId}:row:${index + 1}`,
          documentVersionId,
          entry.sectionCode,
          entry.sectionTitle,
          entry.pageStart,
          entry.pageEnd,
          entry.scenarioText,
          entry.scriptText,
          entry.notesText,
          searchText
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function replacePmReferences(documentVersionId: string, references: ParsedPmReference[]) {
  await ensureSchema();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM pm_references WHERE document_version_id = $1", [documentVersionId]);

    for (const [index, reference] of references.entries()) {
      const searchText = [
        reference.sectionCode,
        reference.sectionTitle,
        reference.text
      ]
        .filter(Boolean)
        .join("\n");

      await client.query(
        `
          INSERT INTO pm_references (
            id,
            document_version_id,
            section_code,
            section_title,
            page_number,
            text_excerpt,
            image_count,
            search_text
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          `${documentVersionId}:page:${index + 1}`,
          documentVersionId,
          reference.sectionCode,
          reference.sectionTitle,
          reference.page,
          reference.text,
          reference.imageCount,
          searchText
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getActiveDocumentStatus(discoveredVersions: DocumentVersion[]): Promise<DocumentStatusResponse> {
  await ensureSchema();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM document_versions
      WHERE kind = 'scripts' AND status = 'indexed'
      ORDER BY document_date DESC, indexed_at DESC NULLS LAST
      LIMIT 1
    `
  );

  return {
    activeVersion: rows[0] ? mapDocumentVersion(rows[0]) : null,
    latestDiscoveredVersions: discoveredVersions,
    ingestionState: rows[0] ? "completed" : "not_started"
  };
}

export async function findScriptEntryById(id: string) {
  await ensureSchema();
  const { rows } = await pool.query(
    `
      SELECT
        id,
        scenario_text AS "scenarioText",
        script_text AS "scriptText",
        notes_text AS "notesText",
        page_start AS "pageStart",
        page_end AS "pageEnd",
        section_code AS "sectionCode",
        section_title AS "sectionTitle"
      FROM script_entries
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return rows[0] ? mapStoredScriptEntry(rows[0]) : null;
}

export async function searchScripts(question: string, limit = 5) {
  await ensureSchema();
  const lowered = question.trim().toLowerCase();
  const tokens = Array.from(
    new Set(
      lowered
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
    )
  );

  const { rows } = await pool.query(
    `
      SELECT
        id,
        scenario_text AS "scenarioText",
        script_text AS "scriptText",
        notes_text AS "notesText",
        page_start AS "pageStart",
        page_end AS "pageEnd",
        section_code AS "sectionCode",
        section_title AS "sectionTitle"
      FROM script_entries
      WHERE document_version_id = (
        SELECT id
        FROM document_versions
        WHERE kind = 'scripts' AND status = 'indexed'
        ORDER BY document_date DESC, indexed_at DESC NULLS LAST
        LIMIT 1
      )
      AND (
        search_text ILIKE '%' || $1 || '%'
        OR scenario_text ILIKE '%' || $1 || '%'
        OR search_text ILIKE ANY($2::text[])
      )
      LIMIT 150
    `,
    [question, tokens.map((token) => `%${token}%`)]
  );

  const scored = rows
    .map((row) => mapStoredScriptEntry(row as Record<string, string | number>))
    .map((entry) => {
      const scenario = entry.scenarioText.toLowerCase();
      const searchArea = `${entry.sectionTitle}\n${entry.scenarioText}\n${entry.scriptText}\n${entry.notesText}`.toLowerCase();
      const exactScenario = scenario === lowered;
      const phraseInScenario = scenario.includes(lowered);
      const phraseInSearch = searchArea.includes(lowered);
      const tokenHitsInScenario = tokens.filter((token) => scenario.includes(token)).length;
      const tokenHitsInSearch = tokens.filter((token) => searchArea.includes(token)).length;

      let score = 0;
      if (exactScenario) score += 100;
      if (phraseInScenario) score += 50;
      if (phraseInSearch) score += 15;
      score += tokenHitsInScenario * 10;
      score += tokenHitsInSearch * 2;

      return { entry: { ...entry, score }, score };
    })
    .sort((left, right) => right.score - left.score || left.entry.pageStart - right.entry.pageStart)
    .slice(0, limit)
    .map((item) => item.entry);

  return scored;
}

export function toScenarioMatches(entries: StoredScriptEntry[]): ParsedScriptScenarioMatch[] {
  return entries.map((entry) => ({
    id: entry.id,
    scenarioText: entry.scenarioText,
    sectionTitle: entry.sectionTitle,
    pageStart: entry.pageStart,
    pageEnd: entry.pageEnd
  }));
}

export function toCitations(entry: StoredScriptEntry): Citation[] {
  return [
    {
      label: `${entry.sectionCode} ${entry.sectionTitle}`,
      sourceType: "scripts_pdf",
      page: entry.pageStart
    }
  ];
}

function mapStoredPmReference(row: Record<string, string | number>) {
  return {
    id: String(row.id),
    sectionCode: String(row.sectionCode),
    sectionTitle: String(row.sectionTitle),
    pageNumber: Number(row.pageNumber),
    textExcerpt: String(row.textExcerpt),
    imageCount: Number(row.imageCount)
  } satisfies StoredPmReference;
}

export async function searchPmReferences(question: string, contextText: string, limit = 3) {
  await ensureSchema();
  const combined = `${question}\n${contextText}`.trim().toLowerCase();
  const tokens = Array.from(
    new Set(
      combined
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
    )
  );

  if (tokens.length === 0) {
    return [] as StoredPmReference[];
  }

  const { rows } = await pool.query(
    `
      SELECT
        id,
        section_code AS "sectionCode",
        section_title AS "sectionTitle",
        page_number AS "pageNumber",
        text_excerpt AS "textExcerpt",
        image_count AS "imageCount"
      FROM pm_references
      WHERE document_version_id = (
        SELECT id
        FROM document_versions
        WHERE kind = 'pm' AND status = 'indexed'
        ORDER BY document_date DESC, indexed_at DESC NULLS LAST
        LIMIT 1
      )
      AND search_text ILIKE ANY($1::text[])
      LIMIT 120
    `,
    [tokens.map((token) => `%${token}%`)]
  );

  return rows
    .map((row) => mapStoredPmReference(row as Record<string, string | number>))
    .map((reference) => {
      const haystack = `${reference.sectionCode}\n${reference.sectionTitle}\n${reference.textExcerpt}`.toLowerCase();
      const tokenHits = tokens.filter((token) => haystack.includes(token)).length;
      let score = tokenHits * 5;
      if (reference.imageCount > 0) {
        score += 8;
      }
      if (reference.sectionTitle.toLowerCase().includes(question.toLowerCase())) {
        score += 12;
      }

      return { reference, score };
    })
    .sort((left, right) => right.score - left.score || left.reference.pageNumber - right.reference.pageNumber)
    .slice(0, limit)
    .map((item) => item.reference);
}

export async function getLatestIndexedDocument(kind: "scripts" | "pm") {
  await ensureSchema();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM document_versions
      WHERE kind = $1 AND status = 'indexed'
      ORDER BY document_date DESC, indexed_at DESC NULLS LAST
      LIMIT 1
    `,
    [kind]
  );

  return rows[0] ? mapDocumentVersion(rows[0]) : null;
}

export function toReferenceLinks(references: StoredPmReference[]): ReferenceScreenshot[] {
  return references.map((reference) => ({
    id: reference.id,
    title: `${reference.sectionCode} ${reference.sectionTitle}`,
    imageUrl: `http://localhost:${env.apiPort}/api/documents/latest/pm#page=${reference.pageNumber}`,
    page: reference.pageNumber
  }));
}
