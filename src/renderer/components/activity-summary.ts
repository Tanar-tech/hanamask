export const STALE_THRESHOLD_DAYS = 3;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const STALE_THRESHOLD_MS = STALE_THRESHOLD_DAYS * DAY_MS;

const NO_RECORD_TEXT = "まだ記録がありません";
const JUST_NOW_TEXT = "たった今";
const SEPARATOR = " · ";

export interface ActivitySnapshot {
  readonly lastRecordedAt: string | null;
  readonly recentCount: number;
}

export interface ActivitySummary {
  readonly text: string;
  readonly highlight: boolean;
}

// 端末の時計がずれていると未来の日時が来るので、負の経過は0として扱う。
const elapsedMsSince = (lastRecordedMs: number, nowMs: number): number =>
  Math.max(nowMs - lastRecordedMs, 0);

const toElapsedText = (elapsedMs: number): string => {
  if (elapsedMs < MINUTE_MS) return JUST_NOW_TEXT;
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)} 分前`;
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)} 時間前`;
  return `${Math.floor(elapsedMs / DAY_MS)} 日前`;
};

const toStaleSummary = (elapsedMs: number): ActivitySummary => ({
  text: `${Math.floor(elapsedMs / DAY_MS)} 日間、記録がありません${SEPARATOR}最後の記録は ${toElapsedText(elapsedMs)}`,
  highlight: true,
});

const toActiveSummary = (elapsedMs: number, recentCount: number): ActivitySummary => ({
  text: `今週 ${recentCount} 件${SEPARATOR}最後の記録は ${toElapsedText(elapsedMs)}`,
  highlight: false,
});

/** ホーム画面の1行の状態表示。記録が続いているか途絶えているかを事実として述べる。 */
export const summarizeActivity = (
  { lastRecordedAt, recentCount }: ActivitySnapshot,
  nowMs: number,
): ActivitySummary => {
  const lastRecordedMs = lastRecordedAt === null ? Number.NaN : Date.parse(lastRecordedAt);
  if (Number.isNaN(lastRecordedMs)) return { text: NO_RECORD_TEXT, highlight: false };

  const elapsedMs = elapsedMsSince(lastRecordedMs, nowMs);
  return elapsedMs >= STALE_THRESHOLD_MS
    ? toStaleSummary(elapsedMs)
    : toActiveSummary(elapsedMs, recentCount);
};
