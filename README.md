# Power Platform UPDATE MCP

[![Beta](https://img.shields.io/badge/Status-Beta-yellow)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue)]()
[![MCP](https://img.shields.io/badge/MCP-Server-green)]()

> ⚠️ **Beta**: This extension is currently in beta. Features and APIs may change without notice. Your feedback is welcome!

GitHub Copilot Chat で Power Platform のアップデート情報を検索できる MCP サーバーです。

## 機能

- **検索**: Power Apps, Power Automate, Power BI, Power Pages, Copilot Studio, AI Builder のアップデート情報を検索
- **詳細取得**: 特定のアップデートの詳細情報を取得
- **同期**: GitHub MicrosoftDocs リポジトリから最新情報を同期

## 対象リポジトリ

| 製品                  | リポジトリ                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Power Platform 全般   | [power-platform](https://github.com/MicrosoftDocs/power-platform)                                                 |
| Power Apps            | [powerapps-docs](https://github.com/MicrosoftDocs/powerapps-docs)                                                 |
| Power Automate        | [power-automate-docs](https://github.com/MicrosoftDocs/power-automate-docs)                                       |
| Power BI              | [powerbi-docs](https://github.com/MicrosoftDocs/powerbi-docs)                                                     |
| Power Pages           | [power-pages-docs](https://github.com/MicrosoftDocs/power-pages-docs)                                             |
| Copilot Studio        | [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-copilot-studio/whats-new) ※公開リポジトリなし       |
| AI Builder            | [ai-builder](https://github.com/MicrosoftDocs/ai-builder)                                                         |
| Power Query           | [powerquery-docs](https://github.com/MicrosoftDocs/powerquery-docs)                                               |
| Microsoft 365 Copilot | [m365copilot-docs](https://github.com/MicrosoftDocs/m365copilot-docs)                                             |
| Copilot Connectors    | [copilot-connectors](https://github.com/MicrosoftDocs/copilot-connectors)                                         |
| Developer Tools       | [mslearn-developer-tools-power-platform](https://github.com/MicrosoftDocs/mslearn-developer-tools-power-platform) |
| Power Apps REST API   | [powerapps-docs-rest-apis](https://github.com/MicrosoftDocs/powerapps-docs-rest-apis)                             |

> **Note**: The public repository for Copilot Studio (formerly Power Virtual Agents) has been removed. See [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-copilot-studio/whats-new) for the latest updates.

## インストール

1. VS Code にこの拡張機能をインストール
2. GitHub Token を設定（オプション、API Rate Limit 向上のため推奨）
3. Copilot Chat で使用可能

## 使用方法

### Copilot Chat での使用

```
@powerplat-update Power Apps の最近のアップデートを教えて
```

```
@powerplat-update Power Automate で Copilot 関連の新機能を検索して
```

### MCP ツール

- `search_powerplat_updates`: アップデート情報を検索
- `get_powerplat_update`: ID 指定で詳細を取得
- `sync_powerplat_updates`: GitHub から最新情報を同期

## 設定

| 設定                                | 説明                         | デフォルト |
| ----------------------------------- | ---------------------------- | ---------- |
| `powerplatUpdate.githubToken`       | GitHub Personal Access Token | なし       |
| `powerplatUpdate.autoSync`          | 起動時に自動同期             | true       |
| `powerplatUpdate.syncIntervalHours` | 同期間隔（時間）             | 24         |

## 開発

```bash
# 依存関係インストール
npm install

# ビルド
npm run build

# MCP サーバーをデバッグ
npm run dev:mcp

# MCP Inspector で確認
npm run inspect

# パッケージ作成
npm run package
```

## ライセンス

CC-BY-NC-4.0
