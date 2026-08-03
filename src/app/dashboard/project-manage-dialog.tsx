"use client";

import { useEffect, useState } from "react";
import type { Project } from "@prisma/client";

interface Props {
  onClose: () => void;
  /** 編集・アーカイブ・削除いずれかの成功後、アクティブなプロジェクト一覧を再取得させる。 */
  onChanged: () => void;
}

interface EditingState {
  id: string;
  name: string;
  color: string;
}

// グループ（プロジェクト）管理ダイアログ（要求事項#1: 編集・アーカイブ・削除）。
// アーカイブ済みも含めた全件を表示し、名前・色の編集、アーカイブ切替、削除を行える。
export function ProjectManageDialog({ onClose, onChanged }: Props) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function fetchAll() {
    const res = await fetch("/api/projects?all=1");
    if (!res.ok) {
      setError("グループ一覧の取得に失敗しました。");
      return;
    }
    const data = (await res.json()) as { projects: Project[] };
    setProjects(data.projects);
  }

  useEffect(() => {
    void fetchAll();
  }, []);

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/projects/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editing.name, color: editing.color }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "更新に失敗しました。");
      return;
    }
    setEditing(null);
    await fetchAll();
    onChanged();
  }

  async function handleToggleArchive(project: Project) {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: !project.isArchived }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "更新に失敗しました。");
      return;
    }
    await fetchAll();
    onChanged();
  }

  async function handleDelete(project: Project) {
    if (!window.confirm(`「${project.name}」を削除します。過去のタスク記録は残りますが、このグループへの紐づけは解除されます。よろしいですか？`)) {
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    setSubmitting(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "削除に失敗しました。");
      return;
    }
    await fetchAll();
    onChanged();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="グループ管理"
      >
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="text-lg font-semibold">グループ管理</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            閉じる
          </button>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {projects === null ? (
          <p className="mt-4 text-sm text-gray-500">読み込み中...</p>
        ) : projects.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">グループ未登録</p>
        ) : (
          <ul className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {projects.map((project) => (
              <li key={project.id} className="rounded-md border border-gray-200 p-2">
                {editing?.id === project.id ? (
                  <form className="flex flex-col gap-2" onSubmit={handleSaveEdit}>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editing.color}
                        onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                        className="h-8 w-8 shrink-0 cursor-pointer rounded border border-gray-300"
                        aria-label="色"
                      />
                      <input
                        type="text"
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                        aria-label="グループ名"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        キャンセル
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="rounded bg-gray-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                      >
                        保存
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color, opacity: project.isArchived ? 0.3 : 1 }}
                      aria-hidden
                    />
                    <span className={`min-w-0 flex-1 truncate text-sm ${project.isArchived ? "text-gray-400" : "text-gray-800"}`}>
                      {project.name}
                      {project.isArchived && <span className="ml-1 text-xs">（アーカイブ済み）</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing({ id: project.id, name: project.name, color: project.color })}
                      disabled={submitting}
                      className="shrink-0 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleArchive(project)}
                      disabled={submitting}
                      className="shrink-0 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {project.isArchived ? "復元" : "アーカイブ"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(project)}
                      disabled={submitting}
                      className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      削除
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
