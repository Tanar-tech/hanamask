// 同梱される依存に強いコピーレフトが混ざっていないことを確かめる。
// Apache-2.0 の成果物に GPL/AGPL を取り込むと配布条件が変わってしまう。
//
// license-checker-rseidelsohn の --onlyAllow は使っていない。--summary や
// --excludePrivatePackages / --excludePackages と併用すると判定が無効化され、
// 許可していないライセンスがあっても exit 0 になることを実測した（2026-08-10）。
// 落ちないゲートは無いのと同じなので、JSON出力を自分で検査する。

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ALLOWED = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
  "CC-BY-4.0",
  "BlueOak-1.0.0",
  "Python-2.0",
]);

// 選択制のデュアルライセンスは、許可済みの側を選べるなら通す。
const DUAL_LICENSE_SEPARATOR = /\s+OR\s+/;

// 末尾の "*" は license-checker が「package.json の license 欄ではなく
// LICENSE/README から推定した」ことを表す。ライセンス自体は許容範囲でも、
// 宣言されていない事実は見えるようにしておく。
const INFERRED_SUFFIX = "*";

const selfName = JSON.parse(readFileSync("package.json", "utf8")).name;

const isInferred = (license) => license.trimEnd().endsWith(INFERRED_SUFFIX);

const isAllowed = (license) => {
  const normalized = license.replace(/^\(|\)$/g, "").replace(/\*$/, "").trim();
  if (ALLOWED.has(normalized)) return true;
  const alternatives = normalized.split(DUAL_LICENSE_SEPARATOR);
  return alternatives.length > 1 && alternatives.some((one) => ALLOWED.has(one.trim()));
};

const licensesOf = (entry) =>
  Array.isArray(entry.licenses) ? entry.licenses : [entry.licenses ?? "UNKNOWN"];

const report = JSON.parse(
  execFileSync(
    "npx",
    ["--yes", "license-checker-rseidelsohn@4", "--production", "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ),
);

// 依存が1件も無い＝node_modules が入っていない状態。ここで通してしまうと
// 「検査したが何も無かった」と「検査できていない」を区別できない。
const MINIMUM_EXPECTED_PACKAGES = 50;
if (Object.keys(report).length < MINIMUM_EXPECTED_PACKAGES) {
  console.error(
    `依存が ${Object.keys(report).length} 件しか見つかりません。` +
      "npm ci を実行してから再度実行してください。",
  );
  process.exit(1);
}

// 自分自身は private: true のため UNLICENSED と報告される。判定対象から外す。
const violations = Object.entries(report)
  .filter(([id]) => !id.startsWith(`${selfName}@`))
  .flatMap(([id, entry]) =>
    licensesOf(entry)
      .filter((license) => !isAllowed(license))
      .map((license) => `${id}: ${license}`),
  );

const inferred = Object.entries(report)
  .filter(([id]) => !id.startsWith(`${selfName}@`))
  .flatMap(([id, entry]) => licensesOf(entry).filter(isInferred).map((l) => `${id}: ${l}`));

if (inferred.length > 0) {
  console.warn("ライセンスが package.json に宣言されておらず、ファイルから推定された依存:");
  inferred.forEach((line) => console.warn(`  ${line}`));
}

if (violations.length > 0) {
  console.error("許可していないライセンスの依存があります:");
  violations.forEach((line) => console.error(`  ${line}`));
  console.error("\n許可リストは scripts/check-licenses.mjs にあります。");
  process.exit(1);
}

console.log(`本番依存 ${Object.keys(report).length - 1} 件のライセンスはすべて許容範囲です。`);
