import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getPdfPythonBin, getScriptsPdfParserPath } from "../config/paths.js";
import type { ParsedScriptsDocument } from "./types.js";

const execFileAsync = promisify(execFile);

export async function parseScriptsPdf(filePath: string) {
  const { stdout } = await execFileAsync(getPdfPythonBin(), [getScriptsPdfParserPath(), filePath], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 16
  });

  return JSON.parse(stdout) as ParsedScriptsDocument;
}
