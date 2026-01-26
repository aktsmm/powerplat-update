/**
 * 同期サービス
 *
 * GitHub から Power Platform アップデート情報を取得してデータベースに保存
 * 差分同期: SHA を比較して変更があったファイルのみ fetch
 */

import type Database from "better-sqlite3";
import type { SyncResult } from "../types.js";
import { TARGET_REPOSITORIES } from "../types.js";
import {
  getWhatsNewFiles,
  fetchAndParseFile,
  getRecentCommits,
  getRecentlyChangedFiles,
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

    logger.info("Starting sync from GitHub", {
      force,
      maxFiles,
      hasToken: !!token,
    });

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

    // 各ファイルを処理（変更分のみ）
    logger.info("Processing files...", { count: filesToProcess.length });
    for (const file of filesToProcess) {
      try {
        const repoName = getRepoNameFromPath(file.path);
        logger.info("Fetching file", { path: file.path, repoName });
        const update = await fetchAndParseFile(
          file.rawUrl,
          file.path,
          repoName,
          token,
        );
        // SHA を保存
        update.commitSha = file.sha;
        upsertUpdate(db, update);
        updatesCount++;
        logger.info("Successfully processed file", {
          path: file.path,
          title: update.title,
        });
      } catch (error) {
        errorCount++;
        logger.error("Failed to process file", {
          path: file.path,
          rawUrl: file.rawUrl,
          error: error instanceof Error ? error.stack : String(error),
        });
      }
    }
    logger.info("File processing complete", { updatesCount, errorCount });

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
