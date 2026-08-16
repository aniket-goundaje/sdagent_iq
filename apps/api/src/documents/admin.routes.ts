import type { Express } from "express";

import type { DocumentStatusResponse } from "@sd-agent-iq/shared";

export function registerAdminRoutes(app: Express) {
  app.get("/api/admin/documents/status", (_req, res) => {
    const response: DocumentStatusResponse = {
      activeVersion: null,
      latestDiscoveredVersions: [],
      ingestionState: "not_started"
    };

    res.json(response);
  });

  app.post("/api/admin/documents/upload", (_req, res) => {
    res.status(501).json({
      type: "error",
      status: 501,
      error: {
        type: "not_implemented",
        message: "Document upload will be added in the next slice."
      }
    });
  });
}
