import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * 記録の内容がどこにも送られないことを、実装が通信の手段を持たないことで担保する（SPEC S3）。
 * モデルの取得はビルド時のスクリプトだけが行い、実行時のコードには入れない。
 */
const LLM_DIR = join(import.meta.dirname, "../../../src/main/llm");

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+"node:https?"/,
  /\brequire\(\s*"node:https?"\s*\)/,
  /\bfrom\s+"(undici|axios|node-fetch)"/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
];

const sourceFiles = readdirSync(LLM_DIR).filter((name) => name.endsWith(".ts"));

describe("src/main/llm は外部通信を行わない", () => {
  it("実行時のソースが1つ以上ある", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it.each(sourceFiles)("%s が通信APIを参照していない", (name) => {
    const source = readFileSync(join(LLM_DIR, name), "utf8");
    FORBIDDEN_PATTERNS.forEach((pattern) => {
      expect(pattern.test(source), `${name} matches ${String(pattern)}`).toBe(false);
    });
  });
});
