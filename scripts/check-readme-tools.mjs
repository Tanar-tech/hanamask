/*
 * READMEに載っているMCPツール一覧が、実装が公開しているものと一致しているか確かめる。
 *
 * ツールを足したときにREADMEを直し忘れても、テストは緑のまま通る。利用者から見える
 * 唯一の一覧なので、実装とずれると「載っていないから無い」と誤解される。
 * 逆に、消したツールが載ったままだと、呼んでも動かないものを案内することになる。
 */

import { readFileSync } from "node:fs";

const TOOL_ROW = /^\| `([a-z_]+)` \|/gm;
const TOOL_DEFINITION = /\n {4}name: "([a-z_]+)",/g;

const namesIn = (text, pattern) => new Set([...text.matchAll(pattern)].map((match) => match[1]));

const documented = namesIn(readFileSync("README.md", "utf8"), TOOL_ROW);
const implemented = namesIn(readFileSync("src/main/mcp/tools.ts", "utf8"), TOOL_DEFINITION);

// 片方が空なら、探し方の側が壊れている。一致していても通してはいけない。
const MINIMUM_EXPECTED_TOOLS = 10;
if (documented.size < MINIMUM_EXPECTED_TOOLS || implemented.size < MINIMUM_EXPECTED_TOOLS) {
  console.error(
    `ツールを見つけられていません（README ${documented.size}件 / 実装 ${implemented.size}件）。` +
      "抽出の仕方が実態と合っているか確かめてください。",
  );
  process.exit(1);
}

const onlyIn = (a, b) => [...a].filter((name) => !b.has(name)).sort();
const missing = onlyIn(implemented, documented);
const stale = onlyIn(documented, implemented);

if (missing.length > 0 || stale.length > 0) {
  if (missing.length > 0) console.error(`READMEに載っていないツール: ${missing.join(", ")}`);
  if (stale.length > 0) console.error(`実装に無いのにREADMEにあるツール: ${stale.join(", ")}`);
  process.exit(1);
}

console.log(`READMEのMCPツール一覧は実装と一致しています（${implemented.size}件）。`);
