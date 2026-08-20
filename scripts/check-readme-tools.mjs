/*
 * READMEに載っているMCPツール一覧が、実装が公開しているものと一致しているか確かめる。
 *
 * ツールを足したときにREADMEを直し忘れても、テストは緑のまま通る。利用者から見える
 * 唯一の一覧なので、実装とずれると「載っていないから無い」と誤解される。
 * 逆に、消したツールが載ったままだと、呼んでも動かないものを案内することになる。
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const TOOL_ROW = /^\| `([a-z_]+)` \|/gm;
const TOOL_DEFINITION = /\n {4}name: "([a-z_]+)",/g;

const TOOLS_DIR = "src/main/mcp/tools";
const README_PATH = "README.md";

// T57のセットB/Cで40本まで増える。B/C完了後に35へ上げる。
const MINIMUM_EXPECTED_TOOLS = 20;

const namesIn = (text, pattern) => [...text.matchAll(pattern)].map((match) => match[1]);

export const collectImplementedToolNames = (toolsDir) =>
  new Set(
    readdirSync(toolsDir)
      .filter((fileName) => fileName.endsWith(".ts"))
      .flatMap((fileName) => namesIn(readFileSync(join(toolsDir, fileName), "utf8"), TOOL_DEFINITION)),
  );

export const collectDocumentedToolNames = (readmePath) =>
  new Set(namesIn(readFileSync(readmePath, "utf8"), TOOL_ROW));

const onlyIn = (a, b) => [...a].filter((name) => !b.has(name)).sort();

export const checkReadmeTools = () => {
  const documented = collectDocumentedToolNames(README_PATH);
  const implemented = collectImplementedToolNames(TOOLS_DIR);

  // 片方が空なら、探し方の側が壊れている。一致していても通してはいけない。
  if (documented.size < MINIMUM_EXPECTED_TOOLS || implemented.size < MINIMUM_EXPECTED_TOOLS) {
    console.error(
      `ツールを見つけられていません（README ${documented.size}件 / 実装 ${implemented.size}件）。` +
        "抽出の仕方が実態と合っているか確かめてください。",
    );
    return false;
  }

  const missing = onlyIn(implemented, documented);
  const stale = onlyIn(documented, implemented);

  if (missing.length > 0 || stale.length > 0) {
    if (missing.length > 0) console.error(`READMEに載っていないツール: ${missing.join(", ")}`);
    if (stale.length > 0) console.error(`実装に無いのにREADMEにあるツール: ${stale.join(", ")}`);
    return false;
  }

  console.log(`READMEのMCPツール一覧は実装と一致しています（${implemented.size}件）。`);
  return true;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!checkReadmeTools()) {
    process.exit(1);
  }
}
