/**
 * MCP Server 実装
 *
 * Power Platform Update MCP Server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  searchPowerPlatUpdatesSchema,
  executeSearchPowerPlatUpdates,
} from "./tools/searchPowerPlatUpdates.js";
import {
  getPowerPlatUpdateSchema,
  executeGetPowerPlatUpdate,
} from "./tools/getPowerPlatUpdate.js";
import {
  syncPowerPlatUpdatesSchema,
  executeSyncPowerPlatUpdates,
} from "./tools/syncPowerPlatUpdates.js";
import * as logger from "./utils/logger.js";

/**
 * MCP Server を作成
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "powerplat-update",
    version: "0.1.9",
  });

  // search_powerplat_updates ツール
  server.tool(
    "search_powerplat_updates",
    `Search Power Platform update information from GitHub Docs. Returns metadata with summary. Supports full-text search, product/date filters, and pagination.

## CRITICAL: Output Instructions for GitHub Copilot

When presenting results, you MUST:

1. **Translate**: title and summary to user's language (Japanese if asked in Japanese)
2. **Show ALL results**: Never truncate or summarize with "...and N more"
3. **Include all URLs**: docsUrl_ja, docsUrl_en, githubCommitsUrl as clickable links
4. **No additional tool call needed**: This search result is complete - do NOT call get_powerplat_update unless user asks for specific item details

## Recommended Output Format (Markdown):

### [Number]. [Title in User's Language]
**Product**: [product] | **Date**: [releaseDate or commitDate]
**Summary**: [summary translated to user's language]

🔗 [MS Learn (日本語)](docsUrl_ja) | [GitHub Commits](githubCommitsUrl)

IMPORTANT: If user writes in Japanese, set locale='ja-jp' for Japanese MS Learn URLs.`,
    searchPowerPlatUpdatesSchema.shape,
    async (input) => {
      try {
        const result = await executeSearchPowerPlatUpdates(input);
        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error) {
        logger.error("search_powerplat_updates failed", {
          error: String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // get_powerplat_update ツール
  server.tool(
    "get_powerplat_update",
    "Retrieve complete details of a specific Power Platform update by ID. Includes full description, product info, and reference URLs. Use after search_powerplat_updates to get detailed content. IMPORTANT: If user writes in Japanese, set locale='ja-jp' to return Japanese Microsoft Learn URLs. ALWAYS translate the title, description and all content to the user's language when presenting results (e.g., translate to Japanese if user asks in Japanese).",
    getPowerPlatUpdateSchema.shape,
    async (input) => {
      try {
        const result = await executeGetPowerPlatUpdate(input);
        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error) {
        logger.error("get_powerplat_update failed", { error: String(error) });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // sync_powerplat_updates ツール
  server.tool(
    "sync_powerplat_updates",
    "Synchronize Power Platform update data from GitHub MicrosoftDocs repositories. Fetches all what's-new articles and stores them in the local database. Use this to update the local cache with the latest update data.",
    syncPowerPlatUpdatesSchema.shape,
    async (input) => {
      try {
        const result = await executeSyncPowerPlatUpdates(input);
        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error) {
        logger.error("sync_powerplat_updates failed", { error: String(error) });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}
