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
  `);

  schemaReady = true;
}
