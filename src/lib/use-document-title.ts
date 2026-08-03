"use client";
// 実行中タスクの状態に応じてブラウザタブのタイトル・faviconを動的に切り替えるフック。
// docs/REQUIREMENTS.md §4.1「実行中タスクの常時表示」、SPEC.md Set A（機能1）に対応。
// DOM操作を伴う処理は他と分離し、タイトル・favicon色の算出は純粋関数としてテスト容易にしている。

import { useEffect } from "react";
import type { Task } from "@prisma/client";

const APP_TITLE = "Chocotto";

export type TabStatus = "work" | "break" | "idle";

type OpenTaskLike = Pick<Task, "name" | "type">;

/** 実行中タスクの状態からタブタイトルを算出する。 */
export function computeTabTitle(openTask: OpenTaskLike | null): string {
  if (!openTask) return APP_TITLE;
  if (openTask.type === "break") return `休憩中 - ${APP_TITLE}`;
  return `${openTask.name} - ${APP_TITLE}`;
}

/** 実行中タスクの状態からタブの視覚的ステータス（favicon切替用）を算出する。 */
export function computeTabStatus(openTask: Pick<Task, "type"> | null): TabStatus {
  if (!openTask) return "idle";
  return openTask.type === "break" ? "break" : "work";
}

const FAVICON_COLORS: Record<TabStatus, string> = {
  work: "#16a34a", // 実行中: green-600
  break: "#f59e0b", // 休憩中: amber-500
  idle: "#9ca3af", // 待機中: gray-400
};

/** ステータスに応じたfavicon用SVGのdata URIを生成する（画像依存を追加しないためインラインSVG）。 */
export function buildFaviconDataUri(status: TabStatus): string {
  const color = FAVICON_COLORS[status];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="${color}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** document.title / favicon linkを実際に更新する副作用処理。 */
export function applyDocumentTabState(openTask: OpenTaskLike | null): void {
  if (typeof document === "undefined") return;

  document.title = computeTabTitle(openTask);

  const status = computeTabStatus(openTask);
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = buildFaviconDataUri(status);
}

/** openTaskの変化に応じてタブタイトル・faviconを更新するクライアントフック。 */
export function useDocumentTitle(openTask: OpenTaskLike | null): void {
  useEffect(() => {
    applyDocumentTabState(openTask);
  }, [openTask]);

  useEffect(() => {
    // アンマウント時（画面離脱時）は元のタイトルに戻す
    return () => {
      if (typeof document !== "undefined") {
        document.title = APP_TITLE;
      }
    };
  }, []);
}
