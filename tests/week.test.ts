import { describe, expect, it } from "vitest";
import {
  addDays,
  layoutDayTasks,
  startOfWeek,
  validateTaskEdit,
} from "@/lib/week";

describe("startOfWeek", () => {
  it("水曜日を渡すと同じ週の月曜0時を返す", () => {
    const wed = new Date(2026, 6, 22, 15, 30); // 2026-07-22(水)
    const monday = startOfWeek(wed);
    expect(monday.getFullYear()).toBe(2026);
    expect(monday.getMonth()).toBe(6);
    expect(monday.getDate()).toBe(20); // 2026-07-20(月)
    expect(monday.getHours()).toBe(0);
    expect(monday.getMinutes()).toBe(0);
  });

  it("日曜日を渡すと前の月曜を返す（週は月曜始まり）", () => {
    const sun = new Date(2026, 6, 26, 9, 0); // 2026-07-26(日)
    const monday = startOfWeek(sun);
    expect(monday.getDate()).toBe(20);
  });

  it("月曜日を渡すとその日の0時を返す", () => {
    const mon = new Date(2026, 6, 20, 23, 59);
    const monday = startOfWeek(mon);
    expect(monday.getDate()).toBe(20);
    expect(monday.getHours()).toBe(0);
  });
});

describe("addDays", () => {
  it("日数を加算した新しいDateを返す（元は変更しない）", () => {
    const base = new Date(2026, 6, 20);
    const next = addDays(base, 7);
    expect(next.getDate()).toBe(27);
    expect(base.getDate()).toBe(20);
  });
});

describe("layoutDayTasks", () => {
  const t = (id: string, startH: number, endH: number) => ({
    id,
    startMs: startH * 3600_000,
    endMs: endH * 3600_000,
  });

  it("重ならないタスクは全てlane=0, laneCount=1", () => {
    const result = layoutDayTasks([t("a", 9, 10), t("b", 10, 11), t("c", 13, 14)]);
    for (const id of ["a", "b", "c"]) {
      expect(result.get(id)).toEqual({ lane: 0, laneCount: 1 });
    }
  });

  it("重なる2タスクは別レーンに分かれlaneCount=2", () => {
    const result = layoutDayTasks([t("a", 9, 11), t("b", 10, 12)]);
    expect(result.get("a")).toEqual({ lane: 0, laneCount: 2 });
    expect(result.get("b")).toEqual({ lane: 1, laneCount: 2 });
  });

  it("連鎖的に重なるクラスタはクラスタ内で同じlaneCountを共有し、空いたレーンを再利用する", () => {
    // a(9-11) と b(10-12) が重なり、c(11-13) は b とのみ重なる → aのレーンを再利用
    const result = layoutDayTasks([t("a", 9, 11), t("b", 10, 12), t("c", 11, 13)]);
    expect(result.get("a")).toEqual({ lane: 0, laneCount: 2 });
    expect(result.get("b")).toEqual({ lane: 1, laneCount: 2 });
    expect(result.get("c")).toEqual({ lane: 0, laneCount: 2 });
  });

  it("長さ0のタスクも配置できる（最小幅として扱う）", () => {
    const result = layoutDayTasks([t("a", 9, 9)]);
    expect(result.get("a")).toEqual({ lane: 0, laneCount: 1 });
  });

  it("空配列は空Mapを返す", () => {
    expect(layoutDayTasks([]).size).toBe(0);
  });
});

describe("validateTaskEdit", () => {
  it("正常な入力はokを返す", () => {
    const result = validateTaskEdit({
      name: "設計",
      startTime: new Date("2026-07-23T09:00:00Z"),
      endTime: new Date("2026-07-23T10:00:00Z"),
    });
    expect(result.ok).toBe(true);
  });

  it("空のタスク名はエラー", () => {
    const result = validateTaskEdit({
      name: "  ",
      startTime: new Date("2026-07-23T09:00:00Z"),
      endTime: new Date("2026-07-23T10:00:00Z"),
    });
    expect(result.ok).toBe(false);
  });

  it("終了時刻が開始時刻以前ならエラー", () => {
    const result = validateTaskEdit({
      name: "設計",
      startTime: new Date("2026-07-23T10:00:00Z"),
      endTime: new Date("2026-07-23T10:00:00Z"),
    });
    expect(result.ok).toBe(false);
  });

  it("終了時刻null（実行中タスク）は許容する", () => {
    const result = validateTaskEdit({
      name: "設計",
      startTime: new Date("2026-07-23T09:00:00Z"),
      endTime: null,
    });
    expect(result.ok).toBe(true);
  });

  it("不正な日付はエラー", () => {
    const result = validateTaskEdit({
      name: "設計",
      startTime: new Date("invalid"),
      endTime: null,
    });
    expect(result.ok).toBe(false);
  });
});
