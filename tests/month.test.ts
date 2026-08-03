import { describe, expect, it } from "vitest";
import {
  addMonths,
  aggregateHoursByDay,
  getMonthGridDays,
  startOfMonth,
  toDateKey,
} from "@/lib/month";

describe("startOfMonth", () => {
  it("月の途中の日付を渡すとその月の1日0時を返す", () => {
    const mid = new Date(2026, 6, 22, 15, 30); // 2026-07-22
    const result = startOfMonth(mid);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });
});

describe("addMonths", () => {
  it("月を加算した新しいDateを返す（元は変更しない）", () => {
    const base = new Date(2026, 6, 1);
    const next = addMonths(base, 1);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(7);
    expect(base.getMonth()).toBe(6);
  });

  it("負数を渡すと過去の月に戻る（年跨ぎも正しく処理する）", () => {
    const base = new Date(2026, 0, 1); // 2026-01
    const prev = addMonths(base, -1);
    expect(prev.getFullYear()).toBe(2025);
    expect(prev.getMonth()).toBe(11);
  });
});

describe("toDateKey", () => {
  it("yyyy-MM-dd形式の文字列を返す", () => {
    expect(toDateKey(new Date(2026, 6, 5))).toBe("2026-07-05");
  });

  it("1桁の月・日をゼロパディングする", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("getMonthGridDays", () => {
  it("6週分(42日)の日付配列を返し、月曜始まりで当月の全日を含む", () => {
    const monthStart = startOfMonth(new Date(2026, 6, 22)); // 2026-07-01(水)
    const days = getMonthGridDays(monthStart);
    expect(days).toHaveLength(42);
    // 先頭は月曜であること
    expect(days[0]?.getDay()).toBe(1);
    // 当月の1日と末日を含む
    expect(days.some((d) => toDateKey(d) === "2026-07-01")).toBe(true);
    expect(days.some((d) => toDateKey(d) === "2026-07-31")).toBe(true);
  });

  it("グリッドの各日は前日と連続している", () => {
    const monthStart = startOfMonth(new Date(2026, 1, 1)); // 2026-02
    const days = getMonthGridDays(monthStart);
    for (let i = 1; i < days.length; i++) {
      const diffMs = days[i]!.getTime() - days[i - 1]!.getTime();
      expect(diffMs).toBe(24 * 3600_000);
    }
  });
});

describe("aggregateHoursByDay", () => {
  const now = new Date(2026, 6, 15, 12, 0);

  it("workタスクの実働時間を日付ごとに集計する", () => {
    const result = aggregateHoursByDay(
      [
        { startTime: new Date(2026, 6, 10, 9, 0), endTime: new Date(2026, 6, 10, 11, 0), type: "work" },
        { startTime: new Date(2026, 6, 10, 13, 0), endTime: new Date(2026, 6, 10, 14, 30), type: "work" },
      ],
      now,
    );
    expect(result.get("2026-07-10")).toBeCloseTo(3.5, 5);
  });

  it("breakタスクは集計から除外する", () => {
    const result = aggregateHoursByDay(
      [{ startTime: new Date(2026, 6, 10, 9, 0), endTime: new Date(2026, 6, 10, 10, 0), type: "break" }],
      now,
    );
    expect(result.has("2026-07-10")).toBe(false);
  });

  it("実行中タスク（endTime null）は現在時刻までの経過として集計する", () => {
    const result = aggregateHoursByDay(
      [{ startTime: new Date(2026, 6, 15, 10, 0), endTime: null, type: "work" }],
      now,
    );
    expect(result.get("2026-07-15")).toBeCloseTo(2, 5);
  });

  it("日をまたぐタスクは日ごとに分割して集計する", () => {
    const result = aggregateHoursByDay(
      [{ startTime: new Date(2026, 6, 10, 23, 0), endTime: new Date(2026, 6, 11, 1, 0), type: "work" }],
      now,
    );
    expect(result.get("2026-07-10")).toBeCloseTo(1, 5);
    expect(result.get("2026-07-11")).toBeCloseTo(1, 5);
  });

  it("空配列は空Mapを返す", () => {
    expect(aggregateHoursByDay([], now).size).toBe(0);
  });
});
