/**
 * GitHub API クライアント
 *
 * Power Platform Docs リポジトリから更新情報を取得
 */

import type {
  GitHubCommit,
  GitHubTreeResponse,
  GitHubTreeItem,
  PowerPlatUpdate,
  PowerPlatCommit,
} from "../types.js";
import { PRODUCT_MAPPING, TARGET_REPOSITORIES } from "../types.js";
import * as logger from "../utils/logger.js";

/** リトライ設定 */
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/** 並列処理の同時実行数 */
const CONCURRENCY_LIMIT = 5;

/**
 * 同時接続数を制限した並列処理
 */
async function parallelWithLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number = CONCURRENCY_LIMIT,
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = fn(item).then((result) => {
      results.push(result);
    });
    executing.push(promise as unknown as Promise<void>);

    if (executing.length >= limit) {
      await Promise.race(executing);
      // 完了したPromiseを除去
      const completed = executing.findIndex(
        (p) => (p as unknown as Promise<void> & { settled?: boolean }).settled,
      );
      if (completed === -1) {
        await Promise.all(executing);
        executing.length = 0;
      }
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * GitHub API fetch with auth
 */
async function githubFetch(url: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "PowerPlat-Update-MCP-Server/0.1.0",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    logger.info("Using GitHub token for API request", {
      tokenPrefix: token.substring(0, 10),
    });
  } else {
    logger.warn(
      "No GitHub token provided, using unauthenticated request (60/hour limit)",
    );
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { headers });

      // Rate limit check
      const remaining = response.headers.get("X-RateLimit-Remaining");
      if (remaining && parseInt(remaining) < 10) {
        logger.warn("GitHub API rate limit low", { remaining });
      }

      if (response.status === 403) {
        const resetTime = response.headers.get("X-RateLimit-Reset");
        throw new Error(
          `GitHub API rate limit exceeded. Reset at: ${resetTime ? new Date(parseInt(resetTime) * 1000).toISOString() : "unknown"}`,
        );
      }

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      return response;
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }

  throw new Error("Unreachable");
}

/**
 * what's-new ファイルかどうかを判定
 */
function isWhatsNewFile(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return (
    lowerPath.includes("whats-new") ||
    lowerPath.includes("what-s-new") ||
    lowerPath.includes("release-notes") ||
    lowerPath.includes("new-features") ||
    lowerPath.includes("updates")
  );
}

/**
 * ファイルパスから製品を推測
 */
function inferProduct(filePath: string, repoName: string): string {
  const lowerPath = filePath.toLowerCase();

  // リポジトリ名から製品を推測
  if (repoName.includes("powerapps")) {
    if (lowerPath.includes("canvas")) return "Power Apps (Canvas)";
    if (lowerPath.includes("model-driven")) return "Power Apps (Model-driven)";
    return "Power Apps";
  }
  if (repoName.includes("power-automate")) {
    if (lowerPath.includes("desktop")) return "Power Automate Desktop";
    if (lowerPath.includes("process-mining"))
      return "Power Automate Process Mining";
    return "Power Automate";
  }
  if (repoName.includes("powerbi")) {
    return "Power BI";
  }
  if (repoName.includes("power-pages")) {
    return "Power Pages";
  }
  if (
    repoName.includes("power-virtual-agents") ||
    repoName.includes("copilot-studio")
  ) {
    return "Copilot Studio";
  }
  if (repoName.includes("ai-builder")) {
    return "AI Builder";
  }

  // ファイルパスから推測
  for (const [key, value] of Object.entries(PRODUCT_MAPPING)) {
    if (lowerPath.includes(key)) {
      return value;
    }
  }

  return "Power Platform";
}

/**
 * 日付文字列を ISO 形式 (YYYY-MM-DD) に正規化
 */
function normalizeDateToISO(dateStr: string): string {
  // MM/DD/YYYY 形式の場合
  const mdyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, month, day, year] = mdyMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  // すでに YYYY-MM-DD 形式の場合はそのまま
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  // その他の形式はそのまま返す
  return dateStr;
}

/**
 * Markdown ファイルのフロントマターを解析
 */
function parseFrontmatter(content: string): {
  title?: string;
  description?: string;
  date?: string;
} {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    // フロントマターがない場合、最初の # 見出しをタイトルとして使用
    const titleMatch = content.match(/^#\s+(.+)/m);
    return {
      title: titleMatch?.[1]?.trim(),
    };
  }

  const frontmatter = frontmatterMatch[1];
  const result: { title?: string; description?: string; date?: string } = {};

  const titleMatch = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  if (titleMatch) result.title = titleMatch[1].trim();

  const descMatch = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m);
  if (descMatch) result.description = descMatch[1].trim();

  const dateMatch = frontmatter.match(
    /^(?:ms\.)?date:\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/m,
  );
  if (dateMatch) {
    result.date = normalizeDateToISO(dateMatch[1]);
  }

  return result;
}

/**
 * リポジトリのツリーを取得
 */
export async function getRepositoryTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<GitHubTreeItem[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

  logger.info("Fetching repository tree", { owner, repo, branch });

  const response = await githubFetch(url, token);
  const data = (await response.json()) as GitHubTreeResponse;

  if (data.truncated) {
    logger.warn("Repository tree was truncated", { owner, repo });
  }

  return data.tree;
}

/**
 * what's-new ファイル一覧を取得
 */
export async function getWhatsNewFiles(token?: string): Promise<
  Array<{
    path: string;
    url: string;
    rawUrl: string;
    product: string;
    sha: string;
  }>
> {
  logger.info("getWhatsNewFiles: Starting to fetch from repositories (parallel)", {
    repoCount: TARGET_REPOSITORIES.length,
    hasToken: !!token,
  });

  // 全リポジトリを並列で取得
  const repoResults = await Promise.all(
    TARGET_REPOSITORIES.map(async (repo) => {
      const files: Array<{
        path: string;
        url: string;
        rawUrl: string;
        product: string;
        sha: string;
      }> = [];

      try {
        logger.info("getWhatsNewFiles: Fetching tree", {
          repo: repo.repo,
          basePath: repo.basePath,
        });
        const tree = await getRepositoryTree(
          repo.owner,
          repo.repo,
          repo.branch,
          token,
        );
        logger.info("getWhatsNewFiles: Got tree", {
          repo: repo.repo,
          itemCount: tree.length,
        });

        for (const item of tree) {
          if (item.type !== "blob") continue;
          if (!item.path.endsWith(".md")) continue;
          if (!item.path.startsWith(repo.basePath)) continue;
          if (!isWhatsNewFile(item.path)) continue;

          files.push({
            path: item.path,
            url: `https://github.com/${repo.owner}/${repo.repo}/blob/${repo.branch}/${item.path}`,
            rawUrl: `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repo.branch}/${item.path}`,
            product: inferProduct(item.path, repo.repo),
            sha: item.sha,
          });
        }
        logger.info("getWhatsNewFiles: Found matches", {
          repo: repo.repo,
          matchCount: files.length,
        });
      } catch (error) {
        logger.error("getWhatsNewFiles: Failed to fetch repository", {
          repo: repo.repo,
          error: error instanceof Error ? error.stack : String(error),
        });
      }

      return files;
    })
  );

  // 結果をフラット化
  const results = repoResults.flat();
  logger.info("getWhatsNewFiles: Complete (parallel)", { totalCount: results.length });
  return results;
}

/**
 * ファイルの内容を取得してパース
 */
export async function fetchAndParseFile(
  rawUrl: string,
  filePath: string,
  repoName: string,
  token?: string,
): Promise<Omit<PowerPlatUpdate, "id">> {
  const response = await githubFetch(rawUrl, token);
  const content = await response.text();

  const metadata = parseFrontmatter(content);
  const product = inferProduct(filePath, repoName);

  return {
    filePath,
    title: metadata.title ?? filePath.split("/").pop() ?? "Unknown",
    description: metadata.description ?? null,
    product,
    releaseDate: metadata.date ?? null,
    commitSha: null,
    commitDate: null,
    firstCommitDate: null,
    fileUrl: rawUrl
      .replace("raw.githubusercontent.com", "github.com")
      .replace("/main/", "/blob/main/"),
    rawContentUrl: rawUrl,
  };
}

/**
 * ファイルの初回コミット日を取得
 */
export async function getFileFirstCommitDate(
  owner: string,
  repo: string,
  filePath: string,
  token?: string,
): Promise<{ date: string; sha: string } | null> {
  // per_page=1 で最後のページを取得することで初回コミットを取得
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?path=${filePath}&per_page=1`;

  try {
    const response = await githubFetch(url, token);

    // Link ヘッダーから最後のページを取得
    const linkHeader = response.headers.get("Link");
    if (linkHeader) {
      const lastMatch = linkHeader.match(/<([^>]+)>;\s*rel="last"/);
      if (lastMatch) {
        // 最後のページを取得
        const lastResponse = await githubFetch(lastMatch[1], token);
        const lastData = (await lastResponse.json()) as GitHubCommit[];
        if (lastData.length > 0) {
          return {
            date: lastData[lastData.length - 1].commit.author.date,
            sha: lastData[lastData.length - 1].sha,
          };
        }
      }
    }

    // ページネーションがない場合（コミットが1つだけ）
    const data = (await response.json()) as GitHubCommit[];
    if (data.length > 0) {
      return {
        date: data[0].commit.author.date,
        sha: data[0].sha,
      };
    }
  } catch (error) {
    logger.warn("Failed to get file first commit date", {
      filePath,
      error: String(error),
    });
  }

  return null;
}

/**
 * ファイルの最終コミット日を取得
 */
export async function getFileLastCommitDate(
  owner: string,
  repo: string,
  filePath: string,
  token?: string,
): Promise<{ date: string; sha: string } | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?path=${filePath}&per_page=1`;

  try {
    const response = await githubFetch(url, token);
    const data = (await response.json()) as GitHubCommit[];

    if (data.length > 0) {
      return {
        date: data[0].commit.author.date,
        sha: data[0].sha,
      };
    }
  } catch (error) {
    logger.warn("Failed to get file commit date", {
      filePath,
      error: String(error),
    });
  }

  return null;
}

/**
 * 最近変更されたファイル一覧を取得（コミット経由）
 */
export async function getRecentlyChangedFiles(
  since: string,
  token?: string,
): Promise<Map<string, { date: string; sha: string; message: string }>> {
  const changedFiles = new Map<
    string,
    { date: string; sha: string; message: string }
  >();

  // 全リポジトリを並列で取得
  const repoResults = await Promise.all(
    TARGET_REPOSITORIES.map(async (repo) => {
      const repoFiles = new Map<
        string,
        { date: string; sha: string; message: string }
      >();
      const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?path=${repo.basePath}&per_page=50&since=${since}`;

      try {
        const response = await githubFetch(url, token);
        const commits = (await response.json()) as GitHubCommit[];

        // コミット詳細を並列取得（同時5件まで）
        const commitDetails = await Promise.all(
          commits.slice(0, 10).map(async (commit) => {
            try {
              const detailUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits/${commit.sha}`;
              const detailResponse = await githubFetch(detailUrl, token);
              const detail = (await detailResponse.json()) as {
                files?: Array<{ filename: string; status: string }>;
              };
              return { commit, detail };
            } catch {
              return { commit, detail: { files: [] } };
            }
          })
        );

        for (const { commit, detail } of commitDetails) {
          if (detail.files) {
            for (const file of detail.files) {
              if (
                isWhatsNewFile(file.filename) &&
                file.filename.endsWith(".md")
              ) {
                // 最新のコミット日を保持
                const existing = repoFiles.get(file.filename);
                if (
                  !existing ||
                  new Date(commit.commit.author.date) > new Date(existing.date)
                ) {
                  repoFiles.set(file.filename, {
                    date: commit.commit.author.date,
                    sha: commit.sha,
                    message: commit.commit.message
                      .split("\n")[0]
                      .substring(0, 100),
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        logger.warn("Failed to get recent commits for repo", {
          repo: repo.repo,
          error: String(error),
        });
      }

      return repoFiles;
    })
  );

  // 結果をマージ
  for (const repoFiles of repoResults) {
    for (const [filePath, info] of repoFiles) {
      const existing = changedFiles.get(filePath);
      if (!existing || new Date(info.date) > new Date(existing.date)) {
        changedFiles.set(filePath, info);
      }
    }
  }

  logger.info("Found recently changed files (parallel)", { count: changedFiles.size });
  return changedFiles;
}

/**
 * 最近のコミットを取得
 */
export async function getRecentCommits(
  since?: string,
  token?: string,
): Promise<PowerPlatCommit[]> {
  // 全リポジトリを並列で取得
  const repoResults = await Promise.all(
    TARGET_REPOSITORIES.map(async (repo) => {
      const repoCommits: PowerPlatCommit[] = [];
      let url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?path=${repo.basePath}&per_page=100`;
      if (since) {
        url += `&since=${since}`;
      }

      try {
        const response = await githubFetch(url, token);
        const data = (await response.json()) as GitHubCommit[];

        for (const commit of data) {
          // what's-new 関連のコミットのみフィルタ
          const msg = commit.commit.message.toLowerCase();
          if (
            msg.includes("whats-new") ||
            msg.includes("what's new") ||
            msg.includes("release") ||
            msg.includes("update")
          ) {
            repoCommits.push({
              sha: commit.sha,
              message: commit.commit.message.split("\n")[0].substring(0, 200),
              author: commit.commit.author.name,
              date: commit.commit.author.date,
              filesChanged: commit.stats?.total ?? null,
              additions: commit.stats?.additions ?? null,
              deletions: commit.stats?.deletions ?? null,
            });
          }
        }
      } catch (error) {
        logger.warn("Failed to get commits for repo", {
          repo: repo.repo,
          error: String(error),
        });
      }

      return repoCommits;
    })
  );

  // 結果をフラット化
  const commits = repoResults.flat();
  logger.info("Fetched recent commits (parallel)", { count: commits.length });
  return commits;
}

/**
 * 指定日時以降に変更された what's-new ファイル一覧を取得（インクリメンタル同期用）
 * GitHub Commits API を使用して差分のみを効率的に取得
 */
export async function getChangedFilesSince(
  since: string,
  token?: string,
): Promise<
  Array<{
    path: string;
    rawUrl: string;
    sha: string;
    commitDate: string;
  }>
> {
  logger.info("Getting changed files since", { since });

  const changedFilesMap = new Map<
    string,
    { path: string; rawUrl: string; sha: string; commitDate: string }
  >();

  // 全リポジトリを並列で取得
  await Promise.all(
    TARGET_REPOSITORIES.map(async (repo) => {
      const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?path=${repo.basePath}&per_page=100&since=${since}`;

      try {
        const response = await githubFetch(url, token);
        const commits = (await response.json()) as GitHubCommit[];

        if (commits.length === 0) return;

        // 各コミットで変更されたファイルを取得（最新10件のみ）
        const commitDetails = await Promise.all(
          commits.slice(0, 10).map(async (commit) => {
            try {
              const detailUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits/${commit.sha}`;
              const detailResponse = await githubFetch(detailUrl, token);
              return (await detailResponse.json()) as {
                sha: string;
                commit: { author: { date: string } };
                files?: Array<{ filename: string; sha: string; status: string }>;
              };
            } catch {
              return null;
            }
          })
        );

        for (const detail of commitDetails) {
          if (!detail?.files) continue;

          for (const file of detail.files) {
            if (!file.filename.endsWith(".md")) continue;
            if (!isWhatsNewFile(file.filename)) continue;
            if (!file.filename.startsWith(repo.basePath)) continue;

            // 最新のコミット情報を保持
            const existing = changedFilesMap.get(file.filename);
            const commitDate = detail.commit.author.date;
            if (!existing || new Date(commitDate) > new Date(existing.commitDate)) {
              changedFilesMap.set(file.filename, {
                path: file.filename,
                rawUrl: `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repo.branch}/${file.filename}`,
                sha: file.sha,
                commitDate,
              });
            }
          }
        }
      } catch (error) {
        logger.warn("Failed to get changed files for repo", {
          repo: repo.repo,
          error: String(error),
        });
      }
    })
  );

  const result = Array.from(changedFilesMap.values());
  logger.info("Found changed files (incremental)", { count: result.length });
  return result;
}
