import { ingestLatestPmDocument } from "../ingestion/pm-ingestion.service.js";
import { logger } from "../utils/logger.js";

async function main() {
  const result = await ingestLatestPmDocument();
  logger.info("PM PDF ingestion complete.", {
    documentVersionId: result.documentVersion.id,
    referenceCount: result.referenceCount
  });
}

main().catch((error) => {
  logger.error("PM PDF ingestion failed.", {
    message: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
