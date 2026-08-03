"use client";

import { createContext, useContext } from "react";
import type { Project } from "@prisma/client";

// dashboard配下の画面（/dashboard, /dashboard/stats）で共有するプロジェクト一覧・
// グループ表示切替の状態。layout.tsxが提供し、各page.tsxがuseDashboardContextで取得する。
export interface DashboardContextValue {
  projects: Project[];
  hiddenProjectIds: Set<string>;
  onToggleProject: (projectId: string) => void;
  onProjectCreated: (project: Project) => void;
  /** グループ管理ダイアログでの編集・アーカイブ・削除後にアクティブなプロジェクト一覧を再取得する（要求事項#1）。 */
  refetchProjects: () => Promise<void>;
}

export const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboardContext(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboardContext must be used within DashboardContext.Provider");
  }
  return ctx;
}
