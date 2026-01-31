/**
 * get_powerplat_update ツール
 *
 * ID 指定で Power Platform アップデートの詳細を取得
 */

import { z } from "zod";
import { getDatabase } from "../database/database.js";
import { getUpdateById } from "../database/queries.js";

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
 * 参考 URL を生成
 */
function generateReferenceUrls(
  product: string,
  locale: string,
): {
  learnSearchUrl: string;
  productDocsUrl: string;
} {
  // 製品名からドキュメントパスを推測
  const productPath = product.toLowerCase().includes("power apps")
    ? "power-apps"
    : product.toLowerCase().includes("power automate")
      ? "power-automate"
      : product.toLowerCase().includes("power bi")
        ? "power-bi"
        : product.toLowerCase().includes("power pages")
          ? "power-pages"
          : product.toLowerCase().includes("copilot studio")
            ? "microsoft-copilot-studio"
            : product.toLowerCase().includes("ai builder")
              ? "ai-builder"
              : "power-platform";

  const searchTerms = encodeURIComponent(`${product} what's new`);

  return {
    learnSearchUrl: `https://learn.microsoft.com/${locale}/search/?terms=${searchTerms}`,
    productDocsUrl: `https://learn.microsoft.com/${locale}/${productPath}/`,
  };
}

/**
 * GitHub ファイルパスから Microsoft Learn Docs URL を生成
 */
function convertToDocsUrl(fileUrl: string, locale: string): string | null {
  const match = fileUrl.match(
    /github\.com\/MicrosoftDocs\/([^/]+)\/blob\/main\/([^/]+)\/(.+)\.md$/,
  );
  if (!match) return null;

  const [, repo, , path] = match;

  const repoToDocsBase: Record<string, string> = {
    "power-platform": "power-platform",
    "powerapps-docs": "power-apps",
    "power-automate-docs": "power-automate",
    "powerbi-docs": "power-bi",
    "power-pages-docs": "power-pages",
    "power-virtual-agents": "microsoft-copilot-studio",
    "ai-builder": "ai-builder",
  };

  const docsBase = repoToDocsBase[repo];
  if (!docsBase) return null;

  return `https://learn.microsoft.com/${locale}/${docsBase}/${path}`;
}

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
