/**
 * URL ユーティリティ
 *
 * Microsoft Learn Docs URL の生成など、共通URL処理
 */

/**
 * リポジトリ名から Microsoft Learn ドキュメントベースパスへのマッピング
 */
export const REPO_TO_DOCS_BASE: Record<string, string> = {
  "power-platform": "power-platform",
  "powerapps-docs": "power-apps",
  "power-automate-docs": "power-automate",
  "powerbi-docs": "power-bi",
  "power-pages-docs": "power-pages",
  "power-virtual-agents": "microsoft-copilot-studio",
  "ai-builder": "ai-builder",
  "powerquery-docs": "power-query",
  "m365copilot-docs": "microsoft-365-copilot",
  "copilot-connectors": "copilot-connectors",
};

/**
 * リポジトリごとのソース内ベースパス（GitHub上の配置）
 */
export const REPO_TO_SOURCE_BASE: Record<string, string> = {
  "power-platform": "power-platform",
  "powerapps-docs": "powerapps-docs",
  "power-automate-docs": "articles",
  "powerbi-docs": "powerbi-docs",
  "power-pages-docs": "power-pages-docs",
  "power-virtual-agents": "",
  "ai-builder": "ai-builder",
  "powerquery-docs": "powerquery-docs",
  "m365copilot-docs": "docs",
  "copilot-connectors": "copilot-connectors",
};

/**
 * 製品名から Microsoft Learn ドキュメントパスへのマッピング
 */
export const PRODUCT_TO_DOCS_PATH: Record<string, string> = {
  "power apps": "power-apps",
  "power apps (canvas)": "power-apps",
  "power apps (model-driven)": "power-apps",
  "power automate": "power-automate",
  "power automate desktop": "power-automate",
  "power automate process mining": "power-automate",
  "power bi": "power-bi",
  "power pages": "power-pages",
  "copilot studio": "microsoft-copilot-studio",
  "ai builder": "ai-builder",
  "power platform": "power-platform",
  "power platform admin": "power-platform",
  "power query": "power-query",
  dataverse: "dataverse",
};

/**
 * GitHub ファイルパスから Microsoft Learn Docs URL を生成
 * @param fileUrl - GitHub のファイル URL
 * @param locale - ロケール (例: 'ja-jp', 'en-us')
 * @returns Microsoft Learn の URL、変換不可の場合は null
 */
export function convertToDocsUrl(
  fileUrl: string,
  locale: string,
): string | null {
  // GitHub URL パターンから Learn URL を生成
  const match = fileUrl.match(
    /github\.com\/MicrosoftDocs\/([^/]+)\/blob\/[^/]+\/(.+)\.md$/,
  );
  if (!match) return null;

  const [, repo, fullPath] = match;

  const docsBase = REPO_TO_DOCS_BASE[repo];
  if (!docsBase) return null;

  let docsPath = fullPath;
  const sourceBase = REPO_TO_SOURCE_BASE[repo];
  if (sourceBase && docsPath.startsWith(`${sourceBase}/`)) {
    docsPath = docsPath.slice(sourceBase.length + 1);
  }

  return `https://learn.microsoft.com/${locale}/${docsBase}/${docsPath}`;
}

/**
 * 製品名から参考 URL を生成
 * @param product - 製品名
 * @param locale - ロケール
 */
export function generateReferenceUrls(
  product: string,
  locale: string,
): {
  learnSearchUrl: string;
  productDocsUrl: string;
} {
  const productLower = product.toLowerCase();
  const productPath = PRODUCT_TO_DOCS_PATH[productLower] ?? "power-platform";
  const searchTerms = encodeURIComponent(`${product} what's new`);

  return {
    learnSearchUrl: `https://learn.microsoft.com/${locale}/search/?terms=${searchTerms}`,
    productDocsUrl: `https://learn.microsoft.com/${locale}/${productPath}/`,
  };
}
