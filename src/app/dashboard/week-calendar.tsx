"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project, Task } from "@prisma/client";
import { addDays, layoutDayTasks, startOfWeek, type LayoutInput } from "@/lib/week";
import { TaskEditDialog } from "./task-edit-dialog";

interface Props {
  projects: Project[];
  hiddenProjectIds: Set<string>;
  onProjectCreated: (project: Project) => void;
  /** TaskPanel側の操作（開始/切替/休憩/終業）後にインクリメントされる。変化を検知して再取得する（/goal指示）。 */
  refreshKey: number;
  /** 詳細ダイアログでの完了/編集/削除を親（page.tsx）へ通知し、実行中タスク表示側と同期させる（/goal指示）。 */
  onTaskMutated: (nextOpenTask?: Task | null) => void;
}

const HOUR_HEIGHT = 48; // px/時
const MIN_BLOCK_PX = 14; // タスクブロックの最小描画高さ（これより短いタスクもこの高さで描画する）
// 最小描画高さに相当する時間（ms）。実時間では重ならなくても、この範囲内に収まる短い・近接した
// タスクは見た目が重なってしまうため、レイアウト計算上は重なり扱いにして横に並べる（/goal指示）。
const MIN_VISUAL_MS = (MIN_BLOCK_PX / HOUR_HEIGHT) * 3600_000;
const DAY_MS = 24 * 3600_000;
const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];
const BREAK_COLOR = "#9ca3af";
const NO_PROJECT_COLOR = "#64748b";

interface Segment {
  task: Task;
  dayIndex: number;
  startMs: number; // その日の0時からの経過ms
  endMs: number;
  running: boolean;
}

/** 週内の各タスクを日単位のセグメントに分割する（日跨ぎタスクは日ごとに切る）。 */
function splitIntoSegments(tasks: Task[], weekStart: Date, now: Date): Segment[] {
  const segments: Segment[] = [];
  for (const task of tasks) {
    const start = new Date(task.startTime).getTime();
    const running = task.endTime === null;
    // 開始直後はstartとnowの差がほぼ0のことがあり、そのままだと下のs<e判定で
    // セグメントが弾かれカレンダーに表示されない。実行中タスクは常に1ms以上の
    // 幅を持たせ、開始直後でも必ず（MIN_BLOCK_PXの）最小サイズで描画されるようにする。
    const end = running ? Math.max(now.getTime(), start + 1) : new Date(task.endTime as unknown as string).getTime();
    for (let i = 0; i < 7; i++) {
      const dayStart = addDays(weekStart, i).getTime();
      const dayEnd = dayStart + DAY_MS;
      const s = Math.max(start, dayStart);
      const e = Math.min(end, dayEnd);
      if (s < e) {
        segments.push({ task, dayIndex: i, startMs: s - dayStart, endMs: e - dayStart, running });
      }
    }
  }
  return segments;
}

function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 週次カレンダー（SPEC.md セットC、docs/REQUIREMENTS.md §4.3）。
// 1週間の各日を縦タイムラインとして表示し、タスクをペイン（ブロック）で描画する。
export function WeekCalendar({ projects, hiddenProjectIds, onProjectCreated, refreshKey, onTaskMutated }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState<Task | null>(null);
  const [now, setNow] = useState(() => new Date());

  // カレンダー本体の縦スクロール領域。初回表示時に9:00が上部へ来るようスクロールする（/goal指示）。
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (!didInitialScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = 9 * HOUR_HEIGHT;
      didInitialScroll.current = true;
    }
  }, []);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // 開始/切替直後にrefreshKeyの更新で発火した最新のfetchより、初回マウント時のfetchが
  // 後から解決して古いタスク一覧で上書きしてしまう競合があった（開始してもカレンダーに
  // すぐ反映されない不具合の原因）。リクエストごとに連番を振り、最新のレスポンスのみを
  // 反映することで解消する（/goal指示）。
  const latestRequestId = useRef(0);
  const fetchTasks = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    const start = weekStart.toISOString();
    const end = addDays(weekStart, 7).toISOString();
    const res = await fetch(`/api/tasks/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    if (res.ok && requestId === latestRequestId.current) {
      const data = (await res.json()) as { tasks: Task[] };
      setTasks(data.tasks);
    }
  }, [weekStart]);

  useEffect(() => {
    void fetchTasks();
    // nowは実行中タスクのセグメント終端（開始<now）の判定に使われるため、開始直後に
    // 更新しないと「1分ごとの再描画」まで新規タスクのstartTimeがnowより後と判定され
    // 非表示になってしまう（開始ボタン押下時にカレンダーへ即時反映されない不具合の原因）。
    // refreshKeyはfetchTasksの計算に使わないが、TaskPanel側の操作を検知して
    // 再取得・now更新のトリガーとして依存配列に加えている。
    setNow(new Date());
  }, [fetchTasks, refreshKey]);

  // 実行中タスクの伸長と現在時刻線のため1分ごとに再描画する
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // 左メニューでグループを非表示にした場合、そのグループのタスクをカレンダーから除外する
  // （プロジェクト未設定のタスクはトグル対象外のため常に表示する）。
  const visibleTasks = useMemo(
    () => tasks.filter((task) => !task.projectId || !hiddenProjectIds.has(task.projectId)),
    [tasks, hiddenProjectIds],
  );

  const segments = useMemo(() => splitIntoSegments(visibleTasks, weekStart, now), [visibleTasks, weekStart, now]);

  const layoutByDay = useMemo(() => {
    const maps: Map<string, { lane: number; laneCount: number }>[] = [];
    for (let i = 0; i < 7; i++) {
      const inputs: LayoutInput[] = segments
        .filter((seg) => seg.dayIndex === i)
        .map((seg) => ({
          id: seg.task.id,
          startMs: seg.startMs,
          // 描画上の高さ（最小MIN_BLOCK_PX）を考慮した終端で重なり判定する。
          endMs: Math.max(seg.endMs, seg.startMs + MIN_VISUAL_MS),
        }));
      maps.push(layoutDayTasks(inputs));
    }
    return maps;
  }, [segments]);

  const todayIndex = useMemo(() => {
    const todayStart = startOfWeek(now).getTime() === weekStart.getTime()
      ? Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - weekStart.getTime()) / DAY_MS)
      : -1;
    return todayStart;
  }, [now, weekStart]);

  const rangeLabel = `${weekStart.getFullYear()}/${String(weekStart.getMonth() + 1).padStart(2, "0")}/${String(weekStart.getDate()).padStart(2, "0")} - ${(() => {
    const end = addDays(weekStart, 6);
    return `${String(end.getMonth() + 1).padStart(2, "0")}/${String(end.getDate()).padStart(2, "0")}`;
  })()}`;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label="週次カレンダー">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">週次カレンダー</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">{rangeLabel}</span>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            ← 前週
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            今週
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            次週 →
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200">
        {/* 縦横スクロール領域。曜日ヘッダーはsticky top-0で固定し、9:00初期スクロールの対象。 */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-[720px]">
          {/* 曜日ヘッダー */}
          <div className="sticky top-0 z-30 grid border-b border-gray-200 bg-white" style={{ gridTemplateColumns: "3.5rem repeat(7, 1fr)" }}>
            <div />
            {DAY_LABELS.map((label, i) => {
              const day = addDays(weekStart, i);
              const isToday = i === todayIndex;
              return (
                <div
                  key={label}
                  className={`border-l border-gray-200 py-2 text-center text-sm ${isToday ? "bg-indigo-50 font-semibold" : ""}`}
                >
                  {label} {day.getMonth() + 1}/{day.getDate()}
                </div>
              );
            })}
          </div>

          {/* タイムライン本体 */}
          <div
            className="relative grid"
            style={{ gridTemplateColumns: "3.5rem repeat(7, 1fr)", height: `${24 * HOUR_HEIGHT}px` }}
          >
            {/* 時刻軸 */}
            <div className="relative">
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="absolute right-1 -translate-y-1/2 text-xs text-gray-400"
                  style={{ top: `${h * HOUR_HEIGHT}px` }}
                >
                  {h === 0 ? "" : `${h}:00`}
                </div>
              ))}
            </div>

            {/* 日カラム */}
            {Array.from({ length: 7 }, (_, dayIndex) => {
              const isToday = dayIndex === todayIndex;
              const daySegments = segments.filter((seg) => seg.dayIndex === dayIndex);
              const layout = layoutByDay[dayIndex];
              return (
                <div
                  key={dayIndex}
                  className={`relative border-l border-gray-200 ${isToday ? "bg-indigo-50/40" : ""}`}
                >
                  {/* 時間罫線 */}
                  {Array.from({ length: 23 }, (_, h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-gray-100"
                      style={{ top: `${(h + 1) * HOUR_HEIGHT}px` }}
                    />
                  ))}

                  {/* 現在時刻線 */}
                  {isToday && (
                    <div
                      className="absolute inset-x-0 z-10 border-t-2 border-red-500"
                      style={{ top: `${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT}px` }}
                    />
                  )}

                  {/* タスクブロック */}
                  {daySegments.map((seg) => {
                    const pos = layout?.get(seg.task.id) ?? { lane: 0, laneCount: 1 };
                    const top = (seg.startMs / 3600_000) * HOUR_HEIGHT;
                    const height = Math.max(
                      ((seg.endMs - seg.startMs) / 3600_000) * HOUR_HEIGHT,
                      MIN_BLOCK_PX,
                    );
                    const widthPct = 100 / pos.laneCount;
                    const project = seg.task.projectId ? projectById.get(seg.task.projectId) : undefined;
                    const color =
                      seg.task.type === "break" ? BREAK_COLOR : (project?.color ?? NO_PROJECT_COLOR);
                    const startLabel = formatTime(new Date(seg.task.startTime));
                    const endLabel = seg.running ? "実行中" : formatTime(new Date(seg.task.endTime as unknown as string));
                    return (
                      <button
                        key={`${seg.task.id}-${seg.dayIndex}`}
                        type="button"
                        onClick={() => setEditing(seg.task)}
                        title={`${seg.task.name} (${startLabel} - ${endLabel})`}
                        className={`absolute z-20 overflow-hidden rounded px-1.5 py-0.5 text-left text-xs text-white shadow-sm transition-opacity hover:opacity-80 ${seg.running ? "animate-pulse" : ""}`}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          left: `calc(${pos.lane * widthPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          backgroundColor: color,
                        }}
                      >
                        <span className="font-medium">{seg.task.name}</span>
                        <span className="ml-1 opacity-80">
                          {startLabel}-{endLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        </div>
      </div>

      {editing && (
        <TaskEditDialog
          task={editing}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void fetchTasks();
            onTaskMutated();
          }}
          onProjectCreated={onProjectCreated}
        />
      )}
    </section>
  );
}
