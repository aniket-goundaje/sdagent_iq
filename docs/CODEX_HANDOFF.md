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

Current implementation is a structured keyword/trigram retrieval system backed by Postgres, with the first vector foundation slice and a standalone semantic retrieval evaluation service added. Semantic/vector retrieval is not yet wired into chat behavior.

Approved planned architecture is to add embeddings, pgvector-backed semantic retrieval, and hybrid ranking while preserving the existing structured response behavior. Chat LLM generation is explicitly out of scope for the first vector-retrieval slice.

Current project status as of August 16, 2026:

- Milestone 2 (Vector Foundation) is complete.
- Milestone 3 has begun in evaluation mode only.
- 908 embeddings were successfully generated and stored in `retrieval_chunks`.
- Semantic retrieval has been implemented and validated as a standalone service.
- The production application still uses keyword/trigram retrieval only.

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

4. Derived vector chunk indexing:
   - `apps/api/src/chunking/index.ts` builds deterministic retrieval chunks from parsed source rows.
   - Scripts use one derived chunk per `script_entries` row.
   - PM uses one page-oriented chunk per `pm_references` row, splitting only when the page text is too large.
   - `apps/api/src/embeddings/index.ts` implements a configurable OpenAI embeddings client using `OPENAI_EMBEDDING_MODEL`.
   - `apps/api/src/vector-db/schema.ts` creates `retrieval_chunks` with `embedding vector(1536)` and HNSW cosine index.
   - `apps/api/src/vector-db/script-repository.ts` stores/replaces retrieval chunks for only the document version being rebuilt.
   - `retrieval_chunks` is derived index data only; `script_entries` and `pm_references` remain authoritative.

5. Standalone semantic retrieval evaluation:
   - `apps/api/src/retrieval/index.ts` accepts a natural-language query, generates a query embedding, searches `retrieval_chunks` with pgvector cosine similarity, and resolves top Script and PM candidates back to source rows.
   - `apps/api/src/scripts/evaluate-semantic-retrieval.ts` compares semantic retrieval with the current keyword path on representative queries.
   - This is evaluation-only. The application does not use semantic retrieval yet.

6. Keyword/trigram retrieval:
   - `apps/api/src/vector-db/schema.ts` creates `pg_trgm` indexes for text search.
   - `searchScripts()` uses `ILIKE`, token matching, manual scoring, and latest indexed Scripts version filtering.
   - `searchPmReferences()` uses token matching against latest indexed PM references.

7. Chat response construction:
   - `apps/api/src/chat/chat.service.ts` builds the `ChatQueryResponse`.
   - Empty questions and no-match cases return deterministic fallback messages.
   - Short or ambiguous queries return `scenarioMatches` for user selection.
   - Selected scenario IDs bypass ambiguity and return the selected script entry.
   - `sayThisToCaller`, `notes`, `steps`, citations, and PM page references are assembled by code.

8. Citations and PM page references:
   - Script citations are generated from the matched script entry section/page.
   - PM references are returned as links to `/api/documents/latest/pm#page=N`.
   - The shared type name is `ReferenceScreenshot`, but the current implementation returns PDF page links, not generated screenshots.

Explicit current limitation: pgvector schema, embedding storage, and standalone semantic evaluation are implemented, but vector retrieval/hybrid ranking are not used by chat yet. Chat LLM generation is not implemented and must not be added in the first vector retrieval slice.

## Repository Map

- `apps/api/src/app.ts` - Express app setup, middleware, error handling.
- `apps/api/src/routes` - Route registration and health route.
- `apps/api/src/auth` - Demo login endpoint.
- `apps/api/src/chat` - Chat routes and deterministic response construction.
- `apps/api/src/documents` - Local document discovery, admin document routes, latest PDF serving.
- `apps/api/src/parsing` - TypeScript parser wrappers and Python PDF parsers.
- `apps/api/src/ingestion` - Scripts and PM ingestion services.
- `apps/api/src/vector-db` - Postgres client, schema setup, script/PM repository and keyword retrieval.
- `apps/api/src/embeddings` - Configurable OpenAI embedding client.
- `apps/api/src/llm` - Placeholder module only.
- `apps/api/src/retrieval` - Standalone semantic retrieval service for evaluation.
- `apps/api/src/chunking` - Deterministic retrieval chunk builders for Scripts and PM source rows.
- `apps/api/src/scripts/evaluate-semantic-retrieval.ts` - Standalone semantic vs keyword comparison runner.
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
- pgvector `retrieval_chunks` schema with HNSW cosine index.
- Deterministic Script and PM chunk builders.
- Embedding client for `text-embedding-3-small`/configured `OPENAI_EMBEDDING_MODEL`.
- Ingestion integration that derives chunks, generates embeddings, and stores vectors for the rebuilt document version.
- Standalone semantic retrieval service returning top Script/PM candidates with cosine similarity scores.
- Standalone semantic evaluation script comparing semantic results with the current keyword retrieval path.
- Deterministic chat response construction with ambiguity handling.
- PM reference links to source PDF pages.
- Supervisor page fetching document status.

Validation actually performed in this session:

- `git status --short --branch` showed a clean branch before this handoff was created: `main...origin/main`.
- `npm run typecheck` completed successfully before this handoff was created.
- During the first vector foundation slice, `npm run typecheck` and `npm run build:api` completed successfully.
- Local schema creation against Postgres completed successfully.
- Local schema inspection confirmed the `retrieval_chunks` columns and indexes.
- Local parse/chunk verification produced 718 Script chunks and 190 PM chunks from the incoming PDFs.
- A synthetic local insert/rollback verified the `retrieval_chunks` vector column and constraints without leaving test rows.
- Real embeddings were generated and stored: 908 total `retrieval_chunks`, all with `vector_dims(embedding) = 1536`.
- Standalone semantic retrieval evaluation was run for:
  - `Provider forgot portal password`
  - `Direct deposit`
  - `Paid sick leave`
  - `Timesheet payment search`
  - `ESP password`
- Observed evaluation results:
  - Semantic retrieval clearly outperformed keyword retrieval on paraphrased portal-password queries.
  - Keyword retrieval outperformed semantic retrieval on some exact phrase queries such as `Paid sick leave`.
  - Semantic retrieval for `Direct deposit` and `Paid sick leave` exposed source-data quality issues where fragmented Script rows with weak content can rank too highly.
  - `Timesheet payment search` produced strong semantic matches for both Script and PM content.
  - `ESP password` produced relevant semantic matches, but exact keyword retrieval still surfaced the most direct forgot-password Script row first.

No automated unit/integration test suite was identified or run.

Files changed in the first vector foundation slice:

- `apps/api/src/vector-db/schema.ts` - added `retrieval_chunks` table and indexes.
- `apps/api/src/embeddings/index.ts` - implemented configurable OpenAI embedding client.
- `apps/api/src/chunking/index.ts` - implemented deterministic Script and PM chunk builders.
- `apps/api/src/vector-db/script-repository.ts` - added retrieval chunk replacement/storage.
- `apps/api/src/ingestion/scripts-ingestion.service.ts` - derives, embeds, and stores Script chunks during ingestion.
- `apps/api/src/ingestion/pm-ingestion.service.ts` - derives, embeds, and stores PM chunks during ingestion.
- `docs/CODEX_HANDOFF.md` - recorded implementation status, validation, and remaining work.

Files changed in the standalone semantic retrieval slice:

- `apps/api/src/retrieval/index.ts` - implemented standalone semantic retrieval service.
- `apps/api/src/scripts/evaluate-semantic-retrieval.ts` - implemented semantic vs keyword evaluation runner.
- `apps/api/package.json` - added semantic evaluation script command.
- `docs/CODEX_HANDOFF.md` - recorded semantic retrieval milestone and evaluation results.

## Important Existing Behavior - Preserve

Future changes must preserve the current baseline unless the user explicitly approves replacement:

- Do not remove existing keyword/trigram retrieval; integrate semantic retrieval around it.
- Preserve `ChatQueryRequest` and `ChatQueryResponse` initially.
- Do not change `chat.service.ts` or wire semantic retrieval into the live chat path until evaluation results are explicitly approved.
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
- `retrieval_chunks` is derived search/index data only.
- `script_entries` and `pm_references` remain authoritative for agent-visible content and source references.
- Semantic retrieval must be evaluated independently before any hybrid integration into chat.
- Keyword retrieval is still the current production retrieval path.
- Latest indexed document version is selected by document date and indexed time.
- Current chat response shape is structured and source-oriented.
- Ambiguous script matches are resolved by asking the user to select a scenario.

Explicitly approved by the user in this session:

- Create this handoff as persistent project context.
- Preserve current working implementation as the baseline.
- Do not implement the RAG plan until later instruction.
- `sayThisToCaller` must remain exact source script text. The LLM must not rewrite or paraphrase it.
- For the first vector implementation, use `text-embedding-3-small` with 1536 dimensions.
- Keep embedding implementation configurable so models can change later.
- Use one deterministic derived chunk per Script entry for the first vector implementation.
- Keep PM embeddings page-oriented and split only when a page is too large for embedding input.
- Continue using `ensureSchema()` for now. Do not introduce a migration framework in the first vector slice.
- Keep historical document versions for now. Do not implement archive/cleanup policy yet.
- Do not use the chat LLM in the first vector-retrieval slice. First prove semantic/hybrid retrieval independently.
- Admin status should distinguish active Scripts and PM document versions.
- The UI should distinguish exact source/script wording from any future synthesized/generated answer text.
- Build a semantic retrieval service that can be evaluated independently before integration.
- Semantic retrieval outperforms keyword retrieval for paraphrased queries.
- Keyword retrieval remains stronger for some exact phrase queries.
- Low-quality semantic matches are caused by parser-generated fragmented Script rows.
- Recommended next step before hybrid retrieval: filter low-information Script rows during chunk generation only.
- Do not modify parser output or authoritative `script_entries` yet.

Still not approved:

- Any change from deterministic script wording to LLM-rewritten caller wording.
- Any chat LLM generation in the first vector-retrieval slice.
- Any cleanup/archive/retention policy for old document versions.
- Any migration framework in the first vector-retrieval slice.

## Proposed RAG Architecture

PROPOSED implementation shape. The high-level direction of semantic/vector retrieval plus hybrid ranking is approved, but the exact code changes still require approval before implementation.

Add semantic retrieval while preserving existing structured keyword behavior:

- Embeddings:
  - Embed script scenario text, full script entries, and PM text chunks.
  - APPROVED for first vector implementation: use `text-embedding-3-small` with 1536 dimensions.
  - Keep model configuration driven by `OPENAI_EMBEDDING_MODEL` so it can change later.

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
  - APPROVED: do not use chat LLM generation in the first vector-retrieval slice.
  - Future LLM synthesis, if later approved, must happen only after retrieval and ambiguity handling.
  - Give it retrieved script and PM context only.
  - Require grounded, cited output.
  - Fall back to deterministic script response if the LLM fails or produces unsupported output.
  - Keep citation/link generation code-driven.
  - APPROVED: `sayThisToCaller` must remain exact source script text and must not be rewritten or paraphrased by the LLM.

## Open Decisions

- Decision needed: Exact hybrid scoring formula and thresholds.
  - Recommended option: Start simple with keyword score, vector similarity, exact-title/scenario boosts, and score-margin ambiguity checks.
  - Alternatives: Reciprocal rank fusion, learned weights, or vector-first ranking.
  - Impact: Scoring determines whether semantic retrieval improves recall without breaking deterministic exact-match behavior.

- Decision needed: Exact retrieval chunk table name and deterministic ID format.
  - Recommended option: Use a dedicated `retrieval_chunks` table with IDs derived from document version, source kind, related row ID, chunk kind, chunk index, and content hash.
  - Alternatives: Separate script/PM vector tables or embedding columns on existing tables.
  - Impact: A dedicated chunk table keeps vector retrieval flexible and preserves existing structured tables.

- Decision needed: Whether to add focused automated tests in the first vector slice.
  - Recommended option: Add lightweight tests or direct assertions for chunk builders and hybrid ranking if the repo test setup supports it without new dependencies.
  - Alternatives: Use typecheck plus manual ingestion/query verification for this slice.
  - Impact: Tests reduce regression risk, but the current repo does not appear to have an established test framework.

- Decision needed: Whether to clean up fragmented Script source rows before hybrid retrieval.
  - Recommended option: Filter low-information Script rows during chunk generation only before hybrid integration.
  - Alternatives: Parser cleanup first, or compensate purely in ranking logic.
  - Impact: Fragmented rows are already affecting semantic match quality for some queries such as `Direct deposit` and `Paid sick leave`, but authoritative `script_entries` should remain unchanged for now.

## Implementation Roadmap

Do not implement until the user approves the first implementation slice.

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

Future Phase - LLM synthesis:

- Do not start in the first vector-retrieval slice.
- Implement `apps/api/src/llm/index.ts` and prompts in `apps/api/src/prompts/index.ts`.
- Validate structured LLM output.
- Fall back to deterministic response on failure.
- Preserve exact source script text in `sayThisToCaller`.

Phase 9 - Reliability/status hardening:

- Improve failed/processing status behavior.
- Preserve previous indexed version when new ingestion fails.

Phase 10 - Optional UI updates:

- Only after API behavior is stable.
- APPROVED direction: distinguish exact source/script wording from any future synthesized/generated answer text.
- Consider generated-answer labeling and richer citation display when LLM synthesis is later approved.

## Known Issues / Incomplete Features

- Semantic/vector retrieval is implemented only as a standalone evaluation path, not in live chat.
- Embedding generation and storage are implemented in the ingestion path and have been validated with real stored embeddings.
- LLM integration is not implemented.
- Chat LLM generation is intentionally out of scope for the first vector-retrieval slice.
- `apps/api/src/llm` is still a placeholder module.
- Some parsed Script source rows appear fragmented or low-information and can produce weak semantic matches.
- No semantic-index filtering has been applied yet, so parser-generated low-information Script rows are still embedded.
- Upload endpoint returns `501 not_implemented`.
- Supervisor upload/indexing/version controls are placeholders.
- Archive behavior is not implemented despite `documents/archive`.
- PM references are page links, not screenshots, despite the `ReferenceScreenshot` type name.
- Current `DocumentStatusResponse.activeVersion` reports latest indexed Scripts only, not separate Scripts and PM active versions.
- Admin status has been approved to distinguish active Scripts and PM document versions, but this is not implemented yet.
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

Implement semantic-index filtering for low-information Script rows, regenerate Script embeddings, rerun semantic evaluation, and compare before/after results before beginning hybrid retrieval.

## Today Summary

- Milestone 2 (Vector Foundation) was completed successfully.
- The environment-loading issue was fixed so workspace scripts consistently load the repository root `.env`.
- Real embeddings were generated successfully using the configured `OPENAI_API_KEY`.
- 908 total `retrieval_chunks` were stored and validated in Postgres.
- All stored embeddings were confirmed to have `vector_dims(embedding) = 1536`.
- Semantic retrieval was implemented as a standalone evaluation path only.
- The live application remained unchanged and continues to use keyword/trigram retrieval.
- Semantic retrieval performed better than keyword retrieval for paraphrased queries such as portal-password variants.
- Keyword retrieval remained stronger for some exact phrase queries such as `Paid sick leave`.
- The main retrieval-quality issue is parser-generated fragmented Script rows; the next step is to filter low-information Script rows during chunk generation only, without changing parser output or authoritative `script_entries`.

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
