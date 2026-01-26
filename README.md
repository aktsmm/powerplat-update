# PowerPlat UPDATE MCP

English | [日本語](README_ja.md)

[![Beta](https://img.shields.io/badge/Status-Beta-yellow)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue)]()
[![MCP](https://img.shields.io/badge/MCP-Server-green)]()

> ⚠️ **Beta**: This extension is currently in beta. Features and APIs may change without notice.

An MCP server for GitHub Copilot Chat that lets you search and retrieve Power Platform update information from MicrosoftDocs repositories.

## Features

- **Search**: Find updates across Power Apps, Power Automate, Power BI, Power Pages, Dataverse, AI Builder, and more
- **Get details**: Retrieve details for a specific update entry
- **Sync**: Pull the latest data from GitHub (MicrosoftDocs) into a local SQLite database

## Data sources

| Product               | Source                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| Power Platform        | https://github.com/MicrosoftDocs/power-platform                         |
| Power Apps            | https://github.com/MicrosoftDocs/powerapps-docs                         |
| Power Automate        | https://github.com/MicrosoftDocs/power-automate-docs                    |
| Power BI              | https://github.com/MicrosoftDocs/powerbi-docs                           |
| Power Pages           | https://github.com/MicrosoftDocs/power-pages-docs                       |
| AI Builder            | https://github.com/MicrosoftDocs/ai-builder                             |
| Power Query           | https://github.com/MicrosoftDocs/powerquery-docs                        |
| Microsoft 365 Copilot | https://github.com/MicrosoftDocs/m365copilot-docs                       |
| Copilot Connectors    | https://github.com/MicrosoftDocs/copilot-connectors                     |
| Developer Tools       | https://github.com/MicrosoftDocs/mslearn-developer-tools-power-platform |
| Power Apps REST API   | https://github.com/MicrosoftDocs/powerapps-docs-rest-apis               |

> **Copilot Studio note**: The public GitHub repository for Copilot Studio (formerly Power Virtual Agents) has been removed. For the latest updates, see https://learn.microsoft.com/en-us/microsoft-copilot-studio/whats-new

## Usage (Copilot Chat)

```
@powerplat-update Show me recent Power Apps updates
```

```
@powerplat-update Search Copilot-related updates in Power Automate
```

## MCP tools

- `search_powerplat_updates`: Search update entries
- `get_powerplat_update`: Get update details by ID
- `sync_powerplat_updates`: Sync from GitHub

## Performance Optimizations

This extension uses several techniques to minimize sync time:

| Technique | Description | Impact |
|-----------|-------------|--------|
| **Repository-level diff check** | Compares latest commit SHA for each repository before syncing. If no changes detected, skips the entire sync. | 150s → 6s (no changes) |
| **Parallel processing** | Fetches repository trees, file contents, and commit history concurrently (5 concurrent requests). | 150s → 15s |
| **Background auto-sync** | MCP server automatically syncs in background on startup when data is stale (>1 hour). User never waits. | Instant response |
| **Incremental sync** | Only fetches files changed since last sync using commit history. | 15s → 5s (few changes) |
| **Pre-seeded database** | Ships with a seed database for instant use on first launch. | No initial wait |

### Sync Performance

| Scenario | Time | vs Original |
|----------|------|-------------|
| Original (sequential) | 150s | - |
| No repository changes | **6s** | 97% faster |
| With changes (parallel) | **15s** | 90% faster |
| Incremental (few files) | **5s** | 97% faster |

## Settings

| Setting                                 | Description                        | Default |
| --------------------------------------- | ---------------------------------- | ------- |
| `powerplatUpdate.githubToken`           | GitHub Personal Access Token       | (empty) |
| `powerplatUpdate.autoSync`              | Automatically sync on startup      | true    |
| `powerplatUpdate.syncIntervalHours`     | Sync interval (hours)              | 24      |
| `powerplatUpdate.hideTokenNotification` | Hide the GitHub Token notification | false   |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Debug MCP server
npm run dev:mcp

# Inspect with MCP Inspector
npm run inspect
```

## License

CC BY-NC-SA 4.0
