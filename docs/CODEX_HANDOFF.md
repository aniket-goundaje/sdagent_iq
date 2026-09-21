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

Current implementation is a structured keyword/trigram retrieval system backed by Postgres, with the first vector foundation slice, a standalone semantic retrieval evaluation service, and a simple hybrid retrieval pipeline added. The chat flow can now use hybrid retrieval by default and can fall back to keyword-only retrieval through configuration.

Approved planned architecture is to add embeddings, pgvector-backed semantic retrieval, and hybrid ranking while preserving the existing structured response behavior. Chat LLM generation is explicitly out of scope for the first vector-retrieval slice.

Current project status as of August 29, 2026:

- Milestone 2 (Vector Foundation) is complete.
- Milestone 3 has begun in evaluation mode only.
- 908 embeddings were successfully generated and stored in `retrieval_chunks`.
- Semantic retrieval has been implemented and validated as a standalone service.
- Semantic-index filtering for low-information Script rows has been implemented in chunk generation.
- Local chunk validation shows Script semantic chunks decreased from 718 to 580, filtering out 138 low-information rows before embedding.
- The production application now uses hybrid retrieval in chat, with a keyword-only fallback mode available through `CHAT_RETRIEVAL_MODE=keyword`.
- UI Sprint 1 has started with the agent workspace only: the center answer area is wider, side rails are sticky, the composer is more chat-like, and the answer hierarchy is more prominent without changing behavior.
- UI Sprint 2 tightened the agent answer rendering so `Say this to caller` uses natural paragraph flow again, and sidebar-driven answers now scroll to the rendered response row after Angular stabilizes.
- UI Sprint 3 focuses on launch polish for the agent workspace: the composer now behaves like a chat input, recent and usually asked questions show an immediate loading state, matching question cards feel interactive, and lightweight feedback is captured locally below completed answers.
- UI Sprint 4 further sharpened the visual hierarchy so the page feels closer to an enterprise SaaS product: the center lane, answer card, composer, references, and feedback now have stronger contrast, softer borders, and more consistent elevation.
- UI Sprint 5 gives the composer the strongest visual emphasis on the page, renders Notes as comfortable wrapped reading content, and further reduces the flat white-card feel without changing workflows.
- UI Sprint 6 finalizes the visual polish: Notes now render as readable bullet items, the composer feels more prominent, the Ask button stands out as the primary action, and the page surfaces are even softer and cleaner.
- UI Sprint 6 also corrected the remaining Notes wrapping issue by removing the narrow list gutter so the notes can use the full content width like the main answer.
- Scripts parser notes normalization now merges PDF visual line wraps into logical note lines before rows enter `script_entries`.
- Scripts parser notes normalization now treats `Note:`, bullet markers, numbered items, and `Step` starts as logical note boundaries so independent notes are not merged together.
- Agent Workspace now presents Notes as compact checklist-style bullets and strips the source `Note:` prefix only at render time.
- UI Sprint 7 improved Agent Workspace hierarchy with local recent-question updates, stronger composer/Ask emphasis, and subtler surface depth without changing backend behavior.
- Supervisor Workspace now reuses the complete Agent Workspace experience and adds supervisor-only system status, active document, document-count, and staged document-management panels.
- The visual hierarchy refresh adds semantic section surfaces: teal for `Say this to caller`, warm yellow for Notes, blue for References, lavender for Feedback, stronger composer emphasis, and subtly distinct Recent/Usually Asked side rails.
- The enterprise design-system refresh deepens the neutral page/surface hierarchy, replaces textual supervisor status values with colored badges, and restyles staged document-management controls as enterprise primary/secondary actions while leaving workflows unchanged.
- The enterprise design-system refresh was refined to move further away from the white-card prototype look: page, workspace, rails, answer cards, composer, status chips, and document-management actions now use layered neutral surfaces, semantic tints, and elevation instead of colored borders.
- The final enterprise polish pass makes the center workspace more visually dominant, softens supporting side rails, gives matching script questions a stronger selectable-result treatment, and improves vertical rhythm between answer sections without changing workflows.
- The final composer polish makes the chat composer the strongest interaction point with a richer command-center surface, stronger focus glow, natural-language example placeholder, and a higher-contrast purple-to-magenta Ask action with hover, pressed, and loading states.
- The composer brightness follow-up increases the default composer contrast so the input shell and disabled Ask action remain visually discoverable before the agent starts typing.
- The final product design pass reduces decorative color, shifts the app to a warmer neutral surface system, keeps semantic color for approved answers/references/primary actions, and simplifies the supervisor sidebar into business-facing document status.
- A reusable chat presentation formatting layer now adds `presentationBlocks` to chat responses. The first slice detects mailing-address blocks from `scriptText` and lets Angular render them as readable address cards while preserving the original `sayThisToCaller` string and retrieval behavior.
- The final demo-readiness pass tightens the business-facing experience without changing retrieval: the empty state now gives executive-friendly starter prompts, matching-question copy explains the selection task, supervisor admin language is framed as Knowledge Management, upload/reindex controls behave as a complete UI workflow, the no-match copy is clearer, and composer/Ask spacing was adjusted to prevent icon/text overlap.
- The supervisor Knowledge Upload workflow now opens native PDF pickers, shows selected filenames with `Ready to Index` status, switches the primary action between `Reindex Knowledge` and `Index Knowledge`, and presents active knowledge with business-friendly document names, version, indexed date, and indexed status without exposing internal IDs.
- The supervisor Knowledge Center workflow was refined to remove `Reindex` and implementation-oriented language from the business UI. Supervisors now choose Scripts and Procedures Manual PDFs, then use one `Update Knowledge` action with business-friendly progress messages and a success confirmation.

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
   - Hybrid retrieval is the default chat path, with keyword-only fallback available through `CHAT_RETRIEVAL_MODE=keyword`.
   - `sayThisToCaller`, `notes`, `steps`, citations, and PM page references are assembled by code.

8. Citations and PM page references:
   - Script citations are generated from the matched script entry section/page.
   - PM references are returned as links to `/api/documents/latest/pm#page=N`.
   - The shared type name is `ReferenceScreenshot`, but the current implementation returns PDF page links, not generated screenshots.

9. Frontend API routing:
   - `apps/web/src/app/core/api.service.ts` now targets `/api` so the browser talks to the Angular dev server origin.
   - `angular.json` routes `/api` through `apps/web/proxy.conf.json` to the local Express API on port 3000.

Explicit current limitation: chat LLM generation is still out of scope. The live chat flow already uses the hybrid retrieval pipeline, with keyword-only fallback available through configuration.

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
- Simple hybrid retrieval in chat, with a configuration fallback to keyword-only retrieval.

Validation actually performed in this session:

- `git status --short --branch` showed a clean branch before this handoff was created: `main...origin/main`.
- `npm run typecheck` completed successfully before this handoff was created.
- During the first vector foundation slice, `npm run typecheck` and `npm run build:api` completed successfully.
- Local schema creation against Postgres completed successfully.
- Local schema inspection confirmed the `retrieval_chunks` columns and indexes.
- Local parse/chunk verification produced 718 Script chunks and 190 PM chunks from the incoming PDFs.
- On August 29, 2026, local chunk validation after Script filtering produced 580 Script chunks from the same 718 parsed Script entries, filtering out 138 low-information rows before embedding.
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
- On August 29, 2026, `npm run build:api` and `npm run typecheck` completed successfully after adding Script semantic-index filtering.
- On August 29, 2026, a local attempt to rerun `npm run ingest:scripts` from Codex was blocked by sandbox permissions before Postgres/embedding regeneration could complete, so semantic evaluation has not yet been rerun with the filtered Script chunk set from this session.
- On August 29, 2026, improved ingestion logging exposed the actual failure as `AggregateError [EPERM]` from `pg-pool` during `ensureSchema()`, which indicates the process could not open the local Postgres connection in this sandbox.
- On August 29, 2026, a hybrid retrieval pipeline was integrated into chat with a keyword-only fallback mode controlled by `CHAT_RETRIEVAL_MODE`.
- On August 29, 2026, `npm run build:api` and `npm run typecheck` completed successfully after the hybrid chat integration.
- On August 29, 2026, the agent workspace UI was polished for Sprint 1 and the live Angular dev server rebuilt successfully with the updated layout.
- On August 29, 2026, the agent workspace UI Sprint 2 fixed the answer text width problem, added render-stable scrolling for sidebar-driven questions, and kept PM reference cards compact.
- On August 29, 2026, the agent workspace UI Sprint 3 polished the chat composer, added immediate loading placeholders and stable conversation flow, and introduced local feedback capture under completed answers.
- On August 29, 2026, the agent workspace UI Sprint 4 tuned the visual hierarchy, card contrast, button prominence, and feedback presentation without changing workflows.
- On August 29, 2026, the agent workspace UI Sprint 5 strengthened the composer CTA, improved Notes readability, and refined the hierarchy without adding new colors or layout changes.
- On August 29, 2026, the agent workspace UI Sprint 6 finalized the visual polish by improving Notes wrapping, composer emphasis, and primary-action prominence.
- On August 29, 2026, the agent workspace UI Sprint 6 also removed the narrow Notes gutter so the notes read as full-width content rather than a compressed column.
- On August 31, 2026, Scripts ingestion was rerun after parser-level Notes normalization; the `Where do I send my timesheet?` response now returns four logical notes instead of eight visual PDF fragments.
- On September 1, 2026, the Notes normalization was refined to distinguish PDF visual wrapping from logical note boundaries. Parser-level validation confirmed `Note:`, bullets, numbered items, `Step`, and blank-line paragraph breaks are preserved while wrapped continuation lines are still joined.
- On September 1, 2026, Agent Workspace Notes presentation was updated to render API notes as compact checklist bullets, removing only a leading `Note:` prefix for display while preserving the API contract and retrieval behavior.
- On September 1, 2026, UI Sprint 7 validation confirmed a newly submitted question is added locally to Recent Questions at the top of the list, deduped, and capped, while `npm run typecheck` still passes.
- On September 13, 2026, the Supervisor Workspace placeholder was removed from routing and replaced with the Agent Workspace plus supervisor-only admin panels. Validation confirmed `/supervisor` preserves ask/recent/usually-asked/answer/notes/reference/feedback behavior, shows retrieval mode, embedding model, index status, active Scripts/PM versions, entry/reference counts, retrieval chunk counts, staged upload/reindex controls, and logout navigation back to login.
- On September 13, 2026, the visual hierarchy refresh was applied without layout or functionality changes. `npm run typecheck` passed and browser validation confirmed the supervisor workspace still returns answers with Notes, References, and Feedback visible.
- On September 13, 2026, the enterprise design-system refresh was applied without layout or functionality changes. `npm run typecheck` passed and browser validation confirmed the supervisor shell shows status badges/document actions and the chat answer still renders correctly.
- On September 13, 2026, the enterprise design-system refinement was applied without workflow or backend changes. `npm run typecheck` passed, the Angular dev server rebuilt successfully, and browser validation on `/supervisor` confirmed status chips, staged document actions, semantic answer surfaces, checklist Notes, PM References, Feedback, and the primary composer still render correctly.
- On September 20, 2026, final enterprise polish was applied without functionality changes. `npm run typecheck` passed, the Angular dev server rebuilt successfully, and browser validation on `/supervisor` confirmed the center workspace, matching-question selection state, side rails, and supervisor panels still render correctly.
- On September 20, 2026, final composer polish was applied without workflow changes. `npm run typecheck` passed, the Angular dev server rebuilt successfully, and browser validation on `/supervisor` confirmed the composer normal/focus/ready states, Ask button accessibility text, and a submitted ESP password query still work correctly.
- On September 20, 2026, the composer brightness follow-up was applied without functionality changes. `npm run typecheck` passed, the Angular dev server rebuilt successfully, and browser validation confirmed default and typed composer states render with stronger contrast.
- On September 20, 2026, the final product design pass was applied without backend or workflow changes. `npm run typecheck` passed, the Angular dev server rebuilt successfully, and browser validation on `/supervisor` confirmed the simplified supervisor panel and matching-question flow still render correctly.
- On September 20, 2026, the presentation formatting layer was added for address blocks without changing retrieval. `npm run typecheck` and `npm run build:api` passed, the API was restarted, and local validation confirmed `Where do I send my timesheet?` returns four `address` presentation blocks while the UI renders those addresses as separate readable cards.
- On September 20, 2026, the final demo-readiness polish was applied without changing retrieval, hybrid retrieval, embeddings, or workflows. `npm run typecheck` and `npm run build:api` passed, a read-only browser/API validation confirmed the Angular app is responding on `http://127.0.0.1:4301/`, and screenshots were captured for the empty state, matching-procedure state, and structured answer state.
- On September 20, 2026, the Supervisor Knowledge Upload workflow was completed at the UI layer without backend, retrieval, or API contract changes. `npm run typecheck` passed after adding native PDF inputs, selected-file display, `Ready to Index` status, business-friendly active document labels, and an active `Index/Reindex Knowledge` action. A browser render check confirmed the upload controls render without `Coming Soon`; automated file selection was blocked by the browser-control environment. `npm run build:web` was attempted twice but the Angular/esbuild service exited with code 134 before producing a normal application diagnostic.
- On September 20, 2026, the Supervisor Knowledge Center final product pass removed `Reindex`, `Ready to Index`, `Coming Soon`, and technical implementation language from the supervisor UI. `npm run typecheck` passed, source scan confirmed the removed labels are not present in the supervisor component, and browser validation captured the business-facing Knowledge Center render. Automated native file selection remained blocked by the browser-control environment.
- On August 29, 2026, live read-only comparison probes showed:
  - `What is paid sick leave?` still returns the exact caller script and citations.
  - `provider forgot portal password` now resolves through the hybrid path to the password-reset script instead of returning no match.
  - `Direct deposit` still prompts for scenario selection.
  - `Where do I send my timesheet?` still returns the exact caller script and citations.
- On August 29, 2026, the Angular dev server was restarted on `http://127.0.0.1:4301/` with an API proxy in place, and `POST /api/auth/login` returned `200 OK` for both demo accounts through the web origin.
- On August 29, 2026, `npm run typecheck` completed successfully after the login proxy change.

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

Files changed in the Script semantic-index filtering slice:

- `apps/api/src/chunking/index.ts` - added conservative filtering for placeholder/header rows and low-information scenario-only Script fragments before embedding.
- `docs/CODEX_HANDOFF.md` - recorded the filtering change, local validation, and remaining rerun work.

Files changed in the hybrid retrieval slice:

- `apps/api/src/chat/chat.service.ts` - switched chat retrieval orchestration to hybrid by default and added a keyword-only fallback mode.
- `apps/api/src/config/env.ts` - added `CHAT_RETRIEVAL_MODE` to control chat retrieval mode.
- `apps/api/src/retrieval/hybrid.ts` - implemented the simple hybrid merge and scoring layer for Scripts and PM references.
- `docs/CODEX_HANDOFF.md` - recorded the hybrid milestone, validation, and fallback mode.

Files changed in UI Sprint 3:

- `apps/web/src/app/features/agent/agent-workspace.component.ts` - added Enter-to-send handling, immediate assistant placeholders, stable scrolling, and local feedback persistence.
- `apps/web/src/app/features/agent/agent-workspace.component.html` - added the modern composer structure, pending-state placeholders, interactive scenario cards, and feedback controls.
- `apps/web/src/app/features/agent/agent-workspace.component.scss` - polished the composer, question cards, button states, and feedback panel styling.
- `docs/CODEX_HANDOFF.md` - recorded the UI Sprint 3 milestone and validation notes.

Files changed in UI Sprint 4:

- `apps/web/src/app/features/agent/agent-workspace.component.scss` - deepened the page hierarchy, improved surface contrast, strengthened the Ask button, and refined the answer and feedback presentation.
- `docs/CODEX_HANDOFF.md` - recorded the UI Sprint 4 milestone and validation notes.

Files changed in UI Sprint 5:

- `apps/web/src/app/features/agent/agent-workspace.component.html` - rendered Notes as wrapped reading content instead of a narrow bullet list.
- `apps/web/src/app/features/agent/agent-workspace.component.scss` - strengthened the composer CTA, improved Notes readability, and tuned section hierarchy and surfaces.
- `docs/CODEX_HANDOFF.md` - recorded the UI Sprint 5 milestone and validation notes.

Files changed in UI Sprint 6:

- `apps/web/src/app/features/agent/agent-workspace.component.html` - rendered Notes as readable bullet items and added a small composer icon cue.
- `apps/web/src/app/features/agent/agent-workspace.component.scss` - strengthened the composer emphasis, improved Notes wrapping and spacing, and reduced the flat white-card feel.
- `docs/CODEX_HANDOFF.md` - recorded the UI Sprint 6 milestone and validation notes.

Files changed in parser Notes normalization:

- `apps/api/src/parsing/scripts_pdf_parser.py` - added/refined parser-level Notes normalization that merges wrapped PDF lines while preserving `Note:`, bullet/list starts, numbered items, `Step` starts, and paragraph breaks as logical boundaries.
- `docs/CODEX_HANDOFF.md` - recorded the parser normalization milestone and validation notes.

Files changed in Notes presentation polish:

- `apps/web/src/app/features/agent/agent-workspace.component.html` - renders Notes as a semantic compact bullet list.
- `apps/web/src/app/features/agent/agent-workspace.component.ts` - strips only a leading `Note:` prefix at display time.
- `apps/web/src/app/features/agent/agent-workspace.component.scss` - styles Notes bullets for compact checklist readability.
- `docs/CODEX_HANDOFF.md` - recorded the UI-only Notes presentation milestone.

Files changed in UI Sprint 7:

- `apps/web/src/app/features/agent/agent-workspace.component.ts` - adds newly asked questions to the local Recent Questions rail, most recent first, with dedupe and an eight-item cap.
- `apps/web/src/app/features/agent/agent-workspace.component.scss` - strengthens composer and Ask button emphasis, softens page/card surfaces, and adds clearer visual depth across answer sections.
- `docs/CODEX_HANDOFF.md` - recorded the UI Sprint 7 milestone and validation notes.

Files changed in Supervisor Workspace redesign:

- `apps/web/src/app/app.routes.ts` - routes `/supervisor` to the shared Agent Workspace.
- `apps/web/src/app/core/session.service.ts` - stores the current demo user for header display and logout.
- `apps/web/src/app/core/api.service.ts` - adds a typed health call for supervisor system metadata.
- `apps/web/src/app/features/auth/login-page.component.ts` - saves the login response in the frontend session store.
- `apps/web/src/app/features/agent/agent-workspace.component.html` - adds the application header and supervisor-only admin sections while preserving the agent chat flow.
- `apps/web/src/app/features/agent/agent-workspace.component.ts` - adds role-aware display helpers, logout, health/status loading, and supervisor document helpers.
- `apps/web/src/app/features/agent/agent-workspace.component.scss` - styles the application header and supervisor admin panels to match the agent workspace.
- `apps/web/src/app/features/supervisor/*` - removed the old placeholder supervisor component files.
- `packages/shared/src/documents/document.types.ts` - extends document status metadata with optional active versions, indexed date, and counts.
- `apps/api/src/vector-db/script-repository.ts` - includes read-only supervisor document stats in the existing status endpoint.
- `apps/api/src/documents/admin.routes.ts` - includes `indexedAt: null` for discovered, not-yet-indexed documents.
- `docs/CODEX_HANDOFF.md` - recorded the Supervisor Workspace redesign milestone and validation notes.

Files changed in visual hierarchy refresh:

- `apps/web/src/app/features/agent/agent-workspace.component.html` - adds semantic modifier classes for Notes, Steps, and References sections.
- `apps/web/src/app/features/agent/agent-workspace.component.scss` - applies semantic section surfaces, side-rail tinting, stronger composer focus/elevation, and higher-contrast Ask button states.
- `docs/CODEX_HANDOFF.md` - recorded the visual hierarchy refresh and validation notes.

Files changed in enterprise design-system refresh:

- `apps/web/src/app/features/agent/agent-workspace.component.html` - renders supervisor system values as status badges and assigns primary/secondary styles to staged document actions.
- `apps/web/src/app/features/agent/agent-workspace.component.ts` - adds a display label helper for index status.
- `apps/web/src/app/features/agent/agent-workspace.component.scss` - deepens neutral surfaces, card elevation, composer focus treatment, Ask button contrast, status badges, and document-management button styling.
- `docs/CODEX_HANDOFF.md` - recorded the enterprise design-system refresh and validation notes.

Files changed in enterprise design-system refinement:

- `apps/web/src/app/features/agent/agent-workspace.component.scss` - further separates page/workspace/rail/card surfaces, reduces reliance on colored borders, maps Hybrid/Embedding/Indexed badges to semantic chip colors, and makes staged document-management actions read as enterprise cards.
- `docs/CODEX_HANDOFF.md` - recorded the refinement and validation notes.

Files changed in final enterprise polish:

- `apps/web/src/app/features/agent/agent-workspace.component.scss` - strengthens center workspace elevation/brightness, softens side rails, increases section rhythm, and styles matching script questions as selectable search results.
- `docs/CODEX_HANDOFF.md` - recorded the final enterprise polish and validation notes.

Files changed in final composer polish:

- `apps/web/src/app/features/agent/agent-workspace.component.html` - updates the composer placeholder and adds presentational Ask button label/icon elements.
- `apps/web/src/app/features/agent/agent-workspace.component.scss` - strengthens composer elevation, surface, border, focus glow, Ask button gradient, hover/pressed states, and loading-state styling.
- `docs/CODEX_HANDOFF.md` - recorded the final composer polish and validation notes.

Files changed in composer brightness follow-up:

- `apps/web/src/app/features/agent/agent-workspace.component.scss` - increases composer shell saturation, input border contrast, default Ask button visibility, and placeholder contrast.
- `docs/CODEX_HANDOFF.md` - recorded the brightness follow-up and validation notes.

Files changed in final product design pass:

- `apps/web/src/app/features/agent/agent-workspace.component.html` - removes technical supervisor status fields, simplifies active document metadata, and adds restrained visual icons to document/admin controls.
- `apps/web/src/app/features/agent/agent-workspace.component.scss` - shifts to a warmer neutral surface hierarchy, reduces non-semantic section color, calms navigation surfaces, keeps approved-answer/reference/primary-action color semantics, and improves button/icon proportions.
- `docs/CODEX_HANDOFF.md` - recorded the final product design pass and validation notes.

Files changed in presentation formatting layer:

- `packages/shared/src/chat/chat.types.ts` - adds reusable `ScriptPresentationBlock` and `presentationBlocks` to `ChatQueryResponse`.
- `apps/api/src/chat/presentation-formatter.ts` - adds the first presentation formatter slice with conservative mailing-address detection.
- `apps/api/src/chat/chat.service.ts` - includes formatted presentation blocks in all chat responses while preserving `sayThisToCaller`.
- `apps/web/src/app/features/agent/agent-workspace.component.html` - renders presentation blocks returned by the API.
- `apps/web/src/app/features/agent/agent-workspace.component.scss` - styles address blocks inside `Say this to caller`.
- `apps/web/src/app/features/agent/agent-workspace.component.ts` - includes presentation blocks in the local error fallback response.
- `docs/CODEX_HANDOFF.md` - recorded the presentation formatting layer and validation notes.

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
- Conservative semantic-index filtering is now implemented in chunk generation, but the filtered Script embeddings and standalone semantic evaluation have not yet been regenerated in this session.
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

Proceed with user testing on the hybrid default path. Use `CHAT_RETRIEVAL_MODE=keyword` only if a quick fallback to the previous behavior is needed during testing.

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
- The main retrieval-quality issue is parser-generated fragmented Script rows.
- On August 29, 2026, low-information Script-row filtering was added in chunk generation only, without changing parser output or authoritative `script_entries`.
- That filter reduced the Script semantic chunk set from 718 to 580 in local validation, removing 138 low-information rows from future embedding work.
- The hybrid retrieval path is now the default chat behavior, with keyword-only fallback available through configuration.
- The remaining risk is tuning hybrid thresholds only if user testing exposes a major issue.

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
