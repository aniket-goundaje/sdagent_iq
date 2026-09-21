import type { ScriptPresentationBlock } from "@sd-agent-iq/shared";

const PO_BOX_RE = /\bP\.?\s*O\.?\s*Box\b/i;
const CITY_STATE_ZIP_RE = /\b[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/;

function isAddressBlock(lines: string[]) {
  return lines.some((line) => PO_BOX_RE.test(line)) && lines.some((line) => CITY_STATE_ZIP_RE.test(line));
}

function flushParagraph(lines: string[], blocks: ScriptPresentationBlock[]) {
  if (lines.length === 0) {
    return;
  }

  blocks.push({
    type: "paragraph",
    text: lines.join(" ")
  });
}

function flushAddress(lines: string[], blocks: ScriptPresentationBlock[]) {
  if (lines.length === 0) {
    return;
  }

  if (isAddressBlock(lines)) {
    blocks.push({
      type: "address",
      lines
    });
    return;
  }

  flushParagraph(lines, blocks);
}

export function formatScriptPresentation(scriptText: string): ScriptPresentationBlock[] {
  const lines = scriptText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: ScriptPresentationBlock[] = [];
  let paragraphLines: string[] = [];
  let addressLines: string[] = [];

  for (const line of lines) {
    addressLines.push(line);

    if (CITY_STATE_ZIP_RE.test(line)) {
      flushParagraph(paragraphLines, blocks);
      paragraphLines = [];
      flushAddress(addressLines, blocks);
      addressLines = [];
    }
  }

  if (addressLines.length > 0) {
    paragraphLines = [...paragraphLines, ...addressLines];
  }

  flushParagraph(paragraphLines, blocks);

  return blocks.length > 0 ? blocks : [{ type: "paragraph", text: scriptText.trim() }];
}
