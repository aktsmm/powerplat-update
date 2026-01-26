/**
 * データベース初期化・管理
 *
 * SQLite with WAL mode, FTS5 for full-text search
 */

import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import * as logger from "../utils/logger.js";

// ESM-friendly __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * データベース設定
 */
export interface DatabaseConfig {
  /** データベースファイルパス */
  path?: string;
  /** 読み取り専用モード */
  readonly?: boolean;
  /** 詳細ログ出力 */
  verbose?: boolean;
}

let dbInstance: Database.Database | null = null;

/**
 * デフォルトのデータベースパスを取得
 */
function getDefaultDatabasePath(): string {
  const dataDir = join(homedir(), ".powerplat-update");
  return join(dataDir, "powerplat-updates.db");
}

/**
 * シードデータベースのパスを取得
 */
function getSeedDatabasePath(): string {
  // esbuild バンドル後は __dirname = dist/mcp/ なので、../../resources/
  return join(__dirname, "..", "..", "resources", "seed-database.db");
}

/**
 * シードデータベースをコピー（DBが存在しない場合）
 */
function copySeedDatabaseIfNeeded(dbPath: string): boolean {
  if (existsSync(dbPath)) {
    return false; // 既存DBあり、コピー不要
  }

  const seedPath = getSeedDatabasePath();
  if (!existsSync(seedPath)) {
    logger.info("Seed database not found, will create empty database", {
      seedPath,
    });
    return false;
  }

  try {
    // ディレクトリ作成
    const dataDir = dirname(dbPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    copyFileSync(seedPath, dbPath);
    logger.info("Copied seed database", { from: seedPath, to: dbPath });
    return true;
  } catch (error) {
    logger.error("Failed to copy seed database", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * データベースを初期化
 */
export function initializeDatabase(
  config: DatabaseConfig = {},
): Database.Database {
  const dbPath = config.path ?? getDefaultDatabasePath();

  // シードデータベースをコピー（DBが存在しない場合）
  copySeedDatabaseIfNeeded(dbPath);

  // ディレクトリ作成
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // データベース接続
  const db = new Database(dbPath, {
    readonly: config.readonly ?? false,
    verbose: config.verbose ? console.error : undefined,
  });

  // パフォーマンス最適化
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("cache_size = -64000"); // 64MB
  db.pragma("temp_store = MEMORY");
  db.pragma("foreign_keys = ON");

  // スキーマ適用
  if (!isSchemaInitialized(db)) {
    applySchema(db);
  } else {
    // 既存DBの場合はマイグレーションを適用
    migrateSchema(db);
  }

  return db;
}

/**
 * シングルトンデータベースインスタンスを取得
 */
export function getDatabase(config?: DatabaseConfig): Database.Database {
  if (!dbInstance) {
    dbInstance = initializeDatabase(config);
  }
  return dbInstance;
}

/**
 * データベース接続を閉じる
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * スキーマが初期化済みか確認
 */
function isSchemaInitialized(db: Database.Database): boolean {
  const result = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'",
    )
    .get() as { name: string } | undefined;

  return result !== undefined;
}

/**
 * スキーマを適用
 */
function applySchema(db: Database.Database): void {
  // esbuild バンドル後は __dirname が dist/mcp になるため、database/ サブフォルダを指定
  const schemaPath = join(__dirname, "database", "schema.sql");
  const schemaSql = readFileSync(schemaPath, "utf-8");
  db.exec(schemaSql);
}

/**
 * スキーママイグレーションを適用
 * 既存のデータベースに新しいカラムやテーブルを追加
 */
export function migrateSchema(db: Database.Database): void {
  // first_commit_date カラムが存在するか確認
  const columns = db
    .prepare("PRAGMA table_info(powerplat_updates)")
    .all() as Array<{
    name: string;
  }>;

  const hasFirstCommitDate = columns.some(
    (col) => col.name === "first_commit_date",
  );

  if (!hasFirstCommitDate) {
    db.exec("ALTER TABLE powerplat_updates ADD COLUMN first_commit_date TEXT");
  }

  // repo_sha テーブルが存在するか確認（v0.1.9で追加）
  const hasRepoShaTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='repo_sha'",
    )
    .get() as { name: string } | undefined;

  if (!hasRepoShaTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS repo_sha (
        repo TEXT PRIMARY KEY,
        latest_sha TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
}

/**
 * データベース統計を取得
 */
export function getDatabaseStats(db: Database.Database): {
  updateCount: number;
  commitCount: number;
  productCount: number;
  databaseSizeKB: number;
} {
  const updateCount = (
    db.prepare("SELECT COUNT(*) as count FROM powerplat_updates").get() as {
      count: number;
    }
  ).count;
  const commitCount = (
    db.prepare("SELECT COUNT(*) as count FROM powerplat_commits").get() as {
      count: number;
    }
  ).count;
  const productCount = (
    db
      .prepare("SELECT COUNT(DISTINCT product) as count FROM powerplat_updates")
      .get() as { count: number }
  ).count;

  const pageCount = db.pragma("page_count", { simple: true }) as number;
  const pageSize = db.pragma("page_size", { simple: true }) as number;
  const databaseSizeKB = Math.round((pageCount * pageSize) / 1024);

  return {
    updateCount,
    commitCount,
    productCount,
    databaseSizeKB,
  };
}
