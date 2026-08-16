export interface Citation {
  label: string;
  sourceType: "scripts_pdf" | "pm_pdf";
  page: number;
}

export interface ReferenceScreenshot {
  id: string;
  title: string;
  imageUrl: string;
  page: number;
}

export interface ParsedScriptScenarioMatch {
  id: string;
  scenarioText: string;
  sectionTitle: string;
  pageStart: number;
  pageEnd: number;
}

export interface ChatQueryRequest {
  question: string;
  selectedScenarioId?: string | null;
}

export interface ChatQueryResponse {
  question: string;
  selectedScenarioId: string | null;
  sayThisToCaller: string;
  notes: string[];
  steps: string[];
  referenceScreenshots: ReferenceScreenshot[];
  citations: Citation[];
  cacheHit: boolean;
  scenarioMatches: ParsedScriptScenarioMatch[];
}

export interface RecentQuestion {
  id: string;
  question: string;
  askedAt: string;
}

export interface RecentQuestionsResponse {
  items: RecentQuestion[];
}

export interface CommonQuestionsResponse {
  items: string[];
}
