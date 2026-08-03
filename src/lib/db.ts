import { PrismaClient } from "@prisma/client";

// Next.js の開発サーバーはホットリロード時にモジュールを再評価するため、
// グローバルにキャッシュして PrismaClient の多重生成（コネクション枯渇）を防ぐ。
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
