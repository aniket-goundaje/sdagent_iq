import fs from "node:fs";
import path from "node:path";

import { env } from "./env.js";

const bundledPdfPython = "/Users/aniket.goundaje/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const repoRoot = process.env.INIT_CWD ?? process.cwd();

export function getPdfPythonBin() {
  const candidates = [env.pdfPythonBin, bundledPdfPython, "python3"].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "python3") {
      return candidate;
    }

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "python3";
}

export function getScriptsPdfParserPath() {
  return path.resolve(repoRoot, "apps/api/src/parsing/scripts_pdf_parser.py");
}

export function getPmPdfParserPath() {
  return path.resolve(repoRoot, "apps/api/src/parsing/pm_pdf_parser.py");
}
