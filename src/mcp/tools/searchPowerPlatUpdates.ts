/**
 * search_powerplat_updates ツール
 *
 * Power Platform アップデート情報を検索
 * バックグラウンド同期: データが古い場合は自動で裏で同期を開始
 */

import { z } from "zod";
import { getDatabase } from "../database/database.js";
import { searchUpdates, getProducts } from "../database/queries.js";
import {
  needsBackgroundSync,
  startBackgroundSync,
  isBackgroundSyncRunning,
} from "../services/sync.service.js";

/**
 * GitHub ファイルパスから Microsoft Learn Docs URL を生成
 * @param fileUrl - GitHub のファイル URL
 * @param locale - ロケール (例: 'ja-jp', 'en-us')
 * @returns Microsoft Learn の URL
 */
function convertToDocsUrl(fileUrl: string, locale: string): string | null {
  // GitHub URL パターンから Learn URL を生成
  const match = fileUrl.match(
    /github\.com\/MicrosoftDocs\/([^/]+)\/blob\/main\/([^/]+)\/(.+)\.md$/,
  );
  if (!match) return null;

  const [, repo, basePath, path] = match;

  // リポジトリ別のドキュメントベース URL マッピング
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
 * ツール入力スキーマ
 */
export const searchPowerPlatUpdatesSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "Full-text search query (searches title + description). Use keywords like 'Copilot', 'connector', 'flow'. Case-insensitive.",
    ),
  product: z
    .string()
    .optional()
    .describe(
      "Filter by product (e.g., 'Power Apps', 'Power Automate', 'Power BI', 'Power Pages', 'Copilot Studio', 'AI Builder')",
    ),
  dateFrom: z
    .string()
    .optional()
    .describe(
      "Filter by commit date range start (ISO 8601 format, e.g., '2024-01-01')",
    ),
  dateTo: z
    .string()
    .optional()
    .describe(
      "Filter by commit date range end (ISO 8601 format, e.g., '2024-12-31')",
    ),
  locale: z
    .string()
    .optional()
    .describe(
      "IMPORTANT: Set this based on user's language. Use 'ja-jp' if user writes in Japanese, 'en-us' for English, etc. This affects Microsoft Learn URLs. If user asks in Japanese, ALWAYS set to 'ja-jp'.",
    ),
  limit: z
    .number()
    .min(1)
    .optional()
    .describe(
      "Maximum number of results. If not specified, returns all matching results.",
    ),
  offset: z
    .number()
    .min(0)
    .optional()
    .describe("Number of results to skip for pagination (default: 0)"),
});

export type SearchPowerPlatUpdatesInput = z.infer<
  typeof searchPowerPlatUpdatesSchema
>;

/**
 * ツール実行
 */
export async function executeSearchPowerPlatUpdates(
  input: SearchPowerPlatUpdatesInput,
): Promise<string> {
  const db = getDatabase();

  // バックグラウンド同期: データが古い場合（1時間以上）は裏で同期を開始
  if (needsBackgroundSync(db, 1) && !isBackgroundSyncRunning()) {
    startBackgroundSync(db);
  }

  // 製品一覧を取得（フィルタのヒント用）
  const products = getProducts(db);

  // デフォルト: 1ヶ月前から（日付指定がない場合）
  let dateFrom = input.dateFrom;
  if (!dateFrom && !input.query) {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    dateFrom = oneMonthAgo.toISOString().split("T")[0];
  }

  // 検索実行
  const results = searchUpdates(db, {
    query: input.query,
    product: input.product,
    dateFrom,
    dateTo: input.dateTo,
    limit: input.limit,
    offset: input.offset,
  });

  // 結果をフォーマット
  const formattedResults = results.map((update) => {
    // 概要を抽出
    let summary = "";
    if (update.description) {
      const lines = update.description
        .split("\n")
        .filter((l: string) => l.trim());
      const bulletPoints = lines.filter(
        (l: string) => l.trim().startsWith("-") || l.trim().startsWith("*"),
      );

      if (bulletPoints.length > 0) {
        summary = bulletPoints
          .slice(0, 5)
          .map((l: string) => l.trim())
          .join(" | ");
      } else {
        summary = update.description.substring(0, 600);
        if (update.description.length > 600) summary += "...";
      }
    } else {
      summary = `Details about ${update.title}`;
    }

    // 更新タイプを判定（新規ページ or 既存ページ更新）
    let updateType: "new" | "updated" = "updated";
    if (update.firstCommitDate && update.commitDate) {
      const firstDate = new Date(update.firstCommitDate);
      const lastDate = new Date(update.commitDate);
      const diffDays =
        (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 7) {
        updateType = "new";
      }
    } else if (!update.firstCommitDate && update.commitDate) {
      // タイトルに年月が含まれていれば新規リリースノートと判定
      const titleHasDate =
        /\d{4}|wave|early access|january|february|march|april|may|june|july|august|september|october|november|december/i.test(
          update.title,
        );
      if (titleHasDate) {
        updateType = "new";
      }
    }

    // MS Learn URL を日本語・英語両方生成
    const docsUrlJa = convertToDocsUrl(update.fileUrl, "ja-jp");
    const docsUrlEn = convertToDocsUrl(update.fileUrl, "en-us");

    // GitHub コミット履歴リンクを生成
    const commitsUrl = update.fileUrl?.replace("/blob/", "/commits/") || null;

    return {
      id: update.id,
      title: update.title,
      product: update.product,
      releaseDate: update.releaseDate,
      commitDate: update.commitDate,
      updateType,
      summary,
      docsUrl_ja: docsUrlJa,
      docsUrl_en: docsUrlEn,
      githubUrl: update.fileUrl,
      githubCommitsUrl: commitsUrl,
    };
  });

  // 期間情報を追加
  const dateRange = dateFrom
    ? `${dateFrom} ~ ${input.dateTo || "now"}`
    : "all time";

  // ロケール（デフォルト: en-us）
  const locale = input.locale || "en-us";
  const isJapanese = locale.startsWith("ja");

  // サマリ情報を生成
  const productCounts: Record<string, number> = {};

  for (const r of formattedResults) {
    const prod = r.product || "Unknown";
    productCounts[prod] = (productCounts[prod] || 0) + 1;
  }

  // 言語に応じたメッセージ
  const messages = isJapanese
    ? {
        summary: "📊 サマリ",
        totalResults: "件数",
        period: "期間",
        byProduct: "製品別",
        allResults: "📋 全件一覧（以下をすべて日本語に翻訳して表示）",
        availableProducts: "利用可能な製品フィルタ",
        outputInstruction:
          "⚠️ 出力指示: title と summary を日本語に翻訳し、全件を省略せず表示してください",
      }
    : {
        summary: "📊 Summary",
        totalResults: "Total Results",
        period: "Period",
        byProduct: "By Product",
        allResults: "📋 All Results",
        availableProducts: "Available Product Filters",
        outputInstruction:
          "⚠️ Output Instruction: Display all results without truncation",
      };

  return JSON.stringify(
    {
      [messages.outputInstruction]: true,
      [messages.summary]: {
        [messages.totalResults]: results.length,
        [messages.period]: dateRange,
        [messages.byProduct]: productCounts,
      },
      [messages.allResults]: formattedResults.map((r) => ({
        id: r.id,
        title: r.title,
        product: r.product,
        releaseDate: r.releaseDate,
        commitDate: r.commitDate,
        updateType: r.updateType,
        summary: r.summary,
        docsUrl_ja: r.docsUrl_ja,
        docsUrl_en: r.docsUrl_en,
        githubCommitsUrl: r.githubCommitsUrl,
      })),
      [messages.availableProducts]: products,
    },
    null,
    2,
  );
}
