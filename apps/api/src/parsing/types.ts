export interface ParsedScriptEntry {
  id: string;
  sectionCode: string;
  sectionTitle: string;
  pageStart: number;
  pageEnd: number;
  scenarioText: string;
  scriptText: string;
  notesText: string;
}

export interface ParsedScriptsDocument {
  fileName: string;
  documentDate: string;
  entries: ParsedScriptEntry[];
}

export interface ParsedPmReference {
  sectionCode: string;
  sectionTitle: string;
  page: number;
  text: string;
  imageCount: number;
}

export interface ParsedPmDocument {
  fileName: string;
  documentDate: string;
  references: ParsedPmReference[];
}
