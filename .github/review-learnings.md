# Review Learnings

## Universal（汎用 — 他プロジェクトでも使える）

### U1: 未使用のユーティリティ関数は削除する

- **Tags**: `品質` `バグ`
- **Added**: 2026-02-28
- **Evidence**: `parallelWithLimit` 関数が定義されていたが、内部ロジックに欠陥があり、実際には未使用だった
- **Action**: 未使用コードは定期的に検出・削除。IDE の警告や静的解析ツールを活用する

### U2: バージョン定数は package.json と同期する

- **Tags**: `品質` `UI/UX`
- **Added**: 2026-02-28
- **Evidence**: `extension.ts` の VERSION 定数が package.json と不一致（0.1.0 vs 0.1.11）
- **Action**: package.json からの動的読み込み、または CI でバージョン同期チェックを追加

## Project-specific（このワークスペース固有）

### P1: MCP サーバーのログは stderr に出力

- **Tags**: `設計` `外部連携`
- **Added**: 2026-02-28
- **Evidence**: MCP では stdout がツール出力用に予約されているため、ログは stderr を使用
- **Action**: `logger.ts` にコメントで明記済み

### P2: URL 生成ロジックは utils/url.ts に集約

- **Tags**: `品質` `DRY`
- **Added**: 2026-02-28
- **Evidence**: `convertToDocsUrl` と `generateReferenceUrls` が複数ファイルに重複定義されていた
- **Action**: `src/mcp/utils/url.ts` に共通化

## Session Log

<!-- 2026-02-28 -->

### Done

- VERSION 定数を 0.1.11 に修正 (#2)
- 未使用の `parallelWithLimit` 関数を削除 (#1)
- 未使用の `getFileFirstCommitDate` 関数を削除 (#6)
- 重複していた `convertToDocsUrl` / `generateReferenceUrls` を `utils/url.ts` に集約 (#3, #4)
- 拡張機能メッセージを日本語に統一 (#5)
- `logger.ts` に stderr 使用理由のコメント追加 (#7)

### Not Done

- なし

## Next Steps

### 確認（今回やったことが効いているか）

- [ ] `npm run build` でバンドルサイズが増加していないか確認 `~3d`

### 新観点（今回は手を付けなかった品質改善）

- [ ] テストカバレッジ: 現在ユニットテストが存在しない。主要関数（`searchUpdates`, `convertToDocsUrl`）のテスト追加 `~7d`
- [ ] CI/CD: GitHub Actions でビルド・lint・バージョンチェックの自動化 `~14d`

<!-- START:prompt-state:code-review -->

## Prompt Session State: code-review

### Run Meta

- runId: 20260228-170845
- status: partial
- startedAt: 2026-02-28T17:08:45.7663874+09:00
- endedAt: 2026-02-28T17:42:36.3009756+09:00
- nextRunHint: 30m

### Carry Over（次回優先）

- Not Done:
  - `.github/copilot-instructions.md` がリポジトリ内に存在せず、必須指示の読込を完了できなかった
- Next Steps:
  - [ ] 削除イベント（GitHub removed）を DB 側へ反映する同期方針を実装し、削除済み記事の残留を防ぐ `~14d`
  - [ ] 同期の排他制御を `syncFromGitHub` 全体に適用し、手動同期とバックグラウンド同期の競合を防止 `~7d`（継続理由: 同時実行時の checkpoint 上書きリスクが未解消）
  - [ ] `powerplatUpdate.syncIntervalHours` を stale 判定とスキップ判定に接続し、設定値と実動作を一致させる `~7d`（継続理由: 設定値24hと実装1h固定の不整合が残存）

### Todo Queue

- [ ] removed ファイル検知時の削除/無効化処理を DB クエリに追加
- [ ] 同期のプロセス内ミューテックスを導入し、重複同期を join する
- [ ] `syncIntervalHours` を `search` / `startup` / `manual` 各経路で統一適用

### Learnings Delta

- U8: 差分取得に上限（maxFiles/ページング不足）がある場合、checkpoint 進行を抑止しないと未処理分が恒久欠落する
- P8: repo SHA 差分判定が失敗したときは同期全体失敗より full sync フォールバックの方が運用回復性が高い
- P9: GitHub tree の truncated は警告継続ではなく失敗扱いにして再試行へ回す方がデータ完全性を守れる
<!-- END:prompt-state:code-review -->
