import { ingestLatestScriptsDocument } from "../ingestion/scripts-ingestion.service.js";
import { logger } from "../utils/logger.js";

function serializeError(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause instanceof Error
      ? {
          name: error.cause.name,
          message: error.cause.message,
          stack: error.cause.stack
        }
      : error.cause ?? undefined
  };
}

async function main() {
  const result = await ingestLatestScriptsDocument();
  logger.info("Scripts PDF ingestion complete.", {
    documentVersionId: result.documentVersion.id,
    entryCount: result.entryCount
  });
}

main().catch((error) => {
  logger.error("Scripts PDF ingestion failed.", {
    error: serializeError(error)
  });
  process.exitCode = 1;
});
