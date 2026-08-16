import type { ChatQueryResponse } from "@sd-agent-iq/shared";

import { findScriptEntryById, searchPmReferences, searchScripts, toCitations, toReferenceLinks, toScenarioMatches } from "../vector-db/script-repository.js";

function normalizeQuestion(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitNotes(notesText: string) {
  return notesText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractSteps(scriptText: string) {
  const lines = scriptText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.filter((line) => /^(\d+[\).\s]|[-*]|select\b|click\b|enter\b|choose\b|log in\b)/i.test(line));
}

export async function buildChatResponse(question: string, selectedScenarioId?: string | null): Promise<ChatQueryResponse> {
  const trimmed = question.trim();

  if (!trimmed) {
    return {
      question: "",
      selectedScenarioId: selectedScenarioId ?? null,
      sayThisToCaller: "Please enter a question so the service can search the latest scripts.",
      notes: [],
      steps: [],
      referenceScreenshots: [],
      citations: [],
      cacheHit: false,
      scenarioMatches: []
    };
  }

  const selected = selectedScenarioId ? await findScriptEntryById(selectedScenarioId) : null;
  const matches = selected ? [selected] : await searchScripts(trimmed);

  if (matches.length === 0) {
    return {
      question: trimmed,
      selectedScenarioId: selectedScenarioId ?? null,
      sayThisToCaller: "I don't have enough context for this in the current documents.",
      notes: [],
      steps: [],
      referenceScreenshots: [],
      citations: [],
      cacheHit: false,
      scenarioMatches: []
    };
  }

  const topMatch = matches[0];
  const secondMatch = matches[1] ?? null;
  const topScore = topMatch.score ?? 0;
  const secondScore = secondMatch?.score ?? 0;
  const normalizedQuestion = normalizeQuestion(trimmed);
  const normalizedTopScenario = normalizeQuestion(topMatch.scenarioText);
  const hasExactScenarioMatch = normalizedTopScenario === normalizedQuestion;
  const isShortKeywordSearch = trimmed.split(/\s+/).length <= 4;
  const isAmbiguous = topScore < 45 || (secondMatch !== null && topScore - secondScore <= 8);
  const shouldPromptForChoice = !selectedScenarioId && !hasExactScenarioMatch && (isShortKeywordSearch || isAmbiguous);
  const scenarioMatches = shouldPromptForChoice ? toScenarioMatches(matches) : [];
  const pmReferences = shouldPromptForChoice
    ? []
    : await searchPmReferences(trimmed, `${topMatch.sectionTitle}\n${topMatch.scenarioText}\n${topMatch.scriptText}`);

  return {
    question: trimmed,
    selectedScenarioId: selectedScenarioId ?? null,
    sayThisToCaller: shouldPromptForChoice
      ? "I found a few matching script questions. Choose the closest one to see the exact caller wording."
      : topMatch.scriptText,
    notes: shouldPromptForChoice ? [] : splitNotes(topMatch.notesText),
    steps: shouldPromptForChoice ? [] : extractSteps(topMatch.scriptText),
    referenceScreenshots: shouldPromptForChoice ? [] : toReferenceLinks(pmReferences),
    citations: shouldPromptForChoice ? [] : toCitations(topMatch),
    cacheHit: false,
    scenarioMatches
  };
}
