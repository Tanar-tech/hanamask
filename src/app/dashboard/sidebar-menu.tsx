"use client";

import { useState } from "react";
import Link from "next/link";
import type { Project } from "@prisma/client";

interface Props {
  projects: Project[];
  hiddenProjectIds: Set<string>;
  onToggleProject: (projectId: string) => void;
  onManageProjects: () => void;
}

// ダッシュボード最左部のアイコンメニュー（/goal指示）。ナビゲーションはアイコンボタンで選択する形式とし、
// グループ一覧（カレンダーの色分け凡例）はアイコン選択時にフライアウトで表示する。
// フライアウト内の各グループはクリックでカレンダー上の表示・非表示を切り替えられる（初期状態は全表示）。
export function SidebarMenu({ projects, hiddenProjectIds, onToggleProject, onManageProjects }: Props) {
  const [groupsOpen, setGroupsOpen] = useState(false);

  return (
    <nav
      className="relative flex w-14 shrink-0 flex-col items-center gap-2 border-r border-amber-100 bg-amber-50/40 py-4"
      aria-label="メニュー"
    >
      <Link
        href="/dashboard"
        aria-current="page"
        aria-label="ダッシュボード"
        title="ダッシュボード"
        className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 text-amber-900"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
        </svg>
      </Link>

      <Link
        href="/dashboard/stats"
        aria-label="集計"
        title="集計"
        className="flex h-10 w-10 items-center justify-center rounded-md text-gray-600 hover:bg-amber-100"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 20V10" />
          <path d="M12 20V4" />
          <path d="M20 20v-6" />
        </svg>
      </Link>

      <div className="relative">
        <button
          type="button"
          aria-label="グループ一覧"
          aria-haspopup="true"
          aria-expanded={groupsOpen}
          title="グループ一覧"
          onClick={() => setGroupsOpen((open) => !open)}
          className={`flex h-10 w-10 items-center justify-center rounded-md hover:bg-amber-100 ${
            groupsOpen ? "bg-amber-100 text-amber-900" : "text-gray-600"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 7a1 1 0 0 1 1-1h4l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
          </svg>
        </button>

        {groupsOpen && (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="fixed inset-0 z-30 cursor-default"
              onClick={() => setGroupsOpen(false)}
            />
            <div className="absolute left-full top-0 z-40 ml-2 w-52 overflow-hidden rounded-md border border-gray-200 bg-white p-2 shadow-lg">
              <span className="block px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                グループ（クリックで表示切替）
              </span>
              {projects.length === 0 ? (
                <p className="px-2 py-1 text-xs text-gray-400">グループ未登録</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {projects.map((project) => {
                    const hidden = hiddenProjectIds.has(project.id);
                    return (
                      <li key={project.id}>
                        <button
                          type="button"
                          onClick={() => onToggleProject(project.id)}
                          aria-pressed={!hidden}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-gray-50 ${
                            hidden ? "text-gray-400" : "text-gray-700"
                          }`}
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: project.color, opacity: hidden ? 0.3 : 1 }}
                            aria-hidden
                          />
                          <span className="truncate">{project.name}</span>
                          {hidden && <span className="ml-auto shrink-0 text-[10px]">非表示</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                onClick={() => {
                  setGroupsOpen(false);
                  onManageProjects();
                }}
                className="mt-1 block w-full rounded px-2 py-1 text-left text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              >
                グループを管理…
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
