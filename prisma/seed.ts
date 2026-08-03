// ローカル動作確認用のサンプルデータ投入（scripts/dev.ps1 から呼ばれる）。
// 冪等: 既にデモユーザーが存在する場合は何もしない。
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_EMAIL = "admin@example.com";
const DEMO_PASSWORD = "password123"; // ローカル確認専用。本番では使用しない

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log(`デモユーザー (${DEMO_EMAIL}) は既に存在します。スキップします。`);
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "デモ管理者",
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

  const membership = user.memberships[0];
  if (!membership) throw new Error("membership creation failed");
  const organizationId = membership.organizationId;

  const [dev, meeting] = await Promise.all([
    prisma.project.create({
      data: { organizationId, name: "開発", color: "#6366f1" },
    }),
    prisma.project.create({
      data: { organizationId, name: "会議", color: "#f59e0b" },
    }),
  ]);

  // 昨日の作業履歴（タイムライン表示・集計の確認用）
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(9, 0, 0, 0);

  const at = (h: number, m = 0) => {
    const d = new Date(yesterday);
    d.setHours(h, m, 0, 0);
    return d;
  };

  await prisma.task.createMany({
    data: [
      { organizationId, userId: user.id, projectId: dev.id, name: "機能実装", type: "work", startTime: at(9), endTime: at(12) },
      { organizationId, userId: user.id, projectId: null, name: "休憩", type: "break", startTime: at(12), endTime: at(13) },
      { organizationId, userId: user.id, projectId: meeting.id, name: "定例会議", type: "work", startTime: at(13), endTime: at(14) },
      { organizationId, userId: user.id, projectId: dev.id, name: "コードレビュー", type: "work", startTime: at(14), endTime: at(18) },
    ],
  });

  console.log("サンプルデータを投入しました:");
  console.log(`  ログイン: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("  組織: デモ組織 / プロジェクト: 開発, 会議 / 昨日分のタスク履歴4件");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
