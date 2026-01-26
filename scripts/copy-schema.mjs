// copy-schema.mjs - スキーマファイルをdistにコピー
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcSchema = join(__dirname, "..", "src", "mcp", "database", "schema.sql");
const distDir = join(__dirname, "..", "dist", "mcp", "database");
const distSchema = join(distDir, "schema.sql");

// ディレクトリ作成
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// スキーマファイルをコピー
copyFileSync(srcSchema, distSchema);
console.log("Copied schema.sql to dist/mcp/database/");
