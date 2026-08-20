import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/*
 * 記録の内容がどこにも送られないことを、実装が通信の手段を持たないことで担保する（SPEC S3）。
 * 埋め込み周りだけでなく main プロセス全体を見るのは、結線側に通信が紛れ込んでも気付けるようにするため。
 * モデルの取得はビルド時のスクリプト（scripts/）だけが行い、実行時のコードには入れない。
 */
const MAIN_DIR = join(import.meta.dirname, "../../src/main");

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+"node:https?"/,
  /\brequire\(\s*"node:https?"\s*\)/,
  /\bfrom\s+"(undici|axios|node-fetch)"/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
];

/*
 * 通信APIを持ってよい唯一の例外。MCPサーバーは localhost で待ち受けるために node:http を使う
 * （外へ送るのではなく受ける側であり、記録の送信経路にはならない）。
 */
const ALLOWED: readonly string[] = ["mcp/server.ts"];

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });

const sourceFiles = listSourceFiles(MAIN_DIR).map((path) =>
  relative(MAIN_DIR, path).split(sep).join("/"),
);

const checkedFiles = sourceFiles.filter((name) => !ALLOWED.includes(name));

describe("src/main は外部通信を行わない", () => {
  it("実行時のソースが1つ以上ある", () => {
    expect(checkedFiles.length).toBeGreaterThan(0);
  });

  it("埋め込み関連のソースを対象に含んでいる", () => {
    expect(checkedFiles).toContain("llm/llama-embedding-provider.ts");
    expect(checkedFiles).toContain("db/embeddings-repo.ts");
  });

  it("許可リストは現に存在するファイルだけを挙げている", () => {
    ALLOWED.forEach((name) => {
      expect(sourceFiles).toContain(name);
    });
  });

  it.each(checkedFiles)("%s が通信APIを参照していない", (name) => {
    const source = readFileSync(join(MAIN_DIR, name), "utf8");
    FORBIDDEN_PATTERNS.forEach((pattern) => {
      expect(pattern.test(source), `${name} matches ${String(pattern)}`).toBe(false);
    });
  });
});
