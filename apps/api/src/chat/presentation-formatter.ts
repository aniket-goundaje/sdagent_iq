import type { ScriptPresentationBlock } from "@sd-agent-iq/shared";

const PO_BOX_RE = /\bP\.?\s*O\.?\s*Box\b/i;
const CITY_STATE_ZIP_RE = /\b[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/;
const BULLET_RE = /^(?:[•*-]\s+)(.+)$/;
const NUMBERED_RE = /^(\d+)[.)]?\s+(.+)$/;
const IF_SECTION_RE = /^\(?\s*if\s+(yes|no)\s*\)?[:\s-]*(.*)$/i;

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

function isHeading(line: string) {
  return /:\s*$/.test(line);
}

function isShortListLine(line: string) {
  return line.length <= 140;
}

function isListBoundary(line: string) {
  return isHeading(line) || IF_SECTION_RE.test(line) || isBulletLine(line) || isNumberedLine(line);
}

function isBulletLine(line: string) {
  return BULLET_RE.test(line);
}

function isNumberedLine(line: string) {
  return NUMBERED_RE.test(line);
}

function stripBulletMarker(line: string) {
  return line.replace(BULLET_RE, "$1").trim();
}

function stripNumberMarker(line: string) {
  return line.replace(NUMBERED_RE, "$2").trim();
}

function collectIndentedList(lines: string[], startIndex: number) {
  const items: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (isListBoundary(line)) {
      break;
    }

    if (!isShortListLine(line)) {
      break;
    }

    items.push(line);
    index += 1;
  }

  return { items, nextIndex: index };
}

function collectMarkedList(lines: string[], startIndex: number, style: "bullet" | "number") {
  const items: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    const isExpectedStyle = style === "number" ? isNumberedLine(line) : isBulletLine(line);

    if (isExpectedStyle) {
      items.push(style === "number" ? stripNumberMarker(line) : stripBulletMarker(line));
      index += 1;
      continue;
    }

    if (items.length === 0 || isListBoundary(line) || !isShortListLine(line)) {
      break;
    }

    items[items.length - 1] = `${items[items.length - 1]} ${line}`;
    index += 1;
  }

  return { items, nextIndex: index };
}

function collectIfSection(lines: string[], startIndex: number) {
  const firstLine = lines[startIndex];
  const match = firstLine.match(IF_SECTION_RE);

  if (!match) {
    return null;
  }

  const heading = `If ${match[1].toLowerCase()}`;
  const initialText = match[2]?.trim();
  const items: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index];

    if (IF_SECTION_RE.test(line) || isHeading(line)) {
      break;
    }

    if (isBulletLine(line)) {
      items.push(stripBulletMarker(line));
      index += 1;
      continue;
    }

    if (isNumberedLine(line)) {
      items.push(stripNumberMarker(line));
      index += 1;
      continue;
    }

    if (!isShortListLine(line)) {
      break;
    }

    items.push(line);
    index += 1;
  }

  return {
    block: {
      type: "sectionGroup",
      heading,
      text: initialText || undefined,
      items
    } satisfies ScriptPresentationBlock,
    nextIndex: index
  };
}

function formatStructuredLines(lines: string[]): ScriptPresentationBlock[] {
  const blocks: ScriptPresentationBlock[] = [];
  let paragraphLines: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    const ifSection = collectIfSection(lines, index);
    if (ifSection && (ifSection.block.text || ifSection.block.items.length > 0)) {
      flushParagraph(paragraphLines, blocks);
      paragraphLines = [];
      blocks.push(ifSection.block);
      index = ifSection.nextIndex;
      continue;
    }

    if (isNumberedLine(line)) {
      const { items, nextIndex } = collectMarkedList(lines, index, "number");
      flushParagraph(paragraphLines, blocks);
      paragraphLines = [];
      blocks.push({
        type: "list",
        style: "number",
        items
      });
      index = nextIndex;
      continue;
    }

    if (isBulletLine(line)) {
      const { items, nextIndex } = collectMarkedList(lines, index, "bullet");
      const intro = paragraphLines.length > 0 && isHeading(paragraphLines[paragraphLines.length - 1]) ? paragraphLines.join(" ") : undefined;

      if (!intro) {
        flushParagraph(paragraphLines, blocks);
      }

      paragraphLines = [];
      blocks.push({
        type: "list",
        intro,
        style: "bullet",
        items
      });
      index = nextIndex;
      continue;
    }

    if (isHeading(line)) {
      const { items, nextIndex } = collectIndentedList(lines, index + 1);

      if (items.length >= 2) {
        flushParagraph(paragraphLines, blocks);
        paragraphLines = [];
        blocks.push({
          type: "list",
          intro: line,
          style: "bullet",
          items
        });
        index = nextIndex;
        continue;
      }
    }

    paragraphLines.push(line);
    index += 1;
  }

  flushParagraph(paragraphLines, blocks);
  return blocks;
}

function normalizeInlineBullets(value: string) {
  return value.replace(/([^\n])\s*•\s*/g, "$1\n• ");
}

export function formatScriptPresentation(scriptText: string): ScriptPresentationBlock[] {
  const lines = normalizeInlineBullets(scriptText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: ScriptPresentationBlock[] = [];
  let textLines: string[] = [];
  let addressLines: string[] = [];

  function flushTextLines() {
    if (textLines.length === 0) {
      return;
    }

    blocks.push(...formatStructuredLines(textLines));
    textLines = [];
  }

  for (const line of lines) {
    addressLines.push(line);

    if (CITY_STATE_ZIP_RE.test(line)) {
      flushTextLines();
      flushAddress(addressLines, blocks);
      addressLines = [];
    }
  }

  if (addressLines.length > 0) {
    textLines = [...textLines, ...addressLines];
  }

  flushTextLines();

  return blocks.length > 0 ? blocks : [{ type: "paragraph", text: scriptText.trim() }];
}
