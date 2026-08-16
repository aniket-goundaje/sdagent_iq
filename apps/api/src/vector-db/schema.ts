import { pool } from "./client.js";

let schemaReady = false;

export async function ensureSchema() {
  if (schemaReady) {
    return;
  }

  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('scripts', 'pm')),
      file_name TEXT NOT NULL,
      document_date DATE NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      indexed_at TIMESTAMPTZ,
      status TEXT NOT NULL CHECK (status IN ('pending', 'indexed', 'failed'))
    );

    CREATE TABLE IF NOT EXISTS script_entries (
      id TEXT PRIMARY KEY,
      document_version_id TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
      section_code TEXT NOT NULL,
      section_title TEXT NOT NULL,
      page_start INTEGER NOT NULL,
      page_end INTEGER NOT NULL,
      scenario_text TEXT NOT NULL,
      script_text TEXT NOT NULL,
      notes_text TEXT NOT NULL,
      search_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS script_entries_document_idx ON script_entries(document_version_id);
    CREATE INDEX IF NOT EXISTS script_entries_search_trgm_idx ON script_entries USING GIN (search_text gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS script_entries_scenario_trgm_idx ON script_entries USING GIN (scenario_text gin_trgm_ops);

    CREATE TABLE IF NOT EXISTS pm_references (
      id TEXT PRIMARY KEY,
      document_version_id TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
      section_code TEXT NOT NULL,
      section_title TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      text_excerpt TEXT NOT NULL,
      image_count INTEGER NOT NULL DEFAULT 0,
      search_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS pm_references_document_idx ON pm_references(document_version_id);
    CREATE INDEX IF NOT EXISTS pm_references_search_trgm_idx ON pm_references USING GIN (search_text gin_trgm_ops);

    CREATE TABLE IF NOT EXISTS retrieval_chunks (
      id TEXT PRIMARY KEY,
      document_version_id TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
      source_kind TEXT NOT NULL CHECK (source_kind IN ('scripts', 'pm')),
      chunk_kind TEXT NOT NULL CHECK (chunk_kind IN ('script_entry', 'pm_page', 'pm_page_part')),
      script_entry_id TEXT REFERENCES script_entries(id) ON DELETE CASCADE,
      pm_reference_id TEXT REFERENCES pm_references(id) ON DELETE CASCADE,
      section_code TEXT NOT NULL,
      section_title TEXT NOT NULL,
      page_start INTEGER NOT NULL,
      page_end INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding vector(1536) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (
        (
          source_kind = 'scripts'
          AND chunk_kind = 'script_entry'
          AND script_entry_id IS NOT NULL
          AND pm_reference_id IS NULL
        )
        OR
        (
          source_kind = 'pm'
          AND chunk_kind IN ('pm_page', 'pm_page_part')
          AND pm_reference_id IS NOT NULL
          AND script_entry_id IS NULL
        )
      )
    );

    CREATE INDEX IF NOT EXISTS retrieval_chunks_document_idx ON retrieval_chunks(document_version_id);
    CREATE INDEX IF NOT EXISTS retrieval_chunks_source_kind_idx ON retrieval_chunks(source_kind, chunk_kind);
    CREATE INDEX IF NOT EXISTS retrieval_chunks_script_entry_idx ON retrieval_chunks(script_entry_id);
    CREATE INDEX IF NOT EXISTS retrieval_chunks_pm_reference_idx ON retrieval_chunks(pm_reference_id);

    CREATE UNIQUE INDEX IF NOT EXISTS retrieval_chunks_script_source_unique_idx
      ON retrieval_chunks(script_entry_id, chunk_kind, chunk_index)
      WHERE source_kind = 'scripts';

    CREATE UNIQUE INDEX IF NOT EXISTS retrieval_chunks_pm_source_unique_idx
      ON retrieval_chunks(pm_reference_id, chunk_kind, chunk_index)
      WHERE source_kind = 'pm';

    CREATE INDEX IF NOT EXISTS retrieval_chunks_embedding_hnsw_idx
      ON retrieval_chunks
      USING hnsw (embedding vector_cosine_ops);
  `);

  schemaReady = true;
}
