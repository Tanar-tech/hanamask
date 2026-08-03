// 工数集計ダッシュボードのドメインロジック（SPEC.md Set D、docs/REQUIREMENTS.md §4.5）。
// DB・フレームワークに依存しない純粋関数として実装し、単体テストで挙動を保証する。
// src/lib/task-timer.ts の aggregateDurationByProject（休憩除外・type='work'限定の集計）と
// 同じ考え方に、日/週/月の期間算出とクリッピングを加えたもの。

export type Granularity = "day" | "week" | "month";

export interface AggregationTask {
  projectId: string | null;
  type: "work" | "break";
  startTime: Date;
  endTime: Date | null;
}

export interface ProjectDuration {
  projectId: string | null;
  durationMs: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * 粒度と基準日から集計対象期間 [start, end) を返す。
 * day: 基準日の0:00〜翌日0:00 / week: 基準日を含む週の月曜0:00〜翌週月曜0:00（月曜始まり）
 * month: 基準日を含む月の1日0:00〜翌月1日0:00
 */
export function getRangeForGranularity(granularity: Granularity, reference: Date): DateRange {
  if (granularity === "day") {
    const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  if (granularity === "week") {
    const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
    // getDay(): 日曜=0, 月曜=1, ... 土曜=6 → 月曜からの経過日数に変換（src/lib/week.ts と同じ方式）
    const daysFromMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysFromMonday);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  return { start, end };
}

/**
 * タスク群を、プロジェクトごとの実働時間合計(ms)に集計する。
 * - type='work' のみ対象（休憩は除外）
 * - endTime が null（実行中）のタスクは `now` までの経過時間として計算する
 * - `range` を指定すると、範囲外にはみ出す部分を切り捨てて集計する
 *   （範囲に一部だけ重なるタスクの重なり分のみをカウントするため）
 */
export function aggregateByProject(
  tasks: AggregationTask[],
  now: Date,
  range?: DateRange,
): ProjectDuration[] {
  const totals = new Map<string, number>();

  for (const task of tasks) {
    if (task.type !== "work") continue;

    const rawStart = task.startTime.getTime();
    const rawEnd = (task.endTime ?? now).getTime();
    const start = range ? Math.max(rawStart, range.start.getTime()) : rawStart;
    const end = range ? Math.min(rawEnd, range.end.getTime()) : rawEnd;

    const durationMs = Math.max(0, end - start);
    if (durationMs === 0) continue;

    const key = task.projectId ?? "__no_project__";
    totals.set(key, (totals.get(key) ?? 0) + durationMs);
  }

  return Array.from(totals.entries()).map(([key, durationMs]) => ({
    projectId: key === "__no_project__" ? null : key,
    durationMs,
  }));
}

/** 集計結果全体の合計実働時間(ms)。 */
export function totalDurationMs(durations: ProjectDuration[]): number {
  return durations.reduce((sum, d) => sum + d.durationMs, 0);
}
