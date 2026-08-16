type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, message: string, meta?: unknown) {
  const stamp = new Date().toISOString();
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  console[level](`[${stamp}] [${level.toUpperCase()}] ${message}${payload}`);
}

export const logger = {
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta)
};
