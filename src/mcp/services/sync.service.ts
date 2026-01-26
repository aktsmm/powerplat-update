/**
 * 同期サービス
 *
 * GitHub から Power Platform アップデート情報を取得してデータベースに保存
 * 差分同期: SHA を比較して変更があったファイルのみ fetch
 * バックグラウンド同期: 検索時に非同期で同期を実行
 */

import type Database from "better-sqlite3";
import type { SyncResult } from "../types.js";
import { TARGET_REPOSITORIES } from "../types.js";
import {
  getWhatsNewFiles,
  fetchAndParseFile,
  getRecentCommits,
  getRecentlyChangedFiles,
  getChangedFilesSince,
} from "../api/githubClient.js";
import {
  upsertUpdate,
  upsertCommit,
  updateSyncCheckpoint,
  getSyncCheckpoint,
  updateCommitDate,
  getFileShaMap,
} from "../database/queries.js";
import * as logger from "../utils/logger.js";

/** バックグラウンド同期の状態 */
let backgroundSyncPromise: Promise<SyncResult> | null = null;
let backgroundSyncDb: Database.Database | null = null;

/**
 * 同期オプション
 */
export interface SyncOptions {
  /** GitHub トークン */
  token?: string;
  /** 強制同期（キャッシュ無視） */
  force?: boolean;
  /** 最大ファイル数 */
  maxFiles?: number;
  /** インクリメンタル同期（差分のみ） */
  incremental?: boolean;
}

/**
 * バックグラウンド同期が必要かチェック
 */
export function needsBackgroundSync(db: Database.Database, staleHours: number = 1): boolean {
  try {
    const checkpoint = getSyncCheckpoint(db);
    if (!checkpoint.lastSync) return true;
    
    const lastSyncDate = new Date(checkpoint.lastSync);
    const hoursSinceLastSync = (Date.now() - lastSyncDate.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastSync >= staleHours;
  } catch {
    return true;
  }
}

/**
 * バックグラウンド同期を開始（非ブロッキング）
 */
export function startBackgroundSync(db: Database.Database, options: SyncOptions = {}): void {
  // すでに同期中なら何もしない
  if (backgroundSyncPromise && backgroundSyncDb === db) {
    logger.info("Background sync already in progress, skipping");
    return;
  }

  logger.info("Starting background sync");
  backgroundSyncDb = db;
  backgroundSyncPromise = syncFromGitHub(db, { ...options, incremental: true })
    .then((result) => {
      logger.info("Background sync completed", { durationMs: result.durationMs });
      return result;
    })
    .catch((error) => {
      logger.error("Background sync failed", { error: String(error) });
      return {
        success: false,
        updatesCount: 0,
        commitsCount: 0,
        durationMs: 0,
        error: String(error),
      };
    })
    .finally(() => {
      backgroundSyncPromise = null;
      backgroundSyncDb = null;
    });
}

/**
 * バックグラウンド同期の状態を取得
 */
export function isBackgroundSyncRunning(): boolean {
  return backgroundSyncPromise !== null;
}

/**
 * ファイルパスからリポジトリ名を取得
 */
function getRepoNameFromPath(filePath: string): string {
  for (const repo of TARGET_REPOSITORIES) {
    if (filePath.startsWith(repo.basePath)) {
      return repo.repo;
    }
  }
  return "power-platform";
}

/**
 * 同期実行
 */
export async function syncFromGitHub(
  db: Database.Database,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const startTime = Date.now();
  const { token, force = false, maxFiles = 500 } = options;

  try {
    // 同期状態を更新
    updateSyncCheckpoint(db, { syncStatus: "syncing", lastError: null });

    // 前回同期からの経過時間をチェック
    const checkpoint = getSyncCheckpoint(db);
    const lastSyncDate = new Date(checkpoint.lastSync);
    const hoursSinceLastSync =
      (Date.now() - lastSyncDate.getTime()) / (1000 * 60 * 60);

    if (!force && hoursSinceLastSync < 1) {
      logger.info("Skipping sync, last sync was recent", {
        hoursSinceLastSync,
      });
      updateSyncCheckpoint(db, { syncStatus: "idle" });
      return {
        success: true,
        updatesCount: checkpoint.recordCount,
        commitsCount: 0,
        durationMs: Date.now() - startTime,
      };
    }

    const { incremental = false } = options;

    logger.info("Starting sync from GitHub", {
      force,
      maxFiles,
      hasToken: !!token,
      incremental,
    });

    // インクリメンタル同期: 前回同期以降に変更されたファイルのみ取得
    if (incremental && !force && checkpoint.lastSync) {
      logger.info("Using incremental sync mode");
      return await incrementalSync(db, checkpoint.lastSync, token);
    }

    // what's-new ファイル一覧を取得（SHA 含む）
    logger.info("Fetching what's-new files from GitHub...");
    const files = await getWhatsNewFiles(token);
    logger.info("Fetched files from GitHub", { count: files.length });

    // 既存ファイルの SHA マップを取得
    const existingShaMap = getFileShaMap(db);
    const isFirstSync = existingShaMap.size === 0;

    // 差分同期: SHA が変わったファイルのみ処理
    const filesToProcess = files
      .filter((file) => {
        if (force || isFirstSync) return true;
        const existingSha = existingShaMap.get(file.path);
        return existingSha !== file.sha;
      })
      .slice(0, maxFiles);

    logger.info("Files to process", {
      total: files.length,
      changed: filesToProcess.length,
      isFirstSync,
      force,
    });

    let updatesCount = 0;
    let errorCount = 0;

    // 各ファイルを並列処理（同時5件まで）
    logger.info("Processing files (parallel)...", { count: filesToProcess.length });
    
    const PARALLEL_LIMIT = 5;
    const chunks: typeof filesToProcess[] = [];
    for (let i = 0; i < filesToProcess.length; i += PARALLEL_LIMIT) {
      chunks.push(filesToProcess.slice(i, i + PARALLEL_LIMIT));
    }

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map(async (file) => {
          try {
            const repoName = getRepoNameFromPath(file.path);
            const update = await fetchAndParseFile(
              file.rawUrl,
              file.path,
              repoName,
              token,
            );
            // SHA を保存
            update.commitSha = file.sha;
            return { success: true, update, path: file.path };
          } catch (error) {
            logger.error("Failed to process file", {
              path: file.path,
              rawUrl: file.rawUrl,
              error: error instanceof Error ? error.stack : String(error),
            });
            return { success: false, update: null, path: file.path };
          }
        })
      );

      // データベースに保存（直列で行う）
      for (const result of results) {
        if (result.success && result.update) {
          upsertUpdate(db, result.update);
          updatesCount++;
          logger.info("Successfully processed file", {
            path: result.path,
            title: result.update.title,
          });
        } else {
          errorCount++;
        }
      }
    }
    logger.info("File processing complete (parallel)", { updatesCount, errorCount });

    // コミット履歴を取得
    const since = force ? undefined : checkpoint.lastSync;
    const commits = await getRecentCommits(since, token);
    let commitsCount = 0;

    for (const commit of commits) {
      try {
        upsertCommit(db, commit);
        commitsCount++;
      } catch (error) {
        logger.warn("Failed to save commit", {
          sha: commit.sha,
          error: String(error),
        });
      }
    }

    // 最近変更されたファイルのコミット日を更新
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const changedFiles = await getRecentlyChangedFiles(
      oneWeekAgo.toISOString(),
      token,
    );

    for (const [filePath, info] of changedFiles) {
      try {
        updateCommitDate(db, filePath, info.date, info.sha);
      } catch (error) {
        logger.warn("Failed to update commit date", {
          filePath,
          error: String(error),
        });
      }
    }

    const durationMs = Date.now() - startTime;

    // 同期完了
    updateSyncCheckpoint(db, {
      lastSync: new Date().toISOString(),
      syncStatus: "idle",
      recordCount: updatesCount,
      lastSyncDurationMs: durationMs,
      lastError: errorCount > 0 ? `${errorCount} files failed` : null,
    });

    logger.info("Sync completed", {
      updatesCount,
      commitsCount,
      errorCount,
      durationMs,
    });

    return {
      success: true,
      updatesCount,
      commitsCount,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    updateSyncCheckpoint(db, {
      syncStatus: "error",
      lastError: errorMessage,
    });

    logger.error("Sync failed", { error: errorMessage, durationMs });

    return {
      success: false,
      updatesCount: 0,
      commitsCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

/**
 * インクリメンタル同期（差分のみ）
 * 前回同期以降に変更されたファイルのみを取得・更新
 */
async function incrementalSync(
  db: Database.Database,
  lastSync: string,
  token?: string,
): Promise<SyncResult> {
  const startTime = Date.now();

  try {
    logger.info("Starting incremental sync", { since: lastSync });

    // 前回同期以降に変更されたファイルを取得
    const changedFiles = await getChangedFilesSince(lastSync, token);
    logger.info("Found changed files since last sync", { count: changedFiles.length });

    if (changedFiles.length === 0) {
      const durationMs = Date.now() - startTime;
      updateSyncCheckpoint(db, {
        lastSync: new Date().toISOString(),
        syncStatus: "idle",
        lastSyncDurationMs: durationMs,
      });
      logger.info("No changes since last sync", { durationMs });
      return {
        success: true,
        updatesCount: 0,
        commitsCount: 0,
        durationMs,
      };
    }

    let updatesCount = 0;
    let errorCount = 0;

    // 変更されたファイルを並列処理
    const PARALLEL_LIMIT = 5;
    const chunks: typeof changedFiles[] = [];
    for (let i = 0; i < changedFiles.length; i += PARALLEL_LIMIT) {
      chunks.push(changedFiles.slice(i, i + PARALLEL_LIMIT));
    }

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map(async (file) => {
          try {
            const repoName = getRepoNameFromPath(file.path);
            const update = await fetchAndParseFile(
              file.rawUrl,
              file.path,
              repoName,
              token,
            );
            update.commitSha = file.sha;
            update.commitDate = file.commitDate;
            return { success: true, update, path: file.path };
          } catch (error) {
            logger.error("Failed to process file (incremental)", {
              path: file.path,
              error: error instanceof Error ? error.message : String(error),
            });
            return { success: false, update: null, path: file.path };
          }
        })
      );

      for (const result of results) {
        if (result.success && result.update) {
          upsertUpdate(db, result.update);
          updatesCount++;
        } else {
          errorCount++;
        }
      }
    }

    const durationMs = Date.now() - startTime;

    updateSyncCheckpoint(db, {
      lastSync: new Date().toISOString(),
      syncStatus: "idle",
      lastSyncDurationMs: durationMs,
      lastError: errorCount > 0 ? `${errorCount} files failed` : null,
    });

    logger.info("Incremental sync completed", {
      updatesCount,
      errorCount,
      durationMs,
    });

    return {
      success: true,
      updatesCount,
      commitsCount: 0,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    updateSyncCheckpoint(db, {
      syncStatus: "error",
      lastError: errorMessage,
    });

    logger.error("Incremental sync failed", { error: errorMessage });

    return {
      success: false,
      updatesCount: 0,
      commitsCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}
