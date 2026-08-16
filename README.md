# SD Agent IQ

SD Agent IQ is a monorepo for a CGI-branded service desk assistant that combines an Angular frontend, an Express API, and a pgvector-backed retrieval pipeline.

## Workspace Layout

- `apps/web`: Angular UI shell with login, agent, and supervisor routes.
- `apps/api`: Express API shell with health, auth, chat, and admin document endpoints.
- `packages/shared`: Shared TypeScript contracts used by the frontend and backend.
- `documents/incoming`: Local drop folder for the latest scripts and PM PDFs.
- `documents/archive`: Archived document versions and generated artifacts.

## Getting Started

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and fill in the OpenAI and local credentials.
3. Start Postgres with `docker compose up -d`.
4. Run the API with `npm run dev:api`.
5. Run the Angular app with `npm run dev:web`.

## Current Slice

This first slice establishes the monorepo, app bootstraps, shared contracts, local document conventions, and placeholder APIs that the next phase will extend with auth, parsing, and RAG logic.
