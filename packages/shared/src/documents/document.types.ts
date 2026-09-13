export interface DocumentVersion {
  id: string;
  kind: "scripts" | "pm";
  fileName: string;
  documentDate: string;
  uploadedAt: string;
  indexedAt?: string | null;
  status: "pending" | "indexed" | "failed";
}

export interface DocumentStatusResponse {
  activeVersion: DocumentVersion | null;
  activeVersions?: {
    scripts: DocumentVersion | null;
    pm: DocumentVersion | null;
  };
  documentStats?: {
    scripts: {
      scriptEntryCount: number;
      retrievalChunkCount: number;
    };
    pm: {
      referenceCount: number;
      retrievalChunkCount: number;
    };
  };
  latestDiscoveredVersions: DocumentVersion[];
  ingestionState: "not_started" | "queued" | "processing" | "completed" | "failed";
}
