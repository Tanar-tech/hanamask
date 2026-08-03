import { describe, expect, it } from "vitest";
import {
  aggregateByProject,
  getRangeForGranularity,
  totalDurationMs,
  type AggregationTask,
} from "@/lib/aggregation";

describe("getRangeForGranularity", () => {
  it("day: 基準日の0:00〜翌日0:00を返す", () => {
    const ref = new Date(2026, 6, 22, 15, 30); // 2026-07-22(水) 15:30
    const { start, end } = getRangeForGranularity("day", ref);
    expect(start).toEqual(new Date(2026, 6, 22, 0, 0));
    expect(end).toEqual(new Date(2026, 6, 23, 0, 0));
  });

  it("week: 基準日を含む週の月曜0:00〜翌週月曜0:00を返す", () => {
    const ref = new Date(2026, 6, 22, 15, 30); // 水曜
    const { start, end } = getRangeForGranularity("week", ref);
    expect(start).toEqual(new Date(2026, 6, 20, 0, 0)); // 月曜
    expect(end).toEqual(new Date(2026, 6, 27, 0, 0));
  });

  it("week: 日曜日を渡しても同じ週の月曜が起点になる", () => {
    const ref = new Date(2026, 6, 26, 9, 0); // 日曜
    const { start } = getRangeForGranularity("week", ref);
    expect(start).toEqual(new Date(2026, 6, 20, 0, 0));
  });

  it("month: 基準日を含む月の1日0:00〜翌月1日0:00を返す", () => {
    const ref = new Date(2026, 6, 22, 15, 30);
    const { start, end } = getRangeForGranularity("month", ref);
    expect(start).toEqual(new Date(2026, 6, 1, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 1, 0, 0));
  });
});

describe("aggregateByProject", () => {
  const now = new Date(2026, 6, 22, 12, 0);

  it("type='work'のみ集計し、休憩(type='break')は除外する", () => {
    const tasks: AggregationTask[] = [
      { projectId: "p1", type: "work", startTime: new Date(2026, 6, 22, 9, 0), endTime: new Date(2026, 6, 22, 10, 0) },
      { projectId: "p1", type: "break", startTime: new Date(2026, 6, 22, 10, 0), endTime: new Date(2026, 6, 22, 10, 30) },
    ];
    const result = aggregateByProject(tasks, now);
    expect(result).toEqual([{ projectId: "p1", durationMs: 3600_000 }]);
  });

  it("実行中タスク(endTime=null)はnowまでの経過時間として計算する", () => {
    const tasks: AggregationTask[] = [
      { projectId: "p1", type: "work", startTime: new Date(2026, 6, 22, 11, 0), endTime: null },
    ];
    const result = aggregateByProject(tasks, now);
    expect(result).toEqual([{ projectId: "p1", durationMs: 3600_000 }]);
  });

  it("プロジェクト未設定タスクはprojectId: nullで集計する", () => {
    const tasks: AggregationTask[] = [
      { projectId: null, type: "work", startTime: new Date(2026, 6, 22, 9, 0), endTime: new Date(2026, 6, 22, 9, 30) },
    ];
    const result = aggregateByProject(tasks, now);
    expect(result).toEqual([{ projectId: null, durationMs: 1800_000 }]);
  });

  it("複数プロジェクトを合算する", () => {
    const tasks: AggregationTask[] = [
      { projectId: "p1", type: "work", startTime: new Date(2026, 6, 22, 9, 0), endTime: new Date(2026, 6, 22, 10, 0) },
      { projectId: "p2", type: "work", startTime: new Date(2026, 6, 22, 10, 0), endTime: new Date(2026, 6, 22, 10, 30) },
      { projectId: "p1", type: "work", startTime: new Date(2026, 6, 22, 11, 0), endTime: new Date(2026, 6, 22, 11, 15) },
    ];
    const result = aggregateByProject(tasks, now);
    expect(result).toEqual(
      expect.arrayContaining([
        { projectId: "p1", durationMs: 3600_000 + 900_000 },
        { projectId: "p2", durationMs: 1800_000 },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it("rangeを指定すると範囲外にはみ出す部分を切り捨てる", () => {
    const range = { start: new Date(2026, 6, 22, 0, 0), end: new Date(2026, 6, 23, 0, 0) };
    const tasks: AggregationTask[] = [
      // 前日23:00〜当日1:00 → 当日分の1時間のみカウント
      { projectId: "p1", type: "work", startTime: new Date(2026, 6, 21, 23, 0), endTime: new Date(2026, 6, 22, 1, 0) },
    ];
    const result = aggregateByProject(tasks, now, range);
    expect(result).toEqual([{ projectId: "p1", durationMs: 3600_000 }]);
  });

  it("空配列は空配列を返す", () => {
    expect(aggregateByProject([], now)).toEqual([]);
  });
});

describe("totalDurationMs", () => {
  it("全プロジェクトの合計を返す", () => {
    const total = totalDurationMs([
      { projectId: "p1", durationMs: 1000 },
      { projectId: "p2", durationMs: 2000 },
    ]);
    expect(total).toBe(3000);
  });

  it("空配列は0を返す", () => {
    expect(totalDurationMs([])).toBe(0);
  });
});
