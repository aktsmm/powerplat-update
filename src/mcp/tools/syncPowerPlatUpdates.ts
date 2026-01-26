/**
 * sync_powerplat_updates ツール
 *
 * GitHub から Power Platform アップデート情報を同期
 */

import { z } from "zod";
import { getDatabase } from "../database/database.js";
import { syncFromGitHub } from "../services/sync.service.js";
import { getDatabaseStats } from "../database/database.js";
import { getSyncCheckpoint } from "../database/queries.js";

/**
 * ツール入力スキーマ
 */
export const syncPowerPlatUpdatesSchema = z.object({
  force: z
    .boolean()
    .optional()
    .describe("Force sync even if data is fresh (default: false)"),
  token: z
    .string()
    .optional()
    .describe("GitHub Personal Access Token (optional, increases rate limit)"),
});

export type SyncPowerPlatUpdatesInput = z.infer<
  typeof syncPowerPlatUpdatesSchema
>;

/**
 * ツール実行
 */
export async function executeSyncPowerPlatUpdates(
  input: SyncPowerPlatUpdatesInput,
): Promise<string> {
  const db = getDatabase();

  // Token: パラメータ > 環境変数 > D365トークン（共通利用）> なし
  const token =
    input.token ||
    process.env.GITHUB_TOKEN ||
    process.env.POWERPLAT_UPDATE_GITHUB_TOKEN ||
    process.env.D365_UPDATE_GITHUB_TOKEN;

  // 同期実行
  const result = await syncFromGitHub(db, {
    force: input.force,
    token,
  });

  // 統計情報を取得
  const stats = getDatabaseStats(db);
  const checkpoint = getSyncCheckpoint(db);

  return JSON.stringify(
    {
      success: result.success,
      message: result.success
        ? `Sync completed successfully. ${result.updatesCount} updates, ${result.commitsCount} commits processed.`
        : `Sync failed: ${result.error}`,
      durationMs: result.durationMs,
      stats: {
        totalUpdates: stats.updateCount,
        totalCommits: stats.commitCount,
        products: stats.productCount,
        databaseSizeKB: stats.databaseSizeKB,
      },
      lastSync: checkpoint.lastSync,
    },
    null,
    2,
  );
}
