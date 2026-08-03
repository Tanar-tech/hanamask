// DBマイグレーション用Lambdaバンドルを dist/migrate/ に生成する（docs/AWS.md §4）。
// Lambda上で `prisma migrate deploy` を実行するため、prisma CLI・スキーマ・
// マイグレーションSQL一式を同梱する。
// - PRISMA_CLI_BINARY_TARGETS で Lambda(AL2023) 用スキーマエンジンを取得する
// - 本番用バンドルはGitHub Actions(ubuntu)上でビルドする。Windowsでのローカルビルドは
//   synth用途には使えるが、実行権限ビットが失われるためデプロイには使わないこと。
//
// 2つのハンドラを同梱する（docs/AWS.md、PRプレビュー環境で使用）:
//   index.handler       … スキーマ作成（PRプレビューのpr_N等）+ prisma migrate deploy
//   dropschema.handler  … 指定スキーマを DROP SCHEMA ... CASCADE（PRクローズ時の後始末・共有Lambda）
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "dist", "migrate");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const rootPackage = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const prismaVersion = rootPackage.devDependencies.prisma;

writeFileSync(
  path.join(outDir, "package.json"),
  JSON.stringify(
    { name: "work-manager-migrate", private: true, dependencies: { prisma: prismaVersion } },
    null,
    2,
  ),
);

const install = spawnSync(
  "npm",
  ["install", "--omit=dev", "--no-package-lock", "--no-audit", "--no-fund"],
  {
    cwd: outDir,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, PRISMA_CLI_BINARY_TARGETS: "rhel-openssl-3.0.x" },
  },
);
if (install.status !== 0) {
  console.error("prisma CLIのインストールに失敗しました。");
  process.exit(1);
}

cpSync(path.join(root, "prisma", "schema.prisma"), path.join(outDir, "prisma", "schema.prisma"));
// prisma/migrations はアプリ仕様確定前は存在しない場合がある（`prisma migrate dev` 未実行）。
// その場合は空ディレクトリを用意する（migrate deployはマイグレーション0件でも成功する）。
const migrationsDir = path.join(root, "prisma", "migrations");
if (existsSync(migrationsDir)) {
  cpSync(migrationsDir, path.join(outDir, "prisma", "migrations"), { recursive: true });
} else {
  mkdirSync(path.join(outDir, "prisma", "migrations"), { recursive: true });
}

// シード（seedData）が使う @prisma/client（生成済みクライアント）と bcryptjs を同梱する。
// prisma本体と違いnpm installでは入らないため、ルートのnode_modules（事前に`npx prisma generate`
// 済みの前提。build-lambda.mjsと同じ方式）からコピーする。Windows用エンジンはLambdaで不要なので除外。
const isWindowsEngine = (src) => path.basename(src).includes("query_engine-windows");
for (const moduleDir of [
  path.join("node_modules", ".prisma"),
  path.join("node_modules", "@prisma", "client"),
  path.join("node_modules", "bcryptjs"),
]) {
  const src = path.join(root, moduleDir);
  if (!existsSync(src)) {
    console.error(`${moduleDir} が見つかりません。事前に \`npx prisma generate\` と \`npm ci\` を実行してください。`);
    process.exit(1);
  }
  cpSync(src, path.join(outDir, moduleDir), {
    recursive: true,
    filter: (s) => !isWindowsEngine(s),
  });
}

// 両ハンドラで共有するランタイムヘルパ。/var/task は読み取り専用のため書き込みは /tmp に向ける。
// CHECKPOINT_DISABLE: VPC内(外部通信不可)でprismaのテレメトリ送信がハングしないようにする。
const runtimeHelpers = `const { spawnSync } = require("node:child_process");
const path = require("node:path");

const PRISMA_CLI = path.join(__dirname, "node_modules", "prisma", "build", "index.js");
const SCHEMA_PATH = path.join(__dirname, "prisma", "schema.prisma");
const PRISMA_ENV = {
  HOME: "/tmp",
  XDG_CACHE_HOME: "/tmp/.cache",
  CHECKPOINT_DISABLE: "1",
  PRISMA_HIDE_UPDATE_MESSAGE: "1",
};

// スキーマ名は \`pr_<数字>\` または \`public\` のみ許可する（SQLインジェクション・誤削除防止）。
function assertSafeSchema(name) {
  if (!/^(public|pr_[0-9]+)$/.test(name)) {
    throw new Error("unsafe schema name: " + JSON.stringify(name));
  }
}

// DATABASE_URL のクエリ \`schema=...\` を取り出す（未指定なら public）。
function schemaFromDatabaseUrl(url) {
  const match = /[?&]schema=([^&]+)/.exec(url || "");
  return match ? decodeURIComponent(match[1]) : "public";
}

function runPrisma(args, input) {
  const result = spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: __dirname,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    input,
    env: { ...process.env, ...PRISMA_ENV },
  });
  const output = ((result.stdout || "") + "\\n" + (result.stderr || "")).trim();
  console.log(args.join(" ") + " ->\\n" + output);
  if (result.status !== 0) {
    throw new Error(
      "prisma " + args[0] + " failed (exit " + result.status + "): " + output.slice(-3000),
    );
  }
  return output;
}
`;

// index.handler: 対象スキーマ（DATABASE_URLのschema）を作成してから migrate deploy を実行する。
// イベントに seed: true があれば、マイグレーション後にシードを実行する。
const migrateHandler =
  runtimeHelpers +
  `
const fs = require("fs");

async function seedData(url, schema) {
  const { PrismaClient } = require("@prisma/client");
  const bcrypt = require("bcryptjs");

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const DEMO_EMAIL = "admin@example.com";
  const DEMO_PASSWORD = "password123";

  try {
    const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (existing) {
      console.log(\`デモユーザー (\${DEMO_EMAIL}) は既に存在します\`);
      return;
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        name: "デモユーザー",
        passwordHash,
        memberships: {
          create: {
            role: "admin",
            organization: { create: { name: "デモ組織" } },
          },
        },
      },
      include: { memberships: true },
    });

    const organizationId = user.memberships[0].organizationId;
    const [dev, meeting] = await Promise.all([
      prisma.project.create({
        data: { organizationId, name: "開発", color: "#6366f1" },
      }),
      prisma.project.create({
        data: { organizationId, name: "会議", color: "#f59e0b" },
      }),
    ]);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(9, 0, 0, 0);
    const at = (h, m = 0) => { const d = new Date(yesterday); d.setHours(h, m); return d; };

    await prisma.task.createMany({
      data: [
        { organizationId, userId: user.id, projectId: dev.id, name: "機能実装", type: "work", startTime: at(9), endTime: at(12) },
        { organizationId, userId: user.id, projectId: null, name: "休憩", type: "break", startTime: at(12), endTime: at(13) },
        { organizationId, userId: user.id, projectId: meeting.id, name: "定例会議", type: "work", startTime: at(13), endTime: at(14) },
        { organizationId, userId: user.id, projectId: dev.id, name: "コードレビュー", type: "work", startTime: at(14), endTime: at(18) },
      ],
    });

    console.log("シードデータを投入しました:");
    console.log(\`  ログイン: \${DEMO_EMAIL} / \${DEMO_PASSWORD}\`);
  } finally {
    await prisma.$disconnect();
  }
}

exports.handler = async (event) => {
  const url = process.env.DATABASE_URL || "";
  const schema = schemaFromDatabaseUrl(url);
  assertSafeSchema(schema);

  if (schema !== "public") {
    runPrisma(
      ["db", "execute", "--url", url, "--stdin"],
      'CREATE SCHEMA IF NOT EXISTS "' + schema + '";',
    );
  }

  const output = runPrisma(["migrate", "deploy", "--schema", SCHEMA_PATH]);

  if (event && event.seed) {
    try {
      await seedData(url, schema);
    } catch (e) {
      console.warn("seed failed but continuing:", e.message);
    }
  }

  return { ok: true, schema, output: output.slice(-3000) };
};
`;
writeFileSync(path.join(outDir, "index.js"), migrateHandler);

// dropschema.handler: イベントの schema を DROP SCHEMA ... CASCADE で破棄する（共有Lambda・PRクローズ時）。
// DATABASE_URL は接続用（publicスキーマ）。破棄対象はイベントで受け取る。
const dropSchemaHandler =
  runtimeHelpers +
  `
exports.handler = async (event) => {
  const schema = (event && event.schema) || "";
  assertSafeSchema(schema);
  if (schema === "public") {
    throw new Error("refusing to drop the public schema");
  }
  const output = runPrisma(
    ["db", "execute", "--url", process.env.DATABASE_URL, "--stdin"],
    'DROP SCHEMA IF EXISTS "' + schema + '" CASCADE;',
  );
  return { ok: true, schema, output: output.slice(-3000) };
};
`;
writeFileSync(path.join(outDir, "dropschema.js"), dropSchemaHandler);

console.log(`Migration Lambda bundle: ${outDir}`);
