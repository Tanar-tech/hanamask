import { getDb } from "./db.js";

/*
 * ホーム画面で「記録が途絶えていないか」を示すための集計。作成も更新も等しく「記録した」
 * とみなしたいので created_at ではなく updated_at を見る。ゴミ箱に入れたものを数えると、
 * 消しただけで書き続けているように見えてしまうため除外する。
 */

export interface Activity {
  lastRecordedAt: string | null;
  recentCount: number;
}

const RECENT_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// updated_at は常に new Date().toISOString() で書かれる固定長のUTC表記なので、文字列比較が時刻比較になる。
const LIVE_TIMESTAMPS = `
  SELECT updated_at FROM notes WHERE deleted_at IS NULL
  UNION ALL
  SELECT updated_at FROM tasks WHERE deleted_at IS NULL
`;

const isLastRow = (value: unknown): value is { last: string | null } => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return row.last === null || typeof row.last === "string";
};

const isCountRow = (value: unknown): value is { total: number } => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return typeof row.total === "number";
};

const readLastRecordedAt = (): string | null => {
  const row: unknown = getDb()
    .prepare(`SELECT MAX(updated_at) AS last FROM (${LIVE_TIMESTAMPS})`)
    .get();
  if (!isLastRow(row)) throw new Error("Unexpected row shape while reading last recorded time");
  return row.last;
};

const countRecent = (since: string): number => {
  const row: unknown = getDb()
    .prepare(`SELECT COUNT(*) AS total FROM (${LIVE_TIMESTAMPS}) WHERE updated_at >= ?`)
    .get(since);
  if (!isCountRow(row)) throw new Error("Unexpected row shape while counting recent records");
  return row.total;
};

export const readActivity = (now: Date): Activity => {
  const since = new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY).toISOString();
  return { lastRecordedAt: readLastRecordedAt(), recentCount: countRecent(since) };
};
