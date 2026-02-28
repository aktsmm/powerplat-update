# Dashboard

## Latest Review Run

| Property       | Value                     |
| -------------- | ------------------------- |
| workflowId     | code-review               |
| status         | partial                   |
| endedAt        | 2026-02-28T17:42:36+09:00 |
| nextRunHint    | 30m                       |
| nextStepsCount | 3                         |

## Metrics

| Metric         | Value   |
| -------------- | ------- |
| Issues Fixed   | 9       |
| Issues Skipped | 1       |
| Build Status   | ✅ Pass |

## Recent Changes

- 2026-02-28: Code review - 9 items fixed (repo差分失敗時のfull syncフォールバック, checkpoint進行条件の厳格化, incrementalページング対応, tree truncated失敗化, maxFiles繰越保護)
- 2026-02-28: Code review - 2 items fixed (同期失敗時の repo SHA 先行更新を防止, checkpoint 更新の保存漏れ分岐を解消)
- 2026-02-28: Code review - 3 items fixed (checkpoint `recordCount` を総件数で整合化, raw→blob URL 変換の branch 非固定化, incremental で removed/shaなしファイルを除外)
- 2026-02-28: Code review - 3 items fixed (同期スキップ分岐の checkpoint 永続化, 差分判定の完全性チェック, Docs URL 変換の branch/パス耐性向上)
- 2026-02-28: Code review - 7 items fixed (VERSION sync, DRY refactoring, unused code removal)
