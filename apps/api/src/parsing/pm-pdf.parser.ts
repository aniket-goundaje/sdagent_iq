import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getPdfPythonBin, getPmPdfParserPath } from "../config/paths.js";
import type { ParsedPmDocument } from "./types.js";

const execFileAsync = promisify(execFile);

export async function parsePmPdf(filePath: string) {
  const { stdout } = await execFileAsync(getPdfPythonBin(), [getPmPdfParserPath(), filePath], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 16
  });

  return JSON.parse(stdout) as ParsedPmDocument;
}
