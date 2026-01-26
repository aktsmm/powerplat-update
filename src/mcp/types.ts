/**
 * Power Platform Update MCP 型定義
 */

/**
 * Power Platform アップデート情報
 */
export interface PowerPlatUpdate {
  id?: number;
  filePath: string;
  title: string;
  description: string | null;
  product: string;
  releaseDate: string | null;
  commitSha: string | null;
  commitDate: string | null;
  firstCommitDate: string | null;
  fileUrl: string;
  rawContentUrl: string;
}

/**
 * Power Platform コミット情報
 */
export interface PowerPlatCommit {
  sha: string;
  message: string;
  author: string | null;
  date: string;
  filesChanged: number | null;
  additions: number | null;
  deletions: number | null;
}

/**
 * 検索フィルター
 */
export interface SearchFilters {
  /** 全文検索クエリ */
  query?: string;
  /** 製品フィルタ（Power Apps, Power Automate など） */
  product?: string;
  /** 日付範囲（開始） */
  dateFrom?: string;
  /** 日付範囲（終了） */
  dateTo?: string;
  /** 取得件数上限 */
  limit?: number;
  /** オフセット */
  offset?: number;
}

/**
 * 同期結果
 */
export interface SyncResult {
  success: boolean;
  updatesCount: number;
  commitsCount: number;
  durationMs: number;
  error?: string;
}

/**
 * GitHub API レスポンス型
 */
export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

/**
 * 製品マッピング
 */
export const PRODUCT_MAPPING: Record<string, string> = {
  // Power Platform 管理・全般
  "power-platform": "Power Platform",
  admin: "Power Platform Admin",
  alm: "Power Platform ALM",
  guidance: "Power Platform Guidance",

  // Power Apps
  powerapps: "Power Apps",
  "canvas-apps": "Power Apps (Canvas)",
  "model-driven-apps": "Power Apps (Model-driven)",
  "cards-overview": "Power Apps Cards",
  maker: "Power Apps Maker",
  developer: "Power Apps Developer",

  // Power Automate
  "power-automate": "Power Automate",
  "desktop-flows": "Power Automate Desktop",
  "cloud-flows": "Power Automate Cloud",
  "process-mining": "Power Automate Process Mining",

  // Power BI
  "power-bi": "Power BI",
  "paginated-reports": "Power BI Paginated Reports",

  // Power Pages
  "power-pages": "Power Pages",

  // Dataverse
  dataverse: "Dataverse",

  // Copilot Studio (旧 Power Virtual Agents)
  "copilot-studio": "Copilot Studio",
  "power-virtual-agents": "Copilot Studio",

  // AI Builder
  "ai-builder": "AI Builder",

  // Power Fx
  "power-fx": "Power Fx",

  // Power Query
  powerquery: "Power Query",
  "power-query": "Power Query",

  // Microsoft 365 Copilot
  m365copilot: "Microsoft 365 Copilot",
  "copilot-extensibility": "Microsoft 365 Copilot",

  // Copilot Connectors
  "copilot-connectors": "Copilot Connectors",

  // Developer Tools
  "developer-tools": "Power Platform Developer Tools",
};

/**
 * 対象リポジトリ設定
 */
export const TARGET_REPOSITORIES = [
  // Power Platform 全般（Admin, ALM, Guidance など）
  {
    owner: "MicrosoftDocs",
    repo: "power-platform",
    branch: "main",
    basePath: "power-platform",
  },
  // Power Apps
  {
    owner: "MicrosoftDocs",
    repo: "powerapps-docs",
    branch: "main",
    basePath: "powerapps-docs",
  },
  // Power Automate
  {
    owner: "MicrosoftDocs",
    repo: "power-automate-docs",
    branch: "main",
    basePath: "articles",
  },
  // Power BI
  {
    owner: "MicrosoftDocs",
    repo: "powerbi-docs",
    branch: "main",
    basePath: "powerbi-docs",
  },
  // Power Pages
  {
    owner: "MicrosoftDocs",
    repo: "power-pages-docs",
    branch: "main",
    basePath: "power-pages-docs",
  },
  // Copilot Studio (旧 Power Virtual Agents)
  // 注意: power-virtual-agents リポジトリは削除済み
  // ドキュメントは businessapps-copilot-docs-pr (インターナル) に移行
  // 公開情報は https://learn.microsoft.com/en-us/microsoft-copilot-studio/whats-new を参照
  // AI Builder
  {
    owner: "MicrosoftDocs",
    repo: "ai-builder",
    branch: "main",
    basePath: "ai-builder",
  },
  // Power Query
  {
    owner: "MicrosoftDocs",
    repo: "powerquery-docs",
    branch: "main",
    basePath: "powerquery-docs",
  },
  // Microsoft 365 Copilot 拡張機能
  {
    owner: "MicrosoftDocs",
    repo: "m365copilot-docs",
    branch: "main",
    basePath: "docs",
  },
  // Copilot Connectors
  {
    owner: "MicrosoftDocs",
    repo: "copilot-connectors",
    branch: "main",
    basePath: "copilot-connectors",
  },
  // Power Platform 開発者向け Learn モジュール
  {
    owner: "MicrosoftDocs",
    repo: "mslearn-developer-tools-power-platform",
    branch: "main",
    basePath: "",
  },
  // Power Apps REST API
  {
    owner: "MicrosoftDocs",
    repo: "powerapps-docs-rest-apis",
    branch: "main",
    basePath: "",
  },
];
