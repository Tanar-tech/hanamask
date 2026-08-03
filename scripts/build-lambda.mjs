// AWS Lambda用バックエンドバンドルを dist/lambda/ に生成する（docs/AWS.md）。
// - src/server/lambda.ts を esbuild で単一ファイルにバンドルする
// - @prisma/client は実行時に生成物（node_modules/.prisma）を参照するため外部化し、
//   生成済みクライアントごと dist/lambda/node_modules/ に同梱する
// - Windows用クエリエンジン（*.dll.node）はLambdaでは不要なので除外して容量を抑える
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "dist", "lambda");

// Lambda用エンジン（rhel-openssl-3.0.x, prisma/schema.prisma の binaryTargets）を確実に含める
const generate = spawnSync("npx", ["prisma", "generate"], {
  cwd: root,
  shell: true,
  stdio: "inherit",
});
if (generate.status !== 0) {
  console.error("prisma generate に失敗しました。");
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });

await build({
  entryPoints: [path.join(root, "src", "server", "lambda.ts")],
  outfile: path.join(outDir, "index.js"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  sourcemap: false,
  minify: false,
  external: ["@prisma/client"],
});

const isWindowsEngine = (src) => path.basename(src).includes("query_engine-windows");
for (const moduleDir of [
  path.join("node_modules", ".prisma"),
  path.join("node_modules", "@prisma", "client"),
]) {
  cpSync(path.join(root, moduleDir), path.join(outDir, moduleDir), {
    recursive: true,
    filter: (src) => !isWindowsEngine(src),
  });
}

console.log(`Lambda bundle: ${outDir}`);
