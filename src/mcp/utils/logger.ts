/**
 * ロガーユーティリティ
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = "info";

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLevel(level: LogLevel): void {
  currentLevel = level;
}

function log(level: LogLevel, message: string, context?: object): void {
  if (levels[level] < levels[currentLevel]) return;

  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : "";
  console.error(
    `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`,
  );
}

export function debug(message: string, context?: object): void {
  log("debug", message, context);
}

export function info(message: string, context?: object): void {
  log("info", message, context);
}

export function warn(message: string, context?: object): void {
  log("warn", message, context);
}

export function error(message: string, context?: object): void {
  log("error", message, context);
}
