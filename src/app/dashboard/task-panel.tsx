"use client";

import { useState } from "react";
import type { Project, Task } from "@prisma/client";
import { useDocumentTitle } from "@/lib/use-document-title";
import { ProjectSelect } from "./project-select";

interface Props {
  projects: Project[];
  openTask: Task | null;
  /** プロジェクトその場新規作成の成功を親（page.tsx）へ伝え、全画面共通のprojects一覧に反映する（SPEC.md セットC）。 */
  onProjectCreated: (project: Project) => void;
  /** 開始/切替/休憩/終業の成功後に親（page.tsx）へ通知する。実行中タスク表示とカレンダー描画を同期させる（/goal指示）。 */
  onTaskMutated: (nextOpenTask?: Task | null) => void;
}

// 実行中タスクの常時表示・開始/切替/休憩/終業の操作パネル（docs/REQUIREMENTS.md §3, §4.1）。
export function TaskPanel({ projects, openTask, onProjectCreated, onTaskMutated }: Props) {
  // openTaskの変化（開始/切替/休憩/終業、再読み込み時の復元）に応じてタブタイトル/faviconを更新する（SPEC.md Set A）。
  useDocumentTitle(openTask);
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function post(body: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "操作に失敗しました。");
      return;
    }
    const data = (await res.json()) as { opened: Task | null };
    onTaskMutated(data.opened);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-500">実行中</p>
        {openTask ? (
          <p className="text-lg font-semibold break-words">
            {openTask.name}
            <span className="ml-2 text-sm font-normal text-gray-500">
              {openTask.type === "break" ? "(休憩)" : ""} 開始: {new Date(openTask.startTime).toLocaleTimeString("ja-JP")}
            </span>
          </p>
        ) : (
          <p className="text-lg text-gray-400">実行中のタスクはありません</p>
        )}
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void post({ action: "switch", projectId: projectId || null, name });
        }}
      >
        <ProjectSelect
          projects={projects}
          value={projectId}
          onChange={setProjectId}
          onProjectCreated={onProjectCreated}
          className="w-full min-w-0 rounded border border-gray-300 px-3 py-2"
        />
        <input
          type="text"
          required
          placeholder="タスク名"
          className="w-full min-w-0 rounded border border-gray-300 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          開始/切替
        </button>
      </form>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={submitting || !openTask}
          onClick={() => void post({ action: "break" })}
          className="rounded-md border border-gray-300 px-4 py-2 disabled:opacity-50"
        >
          休憩
        </button>
        <button
          type="button"
          disabled={submitting || !openTask}
          onClick={() => void post({ action: "end" })}
          className="rounded-md border border-gray-300 px-4 py-2 disabled:opacity-50"
        >
          終業
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
