"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project, Task } from "@prisma/client";
import {
  addMonths,
  aggregateHoursByDay,
  getMonthGridDays,
  startOfMonth,
  toDateKey,
} from "@/lib/month";
import { addDays } from "@/lib/week";
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

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

function formatHours(hours: number): string {
  if (hours === 0) return "";
  return `${hours.toFixed(1)}h`;
}

function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 月次カレンダー（SPEC.md セットB、docs/REQUIREMENTS.md §4.3）。
// 当月のカレンダーグリッドに各日の実働時間合計を数値表示する。
export function MonthCalendar({ projects, hiddenProjectIds, onProjectCreated, refreshKey, onTaskMutated }: Props) {
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [now, setNow] = useState(() => new Date());

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const gridDays = useMemo(() => getMonthGridDays(monthStart), [monthStart]);

  // 開始/切替直後にrefreshKeyの更新で発火した最新のfetchより、初回マウント時のfetchが
  // 後から解決して古いタスク一覧で上書きしてしまう競合があった（開始してもカレンダーに
  // すぐ反映されない不具合の原因）。リクエストごとに連番を振り、最新のレスポンスのみを
  // 反映することで解消する（/goal指示）。
  const latestRequestId = useRef(0);
  const fetchTasks = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    const start = gridDays[0]!.toISOString();
    const end = addDays(gridDays[gridDays.length - 1]!, 1).toISOString();
    const res = await fetch(`/api/tasks/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    if (res.ok && requestId === latestRequestId.current) {
      const data = (await res.json()) as { tasks: Task[] };
      setTasks(data.tasks);
    }
  }, [gridDays]);

  useEffect(() => {
    void fetchTasks();
    // nowは実行中タスクの実働時間集計（開始<now）の判定に使われるため、開始直後に
    // 更新しないと「1分ごとの再計算」までタスクのstartTimeがnowより後と判定され
    // 集計に反映されない不具合の原因になる（開始ボタン押下時にカレンダーへ即時反映
    // されない不具合と同根）。
    // refreshKeyはfetchTasksの計算に使わないが、TaskPanel側の操作を検知して
    // 再取得・now更新のトリガーとして依存配列に加えている。
    setNow(new Date());
  }, [fetchTasks, refreshKey]);

  // 実行中タスクの集計を最新に保つため1分ごとに再計算する
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

  const hoursByDay = useMemo(
    () =>
      aggregateHoursByDay(
        visibleTasks.map((t) => ({
          startTime: new Date(t.startTime),
          endTime: t.endTime ? new Date(t.endTime as unknown as string) : null,
          type: t.type,
        })),
        now,
      ),
    [visibleTasks, now],
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of visibleTasks) {
      const start = new Date(task.startTime);
      const end = task.endTime ? new Date(task.endTime as unknown as string) : now;
      // 日をまたぐタスクは関係する日すべてに紐づける
      let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      while (cursor.getTime() <= end.getTime()) {
        const key = toDateKey(cursor);
        const list = map.get(key) ?? [];
        list.push(task);
        map.set(key, list);
        cursor = addDays(cursor, 1);
      }
    }
    return map;
  }, [visibleTasks, now]);

  const todayKey = toDateKey(now);
  const rangeLabel = `${monthStart.getFullYear()}年${monthStart.getMonth() + 1}月`;
  const selectedTasks = selectedDateKey ? (tasksByDay.get(selectedDateKey) ?? []) : [];

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label="月次カレンダー">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">月次カレンダー</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">{rangeLabel}</span>
          <button
            type="button"
            onClick={() => setMonthStart((m) => addMonths(m, -1))}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            ← 前月
          </button>
          <button
            type="button"
            onClick={() => setMonthStart(startOfMonth(new Date()))}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            今月
          </button>
          <button
            type="button"
            onClick={() => setMonthStart((m) => addMonths(m, 1))}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            次月 →
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200">
        <div className="min-w-[720px]">
          {/* 曜日ヘッダー */}
          <div className="grid border-b border-gray-200 bg-white" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
            {DAY_LABELS.map((label) => (
              <div key={label} className="border-l border-gray-200 py-2 text-center text-sm first:border-l-0">
                {label}
              </div>
            ))}
          </div>

          {/* 日グリッド */}
          <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
            {gridDays.map((day) => {
              const key = toDateKey(day);
              const isCurrentMonth = day.getMonth() === monthStart.getMonth();
              const isToday = key === todayKey;
              const hours = hoursByDay.get(key) ?? 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDateKey(key)}
                  className={`flex h-24 flex-col items-start gap-1 border-b border-l border-gray-200 p-2 text-left first:border-l-0 hover:bg-gray-50 ${
                    isCurrentMonth ? "" : "bg-gray-50 text-gray-400"
                  } ${isToday ? "bg-indigo-50" : ""} ${selectedDateKey === key ? "ring-2 ring-inset ring-indigo-400" : ""}`}
                >
                  <span className={`text-sm ${isToday ? "font-semibold text-indigo-600" : ""}`}>{day.getDate()}</span>
                  {hours > 0 && <span className="text-xs font-medium text-gray-700">{formatHours(hours)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedDateKey && (
        // 日別タスク一覧はダイアログ表示にする（カレンダー下部への埋め込みだと項目数次第で
        // 画面下に見切れ、かつグリッドの表示領域が圧迫されるため。task-edit-dialog.tsxと
        // 同じオーバーレイパターンを踏襲）。
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedDateKey(null)}
          role="presentation"
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`${selectedDateKey}のタスク一覧`}
          >
            <div className="flex shrink-0 items-center justify-between">
              <h3 className="text-lg font-semibold">{selectedDateKey} のタスク</h3>
              <button
                type="button"
                onClick={() => setSelectedDateKey(null)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                閉じる
              </button>
            </div>
            {selectedTasks.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">この日のタスクはありません。</p>
            ) : (
              <ul className="mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                {selectedTasks.map((task) => {
                  const project = task.projectId ? projectById.get(task.projectId) : undefined;
                  const endLabel = task.endTime ? formatTime(new Date(task.endTime as unknown as string)) : "実行中";
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(task)}
                        className="flex w-full items-center justify-between rounded px-2 py-1 text-sm hover:bg-gray-50"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: task.type === "break" ? "#9ca3af" : (project?.color ?? "#64748b") }}
                          />
                          {task.name}
                        </span>
                        <span className="text-gray-500">
                          {formatTime(new Date(task.startTime))}-{endLabel}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

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
