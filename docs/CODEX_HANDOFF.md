# SD Agent IQ - Codex Handoff

## Project Goal

SD Agent IQ is a CGI-branded service desk assistant for IHSS support workflows. The intended users are service desk agents and supervisors who need fast, grounded access to caller scripts, procedural notes, steps, and PM reference material from the latest local Scripts and PM PDFs.

The application should help agents answer caller questions using approved source documents, preserve source attribution, and support supervisor-controlled document ingestion/versioning over time.

## Current Architecture

This repository is currently an npm workspace monorepo:

- Angular frontend in `apps/web`.
- Express API in `apps/api`.
- Shared TypeScript contracts in `packages/shared`.
- Local document folders under `documents/incoming` and `documents/archive`.
- Postgres service configured through Docker Compose using the `pgvector/pgvector:pg17` image.

Current implementation is a structured keyword/trigram retrieval system backed by Postgres. It is not yet a semantic/vector RAG implementation.

Planned architecture, not yet implemented, is to add embeddings, pgvector-backed semantic retrieval, hybrid ranking, and optionally LLM-grounded answer synthesis while preserving the existing structured response behavior.

## Current RAG Pipeline

The currently implemented flow is:

1. PDF discovery:
   - `apps/api/src/documents/document-files.ts` scans `documents/incoming`.
   - File kind is inferred from filename: Scripts PDFs contain `scripts`; PM PDFs contain ` pm ` or ` pm.`.
   - Document date is parsed from an `MMDDYYYY` filename segment.
   - Latest document is selected by parsed document date.

2. Scripts/PM parsing:
   - Scripts parsing is implemented in `apps/api/src/parsing/scripts_pdf_parser.py`, invoked by `script-pdf.parser.ts`.
   - PM parsing is implemented in `apps/api/src/parsing/pm_pdf_parser.py`, invoked by `pm-pdf.parser.ts`.
   - Python parsing uses `pdfplumber`.
   - Scripts produce structured scenario/script/notes entries.
   - PM parsing produces page-level references with section metadata, text excerpts, page number, and image counts.

3. Postgres ingestion:
   - `apps/api/src/ingestion/scripts-ingestion.service.ts` ingests latest Scripts PDF.
   - `apps/api/src/ingestion/pm-ingestion.service.ts` ingests latest PM PDF.
   - `apps/api/src/vector-db/schema.ts` creates `document_versions`, `script_entries`, and `pm_references`.
   - Existing rows for a document version are replaced during ingestion.
   - `/api/admin/documents/reindex` ingests both latest Scripts and latest PM PDFs.

4. Keyword/trigram retrieval:
   - `apps/api/src/vector-db/schema.ts` creates `pg_trgm` indexes for text search.
   - `searchScripts()` uses `ILIKE`, token matching, manual scoring, and latest indexed Scripts version filtering.
   - `searchPmReferences()` uses token matching against latest indexed PM references.

5. Chat response construction:
   - `apps/api/src/chat/chat.service.ts` builds the `ChatQueryResponse`.
   - Empty questions and no-match cases return deterministic fallback messages.
   - Short or ambiguous queries return `scenarioMatches` for user selection.
   - Selected scenario IDs bypass ambiguity and return the selected script entry.
   - `sayThisToCaller`, `notes`, `steps`, citations, and PM page references are assembled by code.

6. Citations and PM page references:
   - Script citations are generated from the matched script entry section/page.
   - PM references are returned as links to `/api/documents/latest/pm#page=N`.
   - The shared type name is `ReferenceScreenshot`, but the current implementation returns PDF page links, not generated screenshots.

Explicit current limitation: pgvector/vector retrieval, embedding generation/storage, and LLM answer generation are not implemented yet. The code currently creates the Postgres `vector` extension but does not store vectors or call embedding/LLM APIs.

## Repository Map

- `apps/api/src/app.ts` - Express app setup, middleware, error handling.
- `apps/api/src/routes` - Route registration and health route.
- `apps/api/src/auth` - Demo login endpoint.
- `apps/api/src/chat` - Chat routes and deterministic response construction.
- `apps/api/src/documents` - Local document discovery, admin document routes, latest PDF serving.
- `apps/api/src/parsing` - TypeScript parser wrappers and Python PDF parsers.
- `apps/api/src/ingestion` - Scripts and PM ingestion services.
- `apps/api/src/vector-db` - Postgres client, schema setup, script/PM repository and keyword retrieval.
- `apps/api/src/embeddings` - Placeholder module only.
- `apps/api/src/llm` - Placeholder module only.
- `apps/api/src/retrieval` - Placeholder module only.
- `apps/web/src/app/features/auth` - Login page.
- `apps/web/src/app/features/agent` - Agent chat workspace.
- `apps/web/src/app/features/supervisor` - Supervisor document status placeholder.
- `apps/web/src/app/core/api.service.ts` - Frontend API client.
- `packages/shared/src` - Shared auth, user, chat, and document contracts.
- `documents/incoming` - Local source PDF drop folder.
- `documents/archive` - Placeholder archive folder; archive behavior is not implemented.

## Implemented and Working

Implemented:

- Monorepo, Angular app, Express API, shared contracts.
- Demo auth.
- Health, auth, chat, and admin document endpoints.
- Local discovery of latest Scripts and PM PDFs.
- PDF parsing via Python/pdfplumber.
- Ingestion into Postgres structured tables.
- Keyword/trigram retrieval for Scripts and PM references.
- Deterministic chat response construction with ambiguity handling.
- PM reference links to source PDF pages.
- Supervisor page fetching document status.

Validation actually performed in this session:

- `git status --short --branch` showed a clean branch before this handoff was created: `main...origin/main`.
- `npm run typecheck` completed successfully before this handoff was created.

No automated unit/integration test suite was identified or run.

## Important Existing Behavior - Preserve

Future changes must preserve the current baseline unless the user explicitly approves replacement:

- Do not remove existing keyword/trigram retrieval; integrate semantic retrieval around it.
- Preserve `ChatQueryRequest` and `ChatQueryResponse` initially.
- Preserve deterministic empty-question and no-match responses.
- Preserve short/ambiguous query behavior that returns `scenarioMatches`.
- Preserve selected scenario behavior using `selectedScenarioId`.
- Preserve code-generated citations and PM page links.
- Preserve structured script output fields: `sayThisToCaller`, `notes`, `steps`, `referenceScreenshots`, `citations`.
- Preserve `/api/chat/query`, `/api/chat/recent`, `/api/chat/common`, `/api/admin/documents/status`, `/api/admin/documents/reindex`, and `/api/documents/latest/:kind`.
- Treat the repository as the baseline source of truth. Do not rewrite working behavior merely because a new architecture is being added.

## Architectural Decisions

Established by repository/current implementation:

- npm workspace monorepo.
- Angular frontend.
- Express API.
- Shared TypeScript contracts package.
- Local PDF drop-folder convention using `documents/incoming`.
- Local archive folder exists at `documents/archive`, but archive behavior is not implemented.
- Postgres is the persistence layer.
- Docker Compose uses `pgvector/pgvector:pg17`.
- PDF parsing is performed by Python scripts using `pdfplumber`, launched from Node.
- Document versions are represented in `document_versions`.
- Scripts and PM PDFs are separate document kinds: `scripts` and `pm`.
- Latest indexed document version is selected by document date and indexed time.
- Current chat response shape is structured and source-oriented.
- Ambiguous script matches are resolved by asking the user to select a scenario.

Explicitly approved by the user in this session:

- Create this handoff as persistent project context.
- Preserve current working implementation as the baseline.
- Do not implement the RAG plan until later instruction.

Not approved:

- Any change from deterministic script wording to LLM-rewritten caller wording.
- Any specific embedding model/dimension beyond the current env variable default.
- Any schema migration approach beyond the current `ensureSchema()` pattern.
- Any cleanup/archive/retention policy for old document versions.

## Proposed RAG Architecture

PROPOSED until approved.

Add semantic retrieval while preserving existing structured keyword behavior:

- Embeddings:
  - Embed script scenario text, full script entries, and PM text chunks.
  - Use `OPENAI_EMBEDDING_MODEL` from environment; current example value is `text-embedding-3-small`.

- pgvector:
  - Add a vector chunk table related to `document_versions`, `script_entries`, and `pm_references`.
  - Store content, metadata, embedding model, content hash, chunk index, source kind, page range, and vector.

- Chunking:
  - Scripts: one chunk per scenario/full script entry, with optional separate scenario-only chunks.
  - PM: page-based chunks, splitting long pages with overlap.

- Metadata:
  - Store document version, source kind, chunk kind, section code/title, page range, related script/PM IDs, chunk index, and embedding model.

- Vector retrieval:
  - Embed the user query.
  - Search latest indexed Scripts and PM chunks separately.
  - Join vector results back to authoritative structured rows.

- Hybrid retrieval:
  - Keep current keyword/trigram results.
  - Merge keyword and vector candidates.
  - Use exact scenario/title boosts and score margins to preserve ambiguity handling.

- LLM integration:
  - Introduce the LLM only after retrieval and ambiguity handling.
  - Give it retrieved script and PM context only.
  - Require grounded, cited output.
  - Fall back to deterministic script response if the LLM fails or produces unsupported output.
  - Keep citation/link generation code-driven.

## Open Decisions

- Decision needed: Should `sayThisToCaller` remain exact source script text?
  - Recommended option: Keep exact script text by default.
  - Alternative: Allow LLM to lightly rewrite caller wording.
  - Impact: Exact text is safer for compliance and preserves current behavior; rewriting may improve readability but risks unsupported wording.

- Decision needed: Which embedding model and dimension should be used?
  - Recommended option: Use existing `OPENAI_EMBEDDING_MODEL`, currently `text-embedding-3-small`, with its default dimensions.
  - Alternative: Approve a different or newer embedding model.
  - Impact: Model/dimension choice affects schema, cost, retrieval quality, and future migrations.

- Decision needed: Should schema evolution continue through `ensureSchema()` or use migrations?
  - Recommended option: For the prototype, continue `ensureSchema()` for the next small slice.
  - Alternative: Introduce a migration system before vector schema changes.
  - Impact: `ensureSchema()` is faster; migrations are safer for production/versioned database changes.

- Decision needed: When should LLM generation be introduced?
  - Recommended option: Add embeddings/vector/hybrid retrieval first, then add LLM synthesis behind fallback.
  - Alternative: Add LLM generation in the same slice as vector retrieval.
  - Impact: Separating retrieval from generation makes regressions easier to detect.

- Decision needed: How should old document versions be retained or archived?
  - Recommended option: Keep old indexed versions in Postgres for now; no deletion policy yet.
  - Alternative: Add cleanup/archive policy immediately.
  - Impact: Retention supports rollback/audit; cleanup reduces storage.

- Decision needed: Should admin status expose active Scripts and PM versions separately?
  - Recommended option: Add this later as a non-breaking API extension.
  - Alternative: Change status contract now.
  - Impact: Separate visibility is useful, but contract changes affect UI/API consumers.

- Decision needed: Should generated answers be labeled in the UI?
  - Recommended option: If LLM synthesis is enabled, label generated/synthesized answers.
  - Alternative: Keep UI unchanged.
  - Impact: Labeling improves transparency but requires frontend changes.

## Implementation Roadmap

Do not implement until the proposed architecture/open decisions are approved.

Phase 1 - Embedding client:

- Implement `apps/api/src/embeddings/index.ts`.
- Use existing env variable names.
- Test with a small mocked or real embedding request.
- Verify `npm run typecheck`.

Phase 2 - Chunk builders:

- Add pure chunk-building logic in `apps/api/src/chunking/index.ts` or adjacent module.
- Convert parsed script entries and PM references into embedding-ready chunks.
- Test with deterministic input/output checks.

Phase 3 - Vector schema:

- Extend `apps/api/src/vector-db/schema.ts` with retrieval chunk table and pgvector indexes.
- Verify schema creation against local Postgres.
- Confirm existing keyword tables and queries still work.

Phase 4 - Store embeddings during ingestion:

- Update ingestion flow to build chunks, call embeddings, and insert vector rows.
- Keep reindex idempotent for the same document version.
- Mark new versions indexed only after structured rows and vector rows are stored.

Phase 5 - Vector search:

- Add repository functions for vector search over latest Scripts and PM document versions.
- Return linked metadata and scores.
- Verify direct semantic queries against indexed PDFs.

Phase 6 - Hybrid retrieval:

- Implement orchestration in `apps/api/src/retrieval/index.ts`.
- Integrate into `apps/api/src/chat/chat.service.ts`.
- Preserve current response behavior for exact, empty, no-match, ambiguous, and selected-scenario flows.

Phase 7 - PM hybrid references:

- Combine keyword and vector PM results after script selection.
- Preserve existing PM page link response shape.

Phase 8 - LLM synthesis:

- Implement `apps/api/src/llm/index.ts` and prompts in `apps/api/src/prompts/index.ts`.
- Validate structured LLM output.
- Fall back to deterministic response on failure.

Phase 9 - Reliability/status hardening:

- Improve failed/processing status behavior.
- Preserve previous indexed version when new ingestion fails.

Phase 10 - Optional UI updates:

- Only after API behavior is stable.
- Consider generated-answer labeling and richer citation display.

## Known Issues / Incomplete Features

- pgvector/vector retrieval is not implemented.
- Embedding generation and storage are not implemented.
- LLM integration is not implemented.
- `apps/api/src/embeddings`, `apps/api/src/llm`, and `apps/api/src/retrieval` are placeholder modules.
- Upload endpoint returns `501 not_implemented`.
- Supervisor upload/indexing/version controls are placeholders.
- Archive behavior is not implemented despite `documents/archive`.
- PM references are page links, not screenshots, despite the `ReferenceScreenshot` type name.
- Current `DocumentStatusResponse.activeVersion` reports latest indexed Scripts only, not separate Scripts and PM active versions.
- No automated unit/integration tests were identified.

## Environment and Commands

Important commands:

- `npm install`
- `docker compose up -d`
- `npm run dev:api`
- `npm run dev:web`
- `npm run build:api`
- `npm run build:web`
- `npm run ingest:scripts`
- `npm run ingest:pm`
- `npm run typecheck`
- `npm run lint`

Environment variable names:

- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `DATABASE_URL`
- `API_PORT`
- `JWT_SECRET`
- `DOCUMENTS_INCOMING_PATH`
- `DOCUMENTS_ARCHIVE_PATH`
- `PDF_PYTHON_BIN`
- `DEMO_SUPERVISOR_EMAIL`
- `DEMO_SUPERVISOR_PASSWORD`
- `DEMO_AGENT_EMAIL`
- `DEMO_AGENT_PASSWORD`

Local services:

- Postgres runs through Docker Compose.
- The Compose image is `pgvector/pgvector:pg17`.
- API default port is controlled by `API_PORT`.
- Frontend is served through Angular CLI.

Do not write secrets, passwords, tokens, or credential-bearing connection strings into this handoff.

## Git Checkpoint

- Current branch before this handoff change: `main`.
- Current git status before this handoff change: clean, tracking `origin/main`.
- Latest relevant checkpoint commit: `dbf3203 Checkpoint RAG implementation before Codex session recovery`.
- That checkpoint represents the current structured RAG baseline: PDF parsing, ingestion, Postgres tables, keyword/trigram retrieval, deterministic chat response construction, and PM page links. It also includes placeholder embedding/LLM/retrieval modules.

This handoff file is intentionally uncommitted unless the user later asks to commit it.

## Next Task

After the user approves the proposed RAG architecture and resolves the open decisions, the next development task should be:

Implement Phase 1 and Phase 2 only: an embedding client plus deterministic chunk builders, with no changes yet to chat behavior. Validate with typecheck and focused chunk-builder tests or direct assertions.

## Instructions for Future Codex Sessions

1. Read this file before modifying code.
2. Read AGENTS.md if present.
3. Inspect git status and recent commits.
4. Treat the repository as the source of truth for implementation state.
5. Treat this handoff as the source of truth for project intent and prior decisions, but verify it against current code.
6. Do not replace working behavior merely because another design is preferred.
7. Clearly distinguish approved decisions from proposed ideas.
8. Before major architectural changes, explain the proposed change and get user approval.
9. Run appropriate validation after changes.
10. Update this handoff after completing a meaningful implementation milestone.
