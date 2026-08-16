import { ingestLatestScriptsDocument } from "../ingestion/scripts-ingestion.service.js";
import { logger } from "../utils/logger.js";

async function main() {
  const result = await ingestLatestScriptsDocument();
  logger.info("Scripts PDF ingestion complete.", {
    documentVersionId: result.documentVersion.id,
    entryCount: result.entryCount
  });
}

main().catch((error) => {
  logger.error("Scripts PDF ingestion failed.", {
    message: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
