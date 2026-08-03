import { describe, expect, it } from "vitest";
import {
  aggregateDurationByProject,
  endWork,
  InvalidTaskTransitionError,
  startBreak,
  switchTask,
  type ClosedTask,
} from "@/lib/task-timer";

describe("switchTask", () => {
  it("実行中タスクが無い場合、新しいタスクを開始するだけでcloseは発生しない", () => {
    const at = new Date("2026-07-23T09:00:00Z");
    const { closed, opened } = switchTask(null, { projectId: "p1", name: "設計" }, at);

    expect(closed).toBeNull();
    expect(opened).toEqual({ projectId: "p1", name: "設計", type: "work", startTime: at });
  });

  it("実行中タスクがある場合、切替時刻で前タスクを終了し次タスクを開始する", () => {
    const start = new Date("2026-07-23T09:00:00Z");
    const switchAt = new Date("2026-07-23T10:30:00Z");
    const current = { projectId: "p1", name: "設計", type: "work" as const, startTime: start };

    const { closed, opened } = switchTask(current, { projectId: "p2", name: "実装" }, switchAt);

    expect(closed).toEqual({ ...current, endTime: switchAt });
    expect(opened).toEqual({ projectId: "p2", name: "実装", type: "work", startTime: switchAt });
  });

  it("切替時刻が実行中タスクの開始時刻より前の場合はエラーになる", () => {
    const start = new Date("2026-07-23T09:00:00Z");
    const invalidAt = new Date("2026-07-23T08:00:00Z");
    const current = { projectId: "p1", name: "設計", type: "work" as const, startTime: start };

    expect(() => switchTask(current, { projectId: "p2", name: "実装" }, invalidAt)).toThrow(
      InvalidTaskTransitionError,
    );
  });

  it("タスク名が空文字の場合はエラーになる", () => {
    const at = new Date("2026-07-23T09:00:00Z");
    expect(() => switchTask(null, { projectId: "p1", name: "  " }, at)).toThrow(
      InvalidTaskTransitionError,
    );
  });
});

describe("startBreak", () => {
  it("実行中タスクを終了し、type=breakのタスクを開始する", () => {
    const start = new Date("2026-07-23T09:00:00Z");
    const breakAt = new Date("2026-07-23T12:00:00Z");
    const current = { projectId: "p1", name: "設計", type: "work" as const, startTime: start };

    const { closed, opened } = startBreak(current, breakAt);

    expect(closed?.endTime).toEqual(breakAt);
    expect(opened).toEqual({ projectId: null, name: "休憩", type: "break", startTime: breakAt });
  });
});

describe("endWork", () => {
  it("実行中タスクを終了時刻付きでクローズする", () => {
    const start = new Date("2026-07-23T09:00:00Z");
    const endAt = new Date("2026-07-23T18:00:00Z");
    const current = { projectId: "p1", name: "設計", type: "work" as const, startTime: start };

    const closed = endWork(current, endAt);

    expect(closed).toEqual({ ...current, endTime: endAt });
  });

  it("実行中タスクが無い場合はエラーになる", () => {
    expect(() => endWork(null, new Date())).toThrow(InvalidTaskTransitionError);
  });
});

describe("aggregateDurationByProject", () => {
  it("workタイプのみをプロジェクト単位で合算し、breakは含めない", () => {
    const tasks: ClosedTask[] = [
      {
        projectId: "p1",
        name: "設計",
        type: "work",
        startTime: new Date("2026-07-23T09:00:00Z"),
        endTime: new Date("2026-07-23T10:00:00Z"),
      },
      {
        projectId: "p1",
        name: "レビュー",
        type: "work",
        startTime: new Date("2026-07-23T11:00:00Z"),
        endTime: new Date("2026-07-23T11:30:00Z"),
      },
      {
        projectId: null,
        name: "休憩",
        type: "break",
        startTime: new Date("2026-07-23T10:00:00Z"),
        endTime: new Date("2026-07-23T11:00:00Z"),
      },
    ];

    const result = aggregateDurationByProject(tasks);

    expect(result.get("p1")).toBe(90 * 60 * 1000);
    expect(result.has("__no_project__")).toBe(false);
  });
});
