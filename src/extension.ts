/**
 * VS Code 拡張機能エントリーポイント
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const EXTENSION_NAME = "Power Platform UPDATE MCP";
const MCP_SERVER_NAME = "powerplat-update";

/**
 * MCP 設定ファイルに powerplat-update サーバーを登録
 */
async function registerMcpServer(
  context: vscode.ExtensionContext,
): Promise<void> {
  console.log("registerMcpServer called");

  // OS に応じた mcp.json パスを決定
  let mcpJsonPath: string;
  if (process.platform === "win32") {
    mcpJsonPath = path.join(
      os.homedir(),
      "AppData",
      "Roaming",
      "Code",
      "User",
      "mcp.json",
    );
  } else if (process.platform === "darwin") {
    mcpJsonPath = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Code",
      "User",
      "mcp.json",
    );
  } else {
    mcpJsonPath = path.join(
      os.homedir(),
      ".config",
      "Code",
      "User",
      "mcp.json",
    );
  }

  // 拡張機能の MCP サーバーパス（スラッシュに統一）
  const mcpServerPath = path
    .join(context.extensionPath, "dist", "mcp", "index.js")
    .replace(/\\/g, "/");

  try {
    let mcpConfig: { servers?: Record<string, unknown>; inputs?: unknown[] } = {
      servers: {},
      inputs: [],
    };

    // 既存の mcp.json を読み込み
    if (fs.existsSync(mcpJsonPath)) {
      let content = fs.readFileSync(mcpJsonPath, "utf-8");
      // 末尾カンマを除去
      content = content.replace(/,(\s*[}\]])/g, "$1");
      try {
        mcpConfig = JSON.parse(content);
      } catch (parseError) {
        console.error("Failed to parse mcp.json:", parseError);
        mcpConfig = { servers: {}, inputs: [] };
      }
    }

    // servers がなければ作成
    if (!mcpConfig.servers) {
      mcpConfig.servers = {};
    }

    // VS Code 設定から GitHub Token を取得
    const config = vscode.workspace.getConfiguration("powerplatUpdate");
    const githubToken = config.get<string>("githubToken") || "";

    // powerplat-update が既に登録されているか確認
    const existingConfig = mcpConfig.servers[MCP_SERVER_NAME] as
      | { args?: string[]; env?: Record<string, string> }
      | undefined;
    const currentPath = existingConfig?.args?.[0];
    const currentToken = existingConfig?.env?.GITHUB_TOKEN || "";

    // パスまたはトークンが異なる場合に更新
    if (currentPath !== mcpServerPath || currentToken !== githubToken) {
      console.log("Registering MCP server...");
      console.log("mcp.json path:", mcpJsonPath);
      console.log("MCP server path:", mcpServerPath);
      console.log("GitHub Token configured:", !!githubToken);

      mcpConfig.servers[MCP_SERVER_NAME] = {
        command: "node",
        args: [mcpServerPath],
        type: "stdio",
        env: {
          GITHUB_TOKEN: githubToken,
          POWERPLAT_UPDATE_GITHUB_TOKEN: githubToken,
        },
      };

      // ディレクトリが存在しない場合は作成
      const mcpJsonDir = path.dirname(mcpJsonPath);
      if (!fs.existsSync(mcpJsonDir)) {
        fs.mkdirSync(mcpJsonDir, { recursive: true });
      }

      fs.writeFileSync(
        mcpJsonPath,
        JSON.stringify(mcpConfig, null, 2),
        "utf-8",
      );

      console.log("MCP server registered successfully");

      if (!currentPath) {
        vscode.window.showInformationMessage(
          `${EXTENSION_NAME}: MCP サーバーを登録しました。VS Code を再読み込みしてください。`,
        );
      } else {
        vscode.window.showInformationMessage(
          `${EXTENSION_NAME}: MCP サーバーのパスを更新しました。VS Code を再読み込みしてください。`,
        );
      }
    } else {
      console.log("MCP server already registered with correct path");
    }
  } catch (error) {
    console.error("Failed to register MCP server:", error);
    vscode.window.showErrorMessage(
      `${EXTENSION_NAME}: MCP サーバーの登録に失敗しました: ${error}`,
    );
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const extensionVersion =
    (context.extension.packageJSON as { version?: string })?.version ??
    "unknown";

  console.log(`${EXTENSION_NAME} v${extensionVersion} activated`);
  console.log("Extension path:", context.extensionPath);

  // MCP サーバーを mcp.json に登録
  registerMcpServer(context).catch((error) => {
    console.error("Failed to register MCP server:", error);
    vscode.window.showErrorMessage(
      `${EXTENSION_NAME}: MCP サーバーの登録に失敗しました: ${error}`,
    );
  });

  // 設定変更時に mcp.json を更新
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    (e) => {
      if (e.affectsConfiguration("powerplatUpdate.githubToken")) {
        console.log("GitHub Token configuration changed, updating mcp.json...");
        registerMcpServer(context).then(() => {
          vscode.window.showInformationMessage(
            `${EXTENSION_NAME}: GitHub Token を更新しました。VS Code を再読み込みしてください。`,
          );
        });
      }
    },
  );
  context.subscriptions.push(configChangeListener);

  // 起動時に Token 設定をチェック
  checkGitHubTokenConfig();

  // 手動同期コマンド
  const syncCommand = vscode.commands.registerCommand(
    "powerplat-update.syncUpdates",
    async () => {
      const config = vscode.workspace.getConfiguration("powerplatUpdate");
      const hasToken = !!config.get<string>("githubToken");

      if (!hasToken) {
        const result = await vscode.window.showWarningMessage(
          "GitHub Token が設定されていません。Rate Limit (60回/時間) に制限されます。",
          "設定を開く",
          "続行",
        );
        if (result === "設定を開く") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "powerplatUpdate.githubToken",
          );
          return;
        }
      }

      vscode.window.showInformationMessage(
        "Power Platform UPDATE: 同期を開始... Copilot Chat で 'sync_powerplat_updates' を使用してください。",
      );
    },
  );

  // 設定画面を開くコマンド
  const openSettingsCommand = vscode.commands.registerCommand(
    "powerplat-update.openSettings",
    () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "powerplatUpdate",
      );
    },
  );

  // バージョン情報を表示するコマンド
  const showVersionCommand = vscode.commands.registerCommand(
    "powerplat-update.showVersion",
    () => {
      const config = vscode.workspace.getConfiguration("powerplatUpdate");
      const hasToken = !!config.get<string>("githubToken");
      const autoSync = config.get<boolean>("autoSync");
      const syncInterval = config.get<number>("syncIntervalHours");

      vscode.window
        .showInformationMessage(
          `${EXTENSION_NAME} v${extensionVersion}\n` +
            `GitHub Token: ${hasToken ? "✓ 設定済み" : "✗ 未設定"}\n` +
            `Auto Sync: ${autoSync ? "有効" : "無効"} (${syncInterval}時間ごと)`,
          "設定を開く",
        )
        .then((selection) => {
          if (selection === "設定を開く") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "powerplatUpdate",
            );
          }
        });
    },
  );

  context.subscriptions.push(
    syncCommand,
    openSettingsCommand,
    showVersionCommand,
  );
}

/**
 * GitHub Token の設定状態をチェック
 */
function checkGitHubTokenConfig(): void {
  const config = vscode.workspace.getConfiguration("powerplatUpdate");
  const token = config.get<string>("githubToken");

  if (!token) {
    // 初回起動時のみ通知（設定で記憶）
    const hideNotification = config.get<boolean>("hideTokenNotification");
    if (!hideNotification) {
      vscode.window
        .showInformationMessage(
          "Power Platform UPDATE: GitHub Token を設定すると API Rate Limit が向上します (60 → 5,000回/時間)",
          "設定する",
          "今後表示しない",
        )
        .then((selection) => {
          if (selection === "設定する") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "powerplatUpdate.githubToken",
            );
          } else if (selection === "今後表示しない") {
            config.update("hideTokenNotification", true, true);
          }
        });
    }
  }
}

export function deactivate(): void {
  console.log(`${EXTENSION_NAME} deactivated`);
}
