import { createEmbeddings, getEmbeddingModel } from "../embeddings/index.js";
import { pool } from "../vector-db/client.js";
import { ensureSchema } from "../vector-db/schema.js";

function formatVector(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}

export interface SemanticScriptCandidate {
  chunkId: string;
  scriptEntryId: string;
  similarity: number;
  sectionCode: string;
  sectionTitle: string;
  pageStart: number;
  pageEnd: number;
  scenarioText: string;
  scriptText: string;
  notesText: string;
  contentPreview: string;
}

export interface SemanticPmCandidate {
  chunkId: string;
  pmReferenceId: string;
  similarity: number;
  sectionCode: string;
  sectionTitle: string;
  pageNumber: number;
  textExcerpt: string;
  imageCount: number;
  contentPreview: string;
}

export interface SemanticRetrievalResult {
  query: string;
  embeddingModel: string;
  scripts: SemanticScriptCandidate[];
  pmReferences: SemanticPmCandidate[];
}

async function createQueryEmbedding(query: string) {
  const model = getEmbeddingModel();
  const [embedding] = await createEmbeddings([query], model);

  return {
    model,
    embedding
  };
}

async function searchSemanticScriptCandidatesByEmbedding(embedding: number[], limit = 5): Promise<SemanticScriptCandidate[]> {
  await ensureSchema();
  const { rows } = await pool.query(
    `
      SELECT
        rc.id AS "chunkId",
        rc.script_entry_id AS "scriptEntryId",
        rc.section_code AS "sectionCode",
        rc.section_title AS "sectionTitle",
        rc.page_start AS "pageStart",
        rc.page_end AS "pageEnd",
        LEFT(rc.content, 240) AS "contentPreview",
        1 - (rc.embedding <=> $1::vector) AS similarity,
        se.scenario_text AS "scenarioText",
        se.script_text AS "scriptText",
        se.notes_text AS "notesText"
      FROM retrieval_chunks rc
      INNER JOIN script_entries se ON se.id = rc.script_entry_id
      WHERE rc.source_kind = 'scripts'
      AND rc.document_version_id = (
        SELECT id
        FROM document_versions
        WHERE kind = 'scripts' AND status = 'indexed'
        ORDER BY document_date DESC, indexed_at DESC NULLS LAST
        LIMIT 1
      )
      ORDER BY rc.embedding <=> $1::vector
      LIMIT $2
    `,
    [formatVector(embedding), limit]
  );

  return rows.map((row) => ({
    chunkId: String(row.chunkId),
    scriptEntryId: String(row.scriptEntryId),
    similarity: Number(row.similarity),
    sectionCode: String(row.sectionCode),
    sectionTitle: String(row.sectionTitle),
    pageStart: Number(row.pageStart),
    pageEnd: Number(row.pageEnd),
    scenarioText: String(row.scenarioText),
    scriptText: String(row.scriptText),
    notesText: String(row.notesText),
    contentPreview: String(row.contentPreview)
  }));
}

async function searchSemanticPmCandidatesByEmbedding(embedding: number[], limit = 5): Promise<SemanticPmCandidate[]> {
  await ensureSchema();
  const { rows } = await pool.query(
    `
      SELECT
        rc.id AS "chunkId",
        rc.pm_reference_id AS "pmReferenceId",
        rc.section_code AS "sectionCode",
        rc.section_title AS "sectionTitle",
        rc.page_start AS "pageNumber",
        LEFT(rc.content, 240) AS "contentPreview",
        1 - (rc.embedding <=> $1::vector) AS similarity,
        pr.text_excerpt AS "textExcerpt",
        pr.image_count AS "imageCount"
      FROM retrieval_chunks rc
      INNER JOIN pm_references pr ON pr.id = rc.pm_reference_id
      WHERE rc.source_kind = 'pm'
      AND rc.document_version_id = (
        SELECT id
        FROM document_versions
        WHERE kind = 'pm' AND status = 'indexed'
        ORDER BY document_date DESC, indexed_at DESC NULLS LAST
        LIMIT 1
      )
      ORDER BY rc.embedding <=> $1::vector
      LIMIT $2
    `,
    [formatVector(embedding), limit]
  );

  return rows.map((row) => ({
    chunkId: String(row.chunkId),
    pmReferenceId: String(row.pmReferenceId),
    similarity: Number(row.similarity),
    sectionCode: String(row.sectionCode),
    sectionTitle: String(row.sectionTitle),
    pageNumber: Number(row.pageNumber),
    textExcerpt: String(row.textExcerpt),
    imageCount: Number(row.imageCount),
    contentPreview: String(row.contentPreview)
  }));
}

export async function searchSemanticScriptCandidates(query: string, limit = 5): Promise<SemanticScriptCandidate[]> {
  const { embedding } = await createQueryEmbedding(query);
  return searchSemanticScriptCandidatesByEmbedding(embedding, limit);
}

export async function searchSemanticPmCandidates(query: string, limit = 5): Promise<SemanticPmCandidate[]> {
  const { embedding } = await createQueryEmbedding(query);
  return searchSemanticPmCandidatesByEmbedding(embedding, limit);
}

export async function runSemanticRetrieval(query: string, limit = 5): Promise<SemanticRetrievalResult> {
  const { model, embedding } = await createQueryEmbedding(query);
  const [scripts, pmReferences] = await Promise.all([
    searchSemanticScriptCandidatesByEmbedding(embedding, limit),
    searchSemanticPmCandidatesByEmbedding(embedding, limit)
  ]);

  return {
    query,
    embeddingModel: model,
    scripts,
    pmReferences
  };
}
