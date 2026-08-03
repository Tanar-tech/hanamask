"use client";

import { useState } from "react";
import type { Project } from "@prisma/client";

// プロジェクト選択＋その場新規作成コンポーネント（docs/REQUIREMENTS.md §7、SPEC.md セットC）。
// 既存プロジェクトの選択に加え、「+ 新しいプロジェクトを作成」を選ぶとインライン
// フォームに切り替わる。作成に成功すると自動的にそのプロジェクトを選択状態にする。
// task-edit-dialog.tsx から利用し、task-panel.tsx への組み込みはPhase 4で行う。

const CREATE_NEW_VALUE = "__create_new__";

interface Props {
  projects: Project[];
  value: string;
  onChange: (projectId: string) => void;
  /** 新規プロジェクト作成成功時に呼ばれる。一覧の再フェッチ等は呼び出し側の責務。 */
  onProjectCreated: (project: Project) => void;
  className?: string;
}

export function ProjectSelect({ projects, value, onChange, onProjectCreated, className }: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === CREATE_NEW_VALUE) {
      setCreating(true);
      setNewName("");
      setError(null);
      return;
    }
    onChange(e.target.value);
  }

  function cancelCreate() {
    setCreating(false);
    setNewName("");
    setError(null);
  }

  async function handleCreate(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "作成に失敗しました。");
      return;
    }
    const data = (await res.json()) as { project: Project };
    setCreating(false);
    setNewName("");
    onProjectCreated(data.project);
    onChange(data.project.id);
  }

  if (creating) {
    // 注意: 本コンポーネントは呼び出し元（task-panel.tsx/task-edit-dialog.tsx）の
    // <form> 内で使われるため、ここでは <form> を使わない（HTML仕様上<form>は<form>の
    // 子孫にできず、送信・ボタン挙動が不安定になるため。実機で新規作成が動作しない
    // 不具合の原因だった）。Enterキー送信はinputのonKeyDownで代替する。
    return (
      <div className={className ?? "flex flex-col gap-2"}>
        <input
          type="text"
          autoFocus
          required
          placeholder="新しいグループ名"
          className="rounded border border-gray-300 px-3 py-2"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleCreate()}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {submitting ? "作成中..." : "作成"}
          </button>
          <button
            type="button"
            onClick={cancelCreate}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  return (
    <select
      className={className ?? "rounded border border-gray-300 px-3 py-2"}
      value={value}
      onChange={handleSelectChange}
    >
      <option value="">（未分類）</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      <option value={CREATE_NEW_VALUE}>+ 新しいグループを作成</option>
    </select>
  );
}
