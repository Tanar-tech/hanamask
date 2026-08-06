import { LazyMotion } from "motion/react";
import { useEffect, useState, type JSX } from "react";
import { AppShell, type ShellSection } from "./components/AppShell";
import { ChatPanel } from "./components/ChatPanel";
import { ChatSettings } from "./components/ChatSettings";
import { Home } from "./components/Home";
import { KanbanView } from "./components/KanbanView";
import { NoteDetail } from "./components/NoteDetail";
import { NoteList } from "./components/NoteList";
import { SearchResults } from "./components/SearchResults";
import { TaskDetail } from "./components/TaskDetail";
import { TaskList } from "./components/TaskList";
import { TrashView } from "./components/TrashView";
import { loadMotionFeatures } from "./styles/motion";
import type { NavigateTarget } from "../shared/preload-api";

const LIST_VIEW: NavigateTarget = { kind: "list" };
const TRASH_VIEW: NavigateTarget = { kind: "trash" };

/** ゴミ箱は `NavigateTarget` 側の状態なので、レールが持つのは一覧系の3つだけ。 */
type ListSection = "home" | "notes" | "tasks" | "settings";

const PANE = "flex flex-col gap-6 p-6";

export const App = (): JSX.Element => {
  const [view, setView] = useState<NavigateTarget>(LIST_VIEW);
  const [section, setSection] = useState<ListSection>("home");

  const backToList = (): void => {
    setView(LIST_VIEW);
  };
  const openNote = (id: string): void => {
    setView({ kind: "note", id });
  };
  const openTask = (id: string): void => {
    setView({ kind: "task", id });
  };

  // MCPのUI連携ツール（open_note等）はこのIPCイベント経由で画面を切り替える。
  useEffect(() => window.hanamask.onNavigate(setView), []);

  // `NavigateTarget` に「ホーム」は無いため、kind:"list" の着地先はレールの選択で決まる。
  const selectSection = (next: ShellSection): void => {
    if (next === "trash") {
      setView(TRASH_VIEW);
      return;
    }
    setSection(next);
    setView(LIST_VIEW);
  };

  // strict: アニメーションは m.* のみ許可し、初期ロードの重い motion.* を使えなくする。
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <AppShell
        current={view.kind === "trash" ? "trash" : section}
        onSelect={selectSection}
        aside={
          <ChatPanel
            onOpenSettings={() => {
              selectSection("settings");
            }}
          />
        }
      >
        {view.kind === "list" && section === "settings" ? (
          <ChatSettings />
        ) : view.kind === "list" && section === "home" ? (
          <Home
            onSelectNote={openNote}
            onSelectTask={openTask}
            onSearch={(query) => {
              setView({ kind: "search", query });
            }}
          />
        ) : (
          <div className={PANE}>
            {/* keyで再マウントさせないと、応答待ちの非同期処理が切替後のノートを上書きしうる。 */}
            {view.kind === "note" && (
              <NoteDetail key={view.id} noteId={view.id} onBack={backToList} />
            )}
            {view.kind === "task" && (
              <TaskDetail key={view.id} taskId={view.id} onBack={backToList} />
            )}
            {view.kind === "trash" && <TrashView onBack={backToList} />}
            {view.kind === "search" && (
              <SearchResults query={view.query} onSelectNote={openNote} onBack={backToList} />
            )}
            {view.kind === "list" && section === "notes" && <NoteList onSelectNote={openNote} />}
            {view.kind === "list" && section === "tasks" && (
              <>
                <TaskList onSelectTask={openTask} />
                <KanbanView />
              </>
            )}
          </div>
        )}
      </AppShell>
    </LazyMotion>
  );
};
