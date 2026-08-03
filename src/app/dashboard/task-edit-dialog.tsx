"use client";

import { useState } from "react";
import type { Project, Task } from "@prisma/client";
import { ProjectSelect } from "./project-select";

interface Props {
  task: Task;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
  /** プロジェクトその場新規作成の成功を親へ伝え、全画面共通のprojects一覧に反映する（SPEC.md セットC）。 */
  onProjectCreated: (project: Project) => void;
}

/** Date → <input type="datetime-local"> 用のローカル時刻文字列（yyyy-MM-ddTHH:mm） */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// タスク編集ダイアログ（SPEC.md セットC、docs/REQUIREMENTS.md §4.4）。
export function TaskEditDialog({ task, projects, onClose, onSaved, onProjectCreated }: Props) {
  const [name, setName] = useState(task.name);
  const [projectId, setProjectId] = useState<string>(task.projectId ?? "");
  const [start, setStart] = useState(toLocalInputValue(new Date(task.startTime)));
  const [end, setEnd] = useState(task.endTime ? toLocalInputValue(new Date(task.endTime)) : "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        projectId: projectId === "" ? null : projectId,
        startTime: new Date(start).toISOString(),
        // 実行中タスク（終了未入力）はnullのまま維持する
        endTime: end === "" ? null : new Date(end).toISOString(),
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "保存に失敗しました。");
      return;
    }
    onSaved();
  }

  // 実行中タスク（endTime === null）を詳細画面から完了させる（/goal指示）。終了日時を現在時刻で確定する。
  async function handleComplete() {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endTime: new Date().toISOString() }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "完了に失敗しました。");
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!window.confirm(`「${task.name}」を削除します。よろしいですか？`)) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    setSubmitting(false);

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "削除に失敗しました。");
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="タスクの編集"
      >
        <h2 className="text-lg font-semibold">タスクの編集</h2>
        <form className="mt-4 flex flex-col gap-3" onSubmit={handleSave}>
          <label className="flex flex-col gap-1 text-sm">
            タスク名
            <input
              type="text"
              required
              className="rounded border border-gray-300 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          {task.type === "work" && (
            <label className="flex flex-col gap-1 text-sm">
              グループ
              <ProjectSelect
                projects={projects}
                value={projectId}
                onChange={setProjectId}
                onProjectCreated={onProjectCreated}
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            開始日時
            <input
              type="datetime-local"
              required
              className="rounded border border-gray-300 px-3 py-2"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            終了日時{task.endTime === null && "（実行中のため未確定）"}
            <input
              type="datetime-local"
              className="rounded border border-gray-300 px-3 py-2"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={task.endTime === null}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              disabled={submitting}
              onClick={handleDelete}
              className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              削除
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                キャンセル
              </button>
              {task.endTime === null && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleComplete}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  完了
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {submitting ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
