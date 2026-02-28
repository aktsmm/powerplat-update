/**
 * get_powerplat_update ツール
 *
 * ID 指定で Power Platform アップデートの詳細を取得
 */

import { z } from "zod";
import { getDatabase } from "../database/database.js";
import { getUpdateById } from "../database/queries.js";
import { convertToDocsUrl, generateReferenceUrls } from "../utils/url.js";

/**
 * ツール入力スキーマ
 */
export const getPowerPlatUpdateSchema = z.object({
  id: z
    .number()
    .describe("Unique identifier of the Power Platform update (required)"),
  locale: z
    .string()
    .optional()
    .describe(
      "IMPORTANT: Set this based on user's language. Use 'ja-jp' if user writes in Japanese, 'en-us' for English. This affects Microsoft Learn URLs in response.",
    ),
});

export type GetPowerPlatUpdateInput = z.infer<typeof getPowerPlatUpdateSchema>;

/**
 * ツール実行
 */
export async function executeGetPowerPlatUpdate(
  input: GetPowerPlatUpdateInput,
): Promise<string> {
  const db = await getDatabase();

  const update = getUpdateById(db, input.id);

  if (!update) {
    return JSON.stringify({
      error: `Update with ID ${input.id} not found`,
      suggestion: "Use search_powerplat_updates to find valid update IDs",
    });
  }

  // ロケール（デフォルト: en-us）
  const locale = input.locale || "en-us";

  // 参考 URL を生成
  const urls = generateReferenceUrls(update.product, locale);

  // Docs URL を生成
  const docsUrl = convertToDocsUrl(update.fileUrl, locale);

  // GitHub コミット履歴リンク
  const commitsUrl = update.fileUrl?.replace("/blob/", "/commits/") || null;

  return JSON.stringify(
    {
      id: update.id,
      title: update.title,
      product: update.product,
      description: update.description,
      releaseDate: update.releaseDate,
      lastCommitDate: update.commitDate,
      // Microsoft Learn Docs URL（言語対応）
      docsUrl,
      // GitHub ソース・コミット履歴
      githubUrl: update.fileUrl,
      githubCommitsUrl: commitsUrl,
      rawContentUrl: update.rawContentUrl,
      // 参考リンク
      references: {
        learnSearchUrl: urls.learnSearchUrl,
        productDocsUrl: urls.productDocsUrl,
      },
    },
    null,
    2,
  );
}
