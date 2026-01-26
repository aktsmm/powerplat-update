#!/usr/bin/env node
/**
 * Power Platform Update MCP Server エントリーポイント
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { getDatabase, closeDatabase } from "./database/database.js";
import * as logger from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("Starting Power Platform Update MCP Server");

  // 環境変数からトークン確認（デバッグ用）
  const hasGitHubToken = !!process.env.GITHUB_TOKEN;
  const hasPowerPlatToken = !!process.env.POWERPLAT_UPDATE_GITHUB_TOKEN;
  logger.info(
    `GitHub Token status: GITHUB_TOKEN=${hasGitHubToken}, POWERPLAT_UPDATE_GITHUB_TOKEN=${hasPowerPlatToken}`,
  );

  // データベース初期化
  try {
    getDatabase();
    logger.info("Database initialized");
  } catch (error) {
    logger.error("Failed to initialize database", { error: String(error) });
    process.exit(1);
  }

  // サーバー作成
  const server = createServer();

  // Stdio トランスポート
  const transport = new StdioServerTransport();

  // シグナルハンドリング
  process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down");
    closeDatabase();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down");
    closeDatabase();
    process.exit(0);
  });

  // サーバー起動
  await server.connect(transport);
  logger.info("Power Platform Update MCP Server running on stdio");
}

main().catch((error) => {
  logger.error("Fatal error", { error: String(error) });
  process.exit(1);
});
