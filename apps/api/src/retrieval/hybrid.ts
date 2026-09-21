import { searchSemanticPmCandidates, searchSemanticScriptCandidates } from "./index.js";
import { searchPmReferences, searchScripts, type StoredScriptEntry } from "../vector-db/script-repository.js";

type KeywordPmReference = Awaited<ReturnType<typeof searchPmReferences>>[number];

export interface HybridScriptCandidate extends StoredScriptEntry {
  score: number;
  keywordScore: number;
  semanticSimilarity: number;
}

export interface HybridPmCandidate extends KeywordPmReference {
  score: number;
}

export interface HybridRetrievalResult {
  scripts: HybridScriptCandidate[];
  pmReferences: HybridPmCandidate[];
}

const SCRIPT_KEYWORD_WEIGHT = 0.7;
const SCRIPT_SEMANTIC_WEIGHT = 60;
const PM_KEYWORD_WEIGHT = 18;
const PM_SEMANTIC_WEIGHT = 60;
const EXACT_SCENARIO_BOOST = 25;
const PHRASE_SCENARIO_BOOST = 10;
const PHRASE_SEARCH_BOOST = 5;
const MIN_SCRIPT_SCORE = 30;
const MIN_PM_SCORE = 18;
const DEFAULT_SCRIPT_MATCH_LIMIT = 150;

function normalizeQuestion(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildSearchText(sectionTitle: string, scenarioText: string, scriptText: string, notesText: string) {
  return `${sectionTitle}\n${scenarioText}\n${scriptText}\n${notesText}`.toLowerCase();
}

function scoreScriptCandidate(question: string, candidate: StoredScriptEntry & { semanticSimilarity?: number }) {
  const normalizedQuestion = normalizeQuestion(question);
  const normalizedScenario = normalizeQuestion(candidate.scenarioText);
  const searchText = buildSearchText(candidate.sectionTitle, candidate.scenarioText, candidate.scriptText, candidate.notesText);
  const keywordScore = Math.min(candidate.score ?? 0, 100);
  const semanticSimilarity = candidate.semanticSimilarity ?? 0;
  const semanticScore = semanticSimilarity * 100;

  let score = keywordScore * SCRIPT_KEYWORD_WEIGHT + (semanticScore * SCRIPT_SEMANTIC_WEIGHT) / 100;

  if (normalizedScenario && normalizedScenario === normalizedQuestion) {
    score += EXACT_SCENARIO_BOOST;
  } else if (normalizedScenario && normalizedQuestion && normalizedScenario.includes(normalizedQuestion)) {
    score += PHRASE_SCENARIO_BOOST;
  } else if (normalizedQuestion && searchText.includes(normalizedQuestion)) {
    score += PHRASE_SEARCH_BOOST;
  }

  return {
    score,
    keywordScore,
    semanticSimilarity
  };
}

function scorePmCandidate(question: string, candidate: KeywordPmReference & { semanticSimilarity?: number }, keywordRank: number, keywordLimit: number) {
  const normalizedQuestion = normalizeQuestion(question);
  const searchText = buildSearchText(candidate.sectionTitle, candidate.sectionCode, candidate.textExcerpt, "");
  const keywordScore = (keywordLimit - keywordRank) * PM_KEYWORD_WEIGHT;
  const semanticScore = (candidate.semanticSimilarity ?? 0) * PM_SEMANTIC_WEIGHT;

  let score = keywordScore + semanticScore;

  if (normalizedQuestion && searchText.includes(normalizedQuestion)) {
    score += 8;
  }

  if (candidate.imageCount > 0) {
    score += 4;
  }

  return score;
}

function mergeScriptCandidates(
  question: string,
  keywordScripts: StoredScriptEntry[],
  semanticScripts: Awaited<ReturnType<typeof searchSemanticScriptCandidates>>
): HybridScriptCandidate[] {
  const merged = new Map<string, StoredScriptEntry & { semanticSimilarity?: number }>();

  for (const candidate of keywordScripts) {
    merged.set(candidate.id, { ...candidate, semanticSimilarity: 0 });
  }

  for (const candidate of semanticScripts) {
    const existing = merged.get(candidate.scriptEntryId);
    if (existing) {
      existing.semanticSimilarity = Math.max(existing.semanticSimilarity ?? 0, candidate.similarity);
      continue;
    }

    merged.set(candidate.scriptEntryId, {
      id: candidate.scriptEntryId,
      scenarioText: candidate.scenarioText,
      scriptText: candidate.scriptText,
      notesText: candidate.notesText,
      pageStart: candidate.pageStart,
      pageEnd: candidate.pageEnd,
      sectionCode: candidate.sectionCode,
      sectionTitle: candidate.sectionTitle,
      semanticSimilarity: candidate.similarity
    });
  }

  return Array.from(merged.values())
    .map((candidate) => {
      const scored = scoreScriptCandidate(question, candidate);

      return {
        ...candidate,
        ...scored
      };
    })
    .filter((candidate) => candidate.score >= MIN_SCRIPT_SCORE)
    .sort((left, right) => right.score - left.score || left.pageStart - right.pageStart);
}

function mergePmCandidates(
  question: string,
  contextText: string,
  keywordPmReferences: KeywordPmReference[],
  semanticPmReferences: Awaited<ReturnType<typeof searchSemanticPmCandidates>>
): HybridPmCandidate[] {
  const keywordRanks = new Map<string, number>();
  const semanticById = new Map<string, number>();

  keywordPmReferences.forEach((reference, index) => {
    keywordRanks.set(reference.id, index);
  });

  semanticPmReferences.forEach((reference) => {
    semanticById.set(reference.pmReferenceId, reference.similarity);
  });

  const candidateIds = new Set<string>([
    ...keywordPmReferences.map((reference) => reference.id),
    ...semanticPmReferences.map((reference) => reference.pmReferenceId)
  ]);

  const candidates = Array.from(candidateIds).map((id) => {
    const keywordReference = keywordPmReferences.find((reference) => reference.id === id);
    const semanticReference = semanticPmReferences.find((reference) => reference.pmReferenceId === id);
    const semanticSimilarity = semanticById.get(id) ?? 0;
    const mergedReference = keywordReference
      ? {
          ...keywordReference,
          semanticSimilarity
        }
      : semanticReference
        ? {
            id: semanticReference.pmReferenceId,
            sectionCode: semanticReference.sectionCode,
            sectionTitle: semanticReference.sectionTitle,
            pageNumber: semanticReference.pageNumber,
            textExcerpt: semanticReference.textExcerpt,
            imageCount: semanticReference.imageCount,
            semanticSimilarity
          }
        : null;

    if (!mergedReference) {
      throw new Error(`Unable to merge PM candidate ${id}.`);
    }

    const keywordRank = keywordRanks.get(id);
    const score = scorePmCandidate(
      question,
      mergedReference,
      keywordRank ?? keywordPmReferences.length,
      keywordPmReferences.length || 1
    );

    return {
      id: mergedReference.id,
      sectionCode: mergedReference.sectionCode,
      sectionTitle: mergedReference.sectionTitle,
      pageNumber: mergedReference.pageNumber,
      textExcerpt: mergedReference.textExcerpt,
      imageCount: mergedReference.imageCount,
      score
    };
  });

  return candidates
    .filter((candidate) => candidate.score >= MIN_PM_SCORE)
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, 3);
}

export async function searchHybridScriptCandidates(question: string, limit = DEFAULT_SCRIPT_MATCH_LIMIT): Promise<HybridScriptCandidate[]> {
  const [keywordScripts, semanticScripts] = await Promise.all([
    searchScripts(question, Math.max(limit, 8)),
    searchSemanticScriptCandidates(question, Math.max(limit, 8))
  ]);

  return mergeScriptCandidates(question, keywordScripts, semanticScripts).slice(0, limit);
}

export async function searchHybridPmReferences(question: string, contextText: string, limit = 3): Promise<HybridPmCandidate[]> {
  const [keywordPmReferences, semanticPmReferences] = await Promise.all([
    searchPmReferences(question, contextText, Math.max(limit, 5)),
    searchSemanticPmCandidates(question, Math.max(limit, 5))
  ]);

  return mergePmCandidates(question, contextText, keywordPmReferences, semanticPmReferences).slice(0, limit);
}

export async function runHybridRetrieval(question: string, contextText: string, scriptLimit = 5, pmLimit = 3): Promise<HybridRetrievalResult> {
  const [scripts, pmReferences] = await Promise.all([
    searchHybridScriptCandidates(question, scriptLimit),
    searchHybridPmReferences(question, contextText, pmLimit)
  ]);

  return {
    scripts,
    pmReferences
  };
}
