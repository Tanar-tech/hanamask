// 週次カレンダーのドメインロジック（SPEC.md セットA）。
// DB・フレームワークに依存しない純粋関数として実装し、単体テストで挙動を保証する。

/** 月曜始まりでその週の月曜0:00（ローカル時刻）を返す。 */
export function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay(): 日曜=0, 月曜=1, ... 土曜=6 → 月曜からの経過日数に変換
  const daysFromMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysFromMonday);
  return result;
}

/** 日数を加算した新しいDateを返す（元のDateは変更しない）。 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export interface LayoutInput {
  id: string;
  startMs: number;
  endMs: number;
}

export interface LanePosition {
  lane: number;
  laneCount: number;
}

/**
 * 同一日のタスク群にレーン（横位置）を割り当てる。
 * 時間帯が重なるタスク同士は別レーンに分け、重なりが連鎖するクラスタ内では
 * laneCount（分割数）を共有する。空いたレーンは再利用する（Outlook週表示方式）。
 */
export function layoutDayTasks(tasks: LayoutInput[]): Map<string, LanePosition> {
  const result = new Map<string, LanePosition>();
  if (tasks.length === 0) return result;

  // 長さ0のタスクは最小1msとして扱い、開始時刻順（同時刻なら長い方が先）に並べる
  const sorted = tasks
    .map((t) => ({ ...t, endMs: Math.max(t.endMs, t.startMs + 1) }))
    .sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs);

  // クラスタ = 重なりが連鎖する一続きのタスク群
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = []; // 各レーンの最終終了時刻
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    for (const item of cluster) {
      result.set(item.id, { lane: item.lane, laneCount: laneEnds.length });
    }
    cluster = [];
    laneEnds = [];
  };

  for (const task of sorted) {
    if (task.startMs >= clusterEnd) {
      flushCluster();
      clusterEnd = task.endMs;
    } else {
      clusterEnd = Math.max(clusterEnd, task.endMs);
    }

    let lane = laneEnds.findIndex((end) => end <= task.startMs);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(task.endMs);
    } else {
      laneEnds[lane] = task.endMs;
    }
    cluster.push({ id: task.id, lane });
  }
  flushCluster();

  return result;
}

export type TaskEditValidation = { ok: true } | { ok: false; error: string };

/** タスク編集内容のバリデーション（API・UI共通）。 */
export function validateTaskEdit(input: {
  name: string;
  startTime: Date;
  endTime: Date | null;
}): TaskEditValidation {
  if (input.name.trim().length === 0) {
    return { ok: false, error: "タスク名は必須です。" };
  }
  if (Number.isNaN(input.startTime.getTime())) {
    return { ok: false, error: "開始日時が不正です。" };
  }
  if (input.endTime !== null) {
    if (Number.isNaN(input.endTime.getTime())) {
      return { ok: false, error: "終了日時が不正です。" };
    }
    if (input.endTime.getTime() <= input.startTime.getTime()) {
      return { ok: false, error: "終了日時は開始日時より後にしてください。" };
    }
  }
  return { ok: true };
}
