"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@prisma/client";
import { TaskPanel } from "./task-panel";
import { WeekCalendar } from "./week-calendar";
import { MonthCalendar } from "./month-calendar";
import { useDashboardContext } from "./dashboard-context";

// 静的エクスポート（S3+CloudFront配信）ではサーバー側でセッション判定・Prisma参照が
// できないため、クライアントからAPI（/api/tasks）を呼んで初期化する
// （プロジェクト一覧・ヘッダー・左メニューは layout.tsx が共通で提供する）。
// 未認証（401）は /sign-in へリダイレクトする（docs/AWS.md）。
//
// レイアウト（/goal指示）: 中央=カレンダー / 右=タスク登録・編集の横2分割。
// 中央カレンダーは自身の内部でスクロールさせることで見切れないようにする。
export default function DashboardPage() {
  const router = useRouter();
  const { projects, hiddenProjectIds, onProjectCreated } = useDashboardContext();
  const [openTask, setOpenTask] = useState<Task | null>(null);
  // カレンダー表示切替（週/月、SPEC.md セットB）
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  // 狭幅画面ではタスク登録・編集パネルがカレンダーの表示領域を圧迫するため、
  // lg未満はオフキャンバスのドロワーにして必要な時だけ開く（要求事項#8）。
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  // TaskPanel（開始/切替/休憩/終業）とカレンダーの詳細ダイアログ（完了/削除等）は
  // それぞれ独立にタスクを更新するため、片方の操作がもう片方の表示に反映されない
  // 問題があった。このキーをどちらかの操作後にインクリメントし、カレンダー側の
  // 再取得トリガー（useEffectの依存値）として使うことで両者を同期させる（/goal指示）。
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/tasks");
      if (res.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as { task: Task | null };
      if (!cancelled) {
        setOpenTask(data.task);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // タスクの開始/切替/休憩/終業、および詳細ダイアログでの完了/編集/削除の後に呼ぶ。
  // 実行中タスク表示（TaskPanel）とカレンダー描画の両方を最新状態に同期する。
  // nextOpenTaskを渡せる場合（TaskPanelは操作結果を把握済み）はそれを反映し、
  // 渡されない場合（カレンダー側の詳細ダイアログは実行中タスクへの影響を把握していない）は
  // サーバーへ再取得して真の状態に合わせる。
  function handleTaskMutated(nextOpenTask?: Task | null) {
    setTaskRefreshKey((key) => key + 1);
    if (nextOpenTask !== undefined) {
      setOpenTask(nextOpenTask);
      return;
    }
    void (async () => {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = (await res.json()) as { task: Task | null };
        setOpenTask(data.task);
      }
    })();
  }

  return (
    <>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCalendarView("week")}
            className={`rounded-md px-3 py-1.5 text-sm ${
              calendarView === "week" ? "bg-gray-900 text-white" : "border border-gray-300 hover:bg-gray-50"
            }`}
          >
            週表示
          </button>
          <button
            type="button"
            onClick={() => setCalendarView("month")}
            className={`rounded-md px-3 py-1.5 text-sm ${
              calendarView === "month" ? "bg-gray-900 text-white" : "border border-gray-300 hover:bg-gray-50"
            }`}
          >
            月表示
          </button>
          <button
            type="button"
            onClick={() => setTaskPanelOpen(true)}
            className="ml-auto rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 lg:hidden"
          >
            タスク登録・編集
          </button>
        </div>
        {calendarView === "week" ? (
          <WeekCalendar
            projects={projects}
            hiddenProjectIds={hiddenProjectIds}
            onProjectCreated={onProjectCreated}
            refreshKey={taskRefreshKey}
            onTaskMutated={handleTaskMutated}
          />
        ) : (
          <MonthCalendar
            projects={projects}
            hiddenProjectIds={hiddenProjectIds}
            onProjectCreated={onProjectCreated}
            refreshKey={taskRefreshKey}
            onTaskMutated={handleTaskMutated}
          />
        )}
      </section>

      {/* 狭幅画面（lg未満）ではタスクパネルをオフキャンバスドロワーとして開閉する（要求事項#8）。 */}
      {taskPanelOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setTaskPanelOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-80 max-w-[85vw] transform overflow-y-auto border-l border-amber-100 bg-white p-4 transition-transform duration-200 lg:static lg:z-auto lg:w-80 lg:max-w-none lg:translate-x-0 lg:shrink-0 lg:transform-none ${
          taskPanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500">タスク登録・編集</h2>
          <button
            type="button"
            onClick={() => setTaskPanelOpen(false)}
            className="text-sm text-gray-500 hover:text-gray-700 lg:hidden"
          >
            閉じる
          </button>
        </div>
        <TaskPanel
          projects={projects}
          openTask={openTask}
          onProjectCreated={onProjectCreated}
          onTaskMutated={handleTaskMutated}
        />
      </aside>
    </>
  );
}
