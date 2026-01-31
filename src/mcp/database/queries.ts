/**
 * データベースクエリ
 *
 * sql.js 用のクエリ関数
 */

import type { Database as SqlJsDatabase } from "sql.js";
import type {
  PowerPlatUpdate,
  PowerPlatCommit,
  SearchFilters,
} from "../types.js";

/**
 * 同期チェックポイントを取得
 */
export function getSyncCheckpoint(db: SqlJsDatabase): {
  lastSync: string;
  syncStatus: string;
  recordCount: number;
} {
  const result = db.exec(
    "SELECT last_sync as lastSync, sync_status as syncStatus, record_count as recordCount FROM sync_checkpoint WHERE id = 1",
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return {
      lastSync: "1970-01-01T00:00:00.000Z",
      syncStatus: "idle",
      recordCount: 0,
    };
  }

  const [lastSync, syncStatus, recordCount] = result[0].values[0] as [
    string,
    string,
    number,
  ];
  return { lastSync, syncStatus, recordCount };
}

/**
 * 同期チェックポイントを更新
 */
export function updateSyncCheckpoint(
  db: SqlJsDatabase,
  data: {
    lastSync?: string;
    syncStatus?: string;
    recordCount?: number;
    lastSyncDurationMs?: number;
    lastError?: string | null;
  },
): void {
  const sets: string[] = ["updated_at = datetime('now')"];
  const values: (string | number | null)[] = [];

  if (data.lastSync !== undefined) {
    sets.push("last_sync = ?");
    values.push(data.lastSync);
  }
  if (data.syncStatus !== undefined) {
    sets.push("sync_status = ?");
    values.push(data.syncStatus);
  }
  if (data.recordCount !== undefined) {
    sets.push("record_count = ?");
    values.push(data.recordCount);
  }
  if (data.lastSyncDurationMs !== undefined) {
    sets.push("last_sync_duration_ms = ?");
    values.push(data.lastSyncDurationMs);
  }
  if (data.lastError !== undefined) {
    sets.push("last_error = ?");
    values.push(data.lastError);
  }

  const sql = `UPDATE sync_checkpoint SET ${sets.join(", ")} WHERE id = 1`;
  db.run(sql, values);
}

/**
 * アップデートを upsert
 */
export function upsertUpdate(db: SqlJsDatabase, update: PowerPlatUpdate): void {
  db.run(
    `
    INSERT INTO powerplat_updates (
      file_path, title, description, product,
      release_date, commit_sha, commit_date, first_commit_date, file_url, raw_content_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      product = excluded.product,
      release_date = excluded.release_date,
      commit_sha = excluded.commit_sha,
      commit_date = excluded.commit_date,
      first_commit_date = COALESCE(powerplat_updates.first_commit_date, excluded.first_commit_date),
      file_url = excluded.file_url,
      raw_content_url = excluded.raw_content_url,
      updated_at = datetime('now')
  `,
    [
      update.filePath,
      update.title,
      update.description,
      update.product,
      update.releaseDate,
      update.commitSha,
      update.commitDate,
      update.firstCommitDate,
      update.fileUrl,
      update.rawContentUrl,
    ],
  );
}

/**
 * コミットを upsert
 */
export function upsertCommit(db: SqlJsDatabase, commit: PowerPlatCommit): void {
  db.run(
    `
    INSERT INTO powerplat_commits (sha, message, author, date, files_changed, additions, deletions)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sha) DO UPDATE SET
      message = excluded.message,
      author = excluded.author,
      date = excluded.date,
      files_changed = excluded.files_changed,
      additions = excluded.additions,
      deletions = excluded.deletions
  `,
    [
      commit.sha,
      commit.message,
      commit.author,
      commit.date,
      commit.filesChanged,
      commit.additions,
      commit.deletions,
    ],
  );
}

/**
 * ファイルのコミット日を更新
 */
export function updateCommitDate(
  db: SqlJsDatabase,
  filePath: string,
  commitDate: string,
  commitSha: string,
): void {
  db.run(
    `
    UPDATE powerplat_updates
    SET commit_date = ?, commit_sha = ?, updated_at = datetime('now')
    WHERE file_path LIKE ?
  `,
    [commitDate, commitSha, `%${filePath}`],
  );
}

/**
 * ファイルの初回コミット日を更新
 */
export function updateFirstCommitDate(
  db: SqlJsDatabase,
  filePath: string,
  firstCommitDate: string,
): void {
  db.run(
    `
    UPDATE powerplat_updates
    SET first_commit_date = ?, updated_at = datetime('now')
    WHERE file_path LIKE ? AND first_commit_date IS NULL
  `,
    [firstCommitDate, `%${filePath}`],
  );
}

/**
 * 全ファイルの SHA マップを取得（差分同期用）
 */
export function getFileShaMap(db: SqlJsDatabase): Map<string, string> {
  const result = db.exec(
    `SELECT file_path, commit_sha FROM powerplat_updates WHERE commit_sha IS NOT NULL`,
  );

  const map = new Map<string, string>();
  if (result.length > 0) {
    for (const row of result[0].values) {
      const [filePath, commitSha] = row as [string, string];
      map.set(filePath, commitSha);
    }
  }
  return map;
}

/**
 * 全リポジトリの保存済みSHAを取得
 */
export function getAllRepoShas(db: SqlJsDatabase): Map<string, string> {
  try {
    const result = db.exec("SELECT repo, latest_sha FROM repo_sha");

    const map = new Map<string, string>();
    if (result.length > 0) {
      for (const row of result[0].values) {
        const [repo, latestSha] = row as [string, string];
        map.set(repo, latestSha);
      }
    }
    return map;
  } catch {
    // テーブルが存在しない場合は空のマップを返す
    return new Map();
  }
}

/**
 * リポジトリのSHAを保存
 */
export function upsertRepoSha(
  db: SqlJsDatabase,
  repo: string,
  sha: string,
): void {
  db.run(
    `INSERT OR REPLACE INTO repo_sha (repo, latest_sha, updated_at)
     VALUES (?, ?, datetime('now'))`,
    [repo, sha],
  );
}

/**
 * アップデートを検索
 */
export function searchUpdates(
  db: SqlJsDatabase,
  filters: SearchFilters,
): PowerPlatUpdate[] {
  let sql = `
    SELECT
      d.id, d.file_path as filePath, d.title, d.description,
      d.product, d.release_date as releaseDate,
      d.commit_sha as commitSha, d.commit_date as commitDate,
      d.first_commit_date as firstCommitDate,
      d.file_url as fileUrl, d.raw_content_url as rawContentUrl
    FROM powerplat_updates d
  `;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // 全文検索（sql.js では FTS5 が限定的なので LIKE で代替も考慮）
  if (filters.query) {
    // FTS5 テーブルが存在する場合は使用
    try {
      sql = `
        SELECT
          d.id, d.file_path as filePath, d.title, d.description,
          d.product, d.release_date as releaseDate,
          d.commit_sha as commitSha, d.commit_date as commitDate,
          d.first_commit_date as firstCommitDate,
          d.file_url as fileUrl, d.raw_content_url as rawContentUrl
        FROM powerplat_updates d
        JOIN powerplat_updates_fts fts ON d.id = fts.rowid
        WHERE powerplat_updates_fts MATCH ?
      `;
      params.push(filters.query);
    } catch {
      // FTS5 が無い場合は LIKE 検索にフォールバック
      conditions.push("(d.title LIKE ? OR d.description LIKE ?)");
      params.push(`%${filters.query}%`, `%${filters.query}%`);
    }
  }

  // 製品フィルタ
  if (filters.product) {
    conditions.push("d.product LIKE ?");
    params.push(`%${filters.product}%`);
  }

  // 日付フィルタ
  if (filters.dateFrom) {
    conditions.push(`(
      (d.release_date IS NOT NULL AND 
        CASE 
          WHEN d.release_date LIKE '____-__-__' THEN d.release_date
          WHEN d.release_date LIKE '__/__/____' THEN 
            substr(d.release_date, 7, 4) || '-' || substr(d.release_date, 1, 2) || '-' || substr(d.release_date, 4, 2)
          ELSE d.release_date
        END >= ?
      )
      OR (d.commit_date IS NOT NULL AND d.commit_date >= ?)
    )`);
    params.push(filters.dateFrom, filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`(
      (d.release_date IS NOT NULL AND 
        CASE 
          WHEN d.release_date LIKE '____-__-__' THEN d.release_date
          WHEN d.release_date LIKE '__/__/____' THEN 
            substr(d.release_date, 7, 4) || '-' || substr(d.release_date, 1, 2) || '-' || substr(d.release_date, 4, 2)
          ELSE d.release_date
        END <= ?
      )
      OR (d.commit_date IS NOT NULL AND d.commit_date <= ?)
    )`);
    params.push(filters.dateTo, filters.dateTo);
  }

  if (conditions.length > 0) {
    sql += (filters.query ? " AND " : " WHERE ") + conditions.join(" AND ");
  }

  // ソート
  sql += ` ORDER BY COALESCE(d.release_date, d.commit_date) DESC NULLS LAST`;

  // リミット
  if (filters.limit !== undefined) {
    sql += " LIMIT ?";
    params.push(filters.limit);
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    sql += " OFFSET ?";
    params.push(filters.offset);
  }

  // sql.js でパラメータ付きクエリを実行
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results: PowerPlatUpdate[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as PowerPlatUpdate;
    results.push(row);
  }
  stmt.free();

  return results;
}

/**
 * ID でアップデートを取得
 */
export function getUpdateById(
  db: SqlJsDatabase,
  id: number,
): PowerPlatUpdate | null {
  const stmt = db.prepare(`
    SELECT
      id, file_path as filePath, title, description,
      product, release_date as releaseDate,
      commit_sha as commitSha, commit_date as commitDate,
      first_commit_date as firstCommitDate,
      file_url as fileUrl, raw_content_url as rawContentUrl
    FROM powerplat_updates
    WHERE id = ?
  `);
  stmt.bind([id]);

  if (stmt.step()) {
    const result = stmt.getAsObject() as unknown as PowerPlatUpdate;
    stmt.free();
    return result;
  }
  stmt.free();
  return null;
}

/**
 * 製品一覧を取得
 */
export function getProducts(db: SqlJsDatabase): string[] {
  const result = db.exec(
    "SELECT DISTINCT product FROM powerplat_updates ORDER BY product",
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }

  return result[0].values.map((row) => row[0] as string);
}

/**
 * 最近のコミットを取得
 */
export function getRecentCommits(
  db: SqlJsDatabase,
  limit: number = 20,
): PowerPlatCommit[] {
  const stmt = db.prepare(`
    SELECT sha, message, author, date, files_changed as filesChanged,
           additions, deletions
    FROM powerplat_commits
    ORDER BY date DESC
    LIMIT ?
  `);
  stmt.bind([limit]);

  const results: PowerPlatCommit[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as PowerPlatCommit;
    results.push(row);
  }
  stmt.free();

  return results;
}

/**
 * リポジトリの保存済みSHAを取得
 */
export function getRepoSha(db: SqlJsDatabase, repo: string): string | null {
  const stmt = db.prepare("SELECT latest_sha FROM repo_sha WHERE repo = ?");
  stmt.bind([repo]);

  if (stmt.step()) {
    const row = stmt.getAsObject() as { latest_sha: string };
    stmt.free();
    return row.latest_sha;
  }
  stmt.free();
  return null;
}
