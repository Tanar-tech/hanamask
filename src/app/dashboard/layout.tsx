"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@prisma/client";
import { Header } from "./header";
import { SidebarMenu } from "./sidebar-menu";
import { ProjectManageDialog } from "./project-manage-dialog";
import { DashboardContext } from "./dashboard-context";

// dashboard配下（/dashboard, /dashboard/stats）共通のレイアウト（/goal指示）。
// 認証後の画面は常にヘッダーと左アイコンメニューを持つようにし、プロジェクト一覧の
// 取得・グループ表示切替の状態もここで一元管理して各ページへcontext経由で渡す。
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Set<string>>(new Set());
  const [manageOpen, setManageOpen] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (!res.ok) {
        throw new Error("failed to load");
      }
      const data = (await res.json()) as { projects: Project[] };
      setProjects(data.projects);
    } catch {
      setError("データの取得に失敗しました。時間をおいて再読み込みしてください。");
    }
  }, [router]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  function toggleProjectVisibility(projectId: string) {
    setHiddenProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  // プロジェクトのその場新規作成を、正となるprojects stateへ反映する（SPEC.md セットC）。
  function handleProjectCreated(project: Project) {
    setProjects((prev) => (prev ? [...prev, project].sort((a, b) => a.name.localeCompare(b.name, "ja")) : prev));
  }

  return (
    <div className="flex h-screen flex-col bg-white text-gray-900">
      <Header />
      {error ? (
        <p className="p-6 text-sm text-red-600">{error}</p>
      ) : projects === null ? (
        <p className="p-6 text-sm text-gray-500">読み込み中...</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-row">
          <SidebarMenu
            projects={projects}
            hiddenProjectIds={hiddenProjectIds}
            onToggleProject={toggleProjectVisibility}
            onManageProjects={() => setManageOpen(true)}
          />
          {manageOpen && (
            <ProjectManageDialog
              onClose={() => setManageOpen(false)}
              onChanged={() => void fetchProjects()}
            />
          )}
          <DashboardContext.Provider
            value={{
              projects,
              hiddenProjectIds,
              onToggleProject: toggleProjectVisibility,
              onProjectCreated: handleProjectCreated,
              refetchProjects: fetchProjects,
            }}
          >
            {children}
          </DashboardContext.Provider>
        </div>
      )}
    </div>
  );
}
