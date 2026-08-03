// 月次カレンダーのドメインロジック（SPEC.md セットB、docs/REQUIREMENTS.md §4.3）。
// DB・フレームワークに依存しない純粋関数として実装し、単体テストで挙動を保証する。
// 日付操作は src/lib/week.ts のパターン（月曜始まり・ローカル時刻）を踏襲する。

import { addDays, startOfWeek } from "@/lib/week";

const DAY_MS = 24 * 3600_000;
const GRID_WEEKS = 6;

/** 指定日が属する月の1日0時（ローカル時刻）を返す。 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** 月数を加算した新しいDateを返す（元のDateは変更しない）。 */
export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** Date → "yyyy-MM-dd" 形式のキー文字列に変換する。 */
export function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 月表示カレンダーのグリッド用に、6週間(42日)分の日付配列を返す。
 * 当月の1日を含む週の月曜から6週分を並べるため、前月・翌月の日を含むことがある。
 */
export function getMonthGridDays(monthStart: Date): Date[] {
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: GRID_WEEKS * 7 }, (_, i) => addDays(gridStart, i));
}

export interface HourAggregationInput {
  startTime: Date;
  endTime: Date | null;
  type: string;
}

/**
 * タスク群を日付キーごとの実働時間（時間単位）に集計する。
 * 休憩（type !== "work"）は除外し、実行中タスク（endTime === null）は
 * `now` までの経過時間として扱う。日をまたぐタスクは日ごとに分割して按分する。
 */
export function aggregateHoursByDay(tasks: HourAggregationInput[], now: Date): Map<string, number> {
  const result = new Map<string, number>();
  for (const task of tasks) {
    if (task.type !== "work") continue;
    const start = task.startTime.getTime();
    const end = (task.endTime ?? now).getTime();
    if (end <= start) continue;

    let cursor = start;
    while (cursor < end) {
      const dayStart = new Date(cursor);
      dayStart.setHours(0, 0, 0, 0);
      const nextDayStart = dayStart.getTime() + DAY_MS;
      const segmentEnd = Math.min(end, nextDayStart);
      const key = toDateKey(dayStart);
      const hours = (segmentEnd - cursor) / 3600_000;
      result.set(key, (result.get(key) ?? 0) + hours);
      cursor = segmentEnd;
    }
  }
  return result;
}
