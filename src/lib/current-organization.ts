import { prisma } from "@/lib/db";

// TODO(docs/REQUIREMENTS.md §4.7): 複数組織に所属する場合の切替UI・セッションへの
// アクティブ組織の保持を実装する。現状は最初に見つかったMembershipを暫定的に採用する。
export async function getActiveMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}
