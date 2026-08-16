import type { Express } from "express";

import { env } from "../config/env.js";

export function registerHealthRoutes(app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "sd-agent-iq-api",
      environment: {
        apiPort: env.apiPort,
        databaseConfigured: Boolean(env.databaseUrl),
        openAiConfigured: env.openAiApiKey !== "placeholder-key",
        chatModel: env.openAiChatModel,
        embeddingModel: env.openAiEmbeddingModel
      }
    });
  });
}
