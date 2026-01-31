/**
 * データベース初期化・管理
 *
 * sql.js (WebAssembly) を使用した SQLite データベース
 * Node.js バージョンに依存しないため、拡張機能の互換性が向上
 */

import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import * as logger from "../utils/logger.js";

// __dirname はビルド時にバナーで定義される（ESM 対応）
declare const __dirname: string;

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

/** sql.js Database インスタンス */
let dbInstance: SqlJsDatabase | null = null;
/** 現在のデータベースパス */
let currentDbPath: string | null = null;
/** sql.js 初期化 Promise */
let sqlJsInitPromise: Promise<initSqlJs.SqlJsStatic> | null = null;

/**
 * デフォルトのデータベースパスを取得
 */
function getDefaultDatabasePath(): string {
  // 環境変数でオーバーライド可能（テスト用）
  if (process.env.POWERPLAT_UPDATE_DB_PATH) {
    return process.env.POWERPLAT_UPDATE_DB_PATH;
  }
  const dataDir = join(homedir(), ".powerplat-update");
  return join(dataDir, "powerplat-updates.db");
}

/**
 * シードデータベースのパスを取得
 */
function getSeedDatabasePath(): string {
  // esbuild バンドル後は __dirname = dist/mcp/ なので、直下の resources を参照
  return join(__dirname, "..", "resources", "seed-database.db");
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
 * sql.js を初期化（シングルトン）
 */
async function getSqlJs(): Promise<initSqlJs.SqlJsStatic> {
  if (!sqlJsInitPromise) {
    sqlJsInitPromise = initSqlJs({
      // WASM ファイルを自動的に読み込む（sql.js のデフォルト動作）
      locateFile: (file: string) => {
        // node_modules または dist から WASM を探す
        // tsx 開発時と esbuild バンドル後の両方に対応
        const paths = [
          // バンドル後（dist/mcp/）
          join(__dirname, file),
          join(__dirname, "..", file),
          // 開発時（src/mcp/database/ から node_modules を探す）
          join(
            __dirname,
            "..",
            "..",
            "..",
            "node_modules",
            "sql.js",
            "dist",
            file,
          ),
          join(__dirname, "..", "..", "node_modules", "sql.js", "dist", file),
          // プロジェクトルートからの相対パス
          join(process.cwd(), "node_modules", "sql.js", "dist", file),
        ];
        for (const p of paths) {
          if (existsSync(p)) {
            return p;
          }
        }
        // デフォルト: sql.js が自動で探す
        return file;
      },
    });
  }
  return sqlJsInitPromise;
}

/**
 * データベースを初期化（非同期）
 */
export async function initializeDatabase(
  config: DatabaseConfig = {},
): Promise<SqlJsDatabase> {
  const dbPath = config.path ?? getDefaultDatabasePath();

  // シードデータベースをコピー（DBが存在しない場合）
  const copiedFromSeed = copySeedDatabaseIfNeeded(dbPath);
  if (copiedFromSeed) {
    logger.info("Initialized database from seed data");
  }

  // ディレクトリ作成
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // sql.js 初期化
  const SQL = await getSqlJs();

  // データベースファイルを読み込み、または新規作成
  let db: SqlJsDatabase;
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // パスを保存
  currentDbPath = dbPath;

  // スキーマ適用
  if (!isSchemaInitialized(db)) {
    applySchema(db);
    // 初回スキーマ適用後に保存
    saveDatabase(db, dbPath);
  } else {
    // 既存DBの場合はマイグレーションを適用
    const migrated = migrateSchema(db);
    if (migrated) {
      saveDatabase(db, dbPath);
    }
  }

  return db;
}

/**
 * シングルトンデータベースインスタンスを取得（非同期）
 */
export async function getDatabase(
  config?: DatabaseConfig,
): Promise<SqlJsDatabase> {
  if (!dbInstance) {
    dbInstance = await initializeDatabase(config);
  }
  return dbInstance;
}

/**
 * データベースをファイルに保存
 */
export function saveDatabase(db?: SqlJsDatabase, path?: string): void {
  const database = db ?? dbInstance;
  const dbPath = path ?? currentDbPath;

  if (!database || !dbPath) {
    logger.error("Cannot save database: no instance or path");
    return;
  }

  const data = database.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
}

/**
 * データベース接続を閉じる
 */
export function closeDatabase(): void {
  if (dbInstance) {
    // 閉じる前に保存
    saveDatabase();
    dbInstance.close();
    dbInstance = null;
    currentDbPath = null;
  }
}

/**
 * スキーマが初期化済みか確認
 */
function isSchemaInitialized(db: SqlJsDatabase): boolean {
  const result = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'",
  );
  return result.length > 0 && result[0].values.length > 0;
}

/**
 * スキーマを適用
 */
function applySchema(db: SqlJsDatabase): void {
  const schemaPath = join(__dirname, "schema.sql");
  const schemaSql = readFileSync(schemaPath, "utf-8");
  db.run(schemaSql);
}

/**
 * スキーママイグレーションを適用
 * 既存のデータベースに新しいカラムやテーブルを追加
 * @returns マイグレーションが適用されたかどうか
 */
export function migrateSchema(db: SqlJsDatabase): boolean {
  let migrated = false;

  // first_commit_date カラムが存在するか確認
  const columnsResult = db.exec("PRAGMA table_info(powerplat_updates)");
  const columns = columnsResult.length > 0 ? columnsResult[0].values : [];
  const columnNames = columns.map((row) => row[1] as string);

  if (!columnNames.includes("first_commit_date")) {
    db.run("ALTER TABLE powerplat_updates ADD COLUMN first_commit_date TEXT");
    migrated = true;
  }

  // repo_sha テーブルが存在するか確認（v0.1.9で追加）
  const tableResult = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='repo_sha'",
  );
  const hasRepoShaTable =
    tableResult.length > 0 && tableResult[0].values.length > 0;

  if (!hasRepoShaTable) {
    db.run(`
      CREATE TABLE IF NOT EXISTS repo_sha (
        repo TEXT PRIMARY KEY,
        latest_sha TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    migrated = true;
  }

  return migrated;
}

/**
 * データベース統計を取得
 */
export function getDatabaseStats(db: SqlJsDatabase): {
  updateCount: number;
  commitCount: number;
  productCount: number;
  databaseSizeKB: number;
} {
  const getCount = (table: string): number => {
    const result = db.exec(`SELECT COUNT(*) as count FROM ${table}`);
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as number;
    }
    return 0;
  };

  const updateCount = getCount("powerplat_updates");
  const commitCount = getCount("powerplat_commits");

  const productResult = db.exec(
    "SELECT COUNT(DISTINCT product) as count FROM powerplat_updates",
  );
  const productCount =
    productResult.length > 0 && productResult[0].values.length > 0
      ? (productResult[0].values[0][0] as number)
      : 0;

  // sql.js ではファイルサイズを直接取得できないため、export() のサイズを使用
  const data = db.export();
  const databaseSizeKB = Math.round(data.length / 1024);

  return {
    updateCount,
    commitCount,
    productCount,
    databaseSizeKB,
  };
}
