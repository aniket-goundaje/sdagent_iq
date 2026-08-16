import { runSemanticRetrieval } from "../retrieval/index.js";
import { searchPmReferences, searchScripts } from "../vector-db/script-repository.js";

const queries = [
  "Provider forgot portal password",
  "Direct deposit",
  "Paid sick leave",
  "Timesheet payment search",
  "ESP password"
];

function truncate(value: string, length = 180) {
  return value.length <= length ? value : `${value.slice(0, length)}...`;
}

async function evaluateQuery(query: string) {
  const semantic = await runSemanticRetrieval(query, 3);
  const keywordScripts = await searchScripts(query, 3);
  const keywordPm = keywordScripts[0]
    ? await searchPmReferences(query, `${keywordScripts[0].sectionTitle}\n${keywordScripts[0].scenarioText}\n${keywordScripts[0].scriptText}`, 3)
    : [];

  return {
    query,
    semantic: {
      embeddingModel: semantic.embeddingModel,
      scripts: semantic.scripts.map((candidate) => ({
        similarity: Number(candidate.similarity.toFixed(6)),
        scriptEntryId: candidate.scriptEntryId,
        sectionTitle: candidate.sectionTitle,
        pageStart: candidate.pageStart,
        scenarioText: candidate.scenarioText,
        contentPreview: truncate(candidate.contentPreview)
      })),
      pmReferences: semantic.pmReferences.map((candidate) => ({
        similarity: Number(candidate.similarity.toFixed(6)),
        pmReferenceId: candidate.pmReferenceId,
        sectionTitle: candidate.sectionTitle,
        pageNumber: candidate.pageNumber,
        contentPreview: truncate(candidate.contentPreview)
      }))
    },
    keyword: {
      scripts: keywordScripts.map((candidate) => ({
        score: candidate.score ?? 0,
        scriptEntryId: candidate.id,
        sectionTitle: candidate.sectionTitle,
        pageStart: candidate.pageStart,
        scenarioText: candidate.scenarioText,
        scriptPreview: truncate(candidate.scriptText)
      })),
      pmReferences: keywordPm.map((candidate) => ({
        pmReferenceId: candidate.id,
        sectionTitle: candidate.sectionTitle,
        pageNumber: candidate.pageNumber,
        contentPreview: truncate(candidate.textExcerpt)
      }))
    }
  };
}

async function main() {
  const results = [];

  for (const query of queries) {
    results.push(await evaluateQuery(query));
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), queries: results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
