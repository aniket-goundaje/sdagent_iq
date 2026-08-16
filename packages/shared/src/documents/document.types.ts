export interface DocumentVersion {
  id: string;
  kind: "scripts" | "pm";
  fileName: string;
  documentDate: string;
  uploadedAt: string;
  status: "pending" | "indexed" | "failed";
}

export interface DocumentStatusResponse {
  activeVersion: DocumentVersion | null;
  latestDiscoveredVersions: DocumentVersion[];
  ingestionState: "not_started" | "queued" | "processing" | "completed" | "failed";
}
