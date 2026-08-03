// タスクの開始・切替・休憩・終業の中核ロジック（docs/REQUIREMENTS.md §3, §4.1）。
// DB・フレームワークに依存しない純粋関数として実装し、単体テストで挙動を保証する。

export type TaskType = "work" | "break";

export interface OpenTask {
  projectId: string | null;
  name: string;
  type: TaskType;
  startTime: Date;
}

export interface ClosedTask extends OpenTask {
  endTime: Date;
}

export interface TaskInput {
  projectId: string | null;
  name: string;
  type?: TaskType;
}

export class InvalidTaskTransitionError extends Error {}

function assertMonotonic(current: OpenTask, at: Date): void {
  if (at.getTime() < current.startTime.getTime()) {
    throw new InvalidTaskTransitionError(
      "新しいタスクの開始時刻は、実行中タスクの開始時刻より前にできません。",
    );
  }
}

/**
 * 実行中タスクを `at` で終了し、新しいタスクを `at` から開始する。
 * 実行中タスクが無い場合は単に新しいタスクを開始する（closedはnull）。
 */
export function switchTask(
  current: OpenTask | null,
  next: TaskInput,
  at: Date,
): { closed: ClosedTask | null; opened: OpenTask } {
  if (next.name.trim().length === 0) {
    throw new InvalidTaskTransitionError("タスク名は必須です。");
  }

  let closed: ClosedTask | null = null;
  if (current) {
    assertMonotonic(current, at);
    closed = { ...current, endTime: at };
  }

  const opened: OpenTask = {
    projectId: next.projectId,
    name: next.name,
    type: next.type ?? "work",
    startTime: at,
  };

  return { closed, opened };
}

/** 休憩を開始する（実行中タスクを終了し、休憩を開始する）。 */
export function startBreak(
  current: OpenTask | null,
  at: Date,
  breakName = "休憩",
): { closed: ClosedTask | null; opened: OpenTask } {
  return switchTask(current, { projectId: null, name: breakName, type: "break" }, at);
}

/** 終業する（実行中タスク/休憩を終了し、以降タスクは無い状態にする）。 */
export function endWork(current: OpenTask | null, at: Date): ClosedTask {
  if (!current) {
    throw new InvalidTaskTransitionError("実行中のタスクがないため終業できません。");
  }
  assertMonotonic(current, at);
  return { ...current, endTime: at };
}

/** 期間内に収まる部分（分単位ミリ秒）を、プロジェクトごとに集計する。 */
export function aggregateDurationByProject(
  tasks: ClosedTask[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const task of tasks) {
    if (task.type !== "work") continue;
    const key = task.projectId ?? "__no_project__";
    const durationMs = task.endTime.getTime() - task.startTime.getTime();
    result.set(key, (result.get(key) ?? 0) + durationMs);
  }
  return result;
}
