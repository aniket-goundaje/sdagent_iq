import path from "node:path";
import type { Express } from "express";

import type { DocumentVersion } from "@sd-agent-iq/shared";

import { getLatestDocument, listDiscoveredDocuments } from "./document-files.js";
import { ingestLatestPmDocument } from "../ingestion/pm-ingestion.service.js";
import { ingestLatestScriptsDocument } from "../ingestion/scripts-ingestion.service.js";
import { getActiveDocumentStatus } from "../vector-db/script-repository.js";

export function registerAdminRoutes(app: Express) {
  app.get("/api/admin/documents/status", async (_req, res, next) => {
    try {
      const discovered = await listDiscoveredDocuments();
      const latestDiscoveredVersions: DocumentVersion[] = discovered.map((file) => ({
        id: file.id,
        kind: file.kind,
        fileName: file.fileName,
        documentDate: file.documentDate,
        uploadedAt: new Date().toISOString(),
        status: "pending"
      }));

      const response = await getActiveDocumentStatus(latestDiscoveredVersions);
      res.json(response);
    } catch (error) {
      next(error);
    }
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

  app.post("/api/admin/documents/reindex", async (_req, res, next) => {
    try {
      const scripts = await ingestLatestScriptsDocument();
      const pm = await ingestLatestPmDocument();
      res.json({
        ok: true,
        scriptsDocumentVersionId: scripts.documentVersion.id,
        scriptEntryCount: scripts.entryCount,
        pmDocumentVersionId: pm.documentVersion.id,
        pmReferenceCount: pm.referenceCount
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/documents/latest/:kind", async (req, res, next) => {
    try {
      const kind = req.params.kind === "pm" ? "pm" : req.params.kind === "scripts" ? "scripts" : null;

      if (!kind) {
        res.status(404).json({
          type: "error",
          status: 404,
          error: {
            type: "not_found",
            message: "Document kind not found."
          }
        });
        return;
      }

      const latest = await getLatestDocument(kind);

      if (!latest) {
        res.status(404).json({
          type: "error",
          status: 404,
          error: {
            type: "not_found",
            message: "No document found for the requested kind."
          }
        });
        return;
      }

      res.type("application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${path.basename(latest.fileName)}"`);
      res.sendFile(latest.absolutePath);
    } catch (error) {
      next(error);
    }
  });
}
