import { LazyMotion, MotionConfig } from "motion/react";
import { useEffect, useState, type JSX } from "react";
import { AppShell, type ShellSection } from "./components/AppShell";
import { BackupSettings } from "./components/BackupSettings";
import { CHAT_ENABLED } from "../shared/preload-api";
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
import { REDUCED_MOTION_POLICY, loadMotionFeatures } from "./styles/motion";
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

  // 詳細を開いている間は、レールの現在地もその種別に合わせる。合わせないと
  // MCPの open_note / open_task で飛んだときに、直前に選んでいたセクションが
  // 選択されたまま残る（ノート詳細なのに「タスク」が現在地に見える）。
  const railSection = (): ShellSection => {
    if (view.kind === "trash") return "trash";
    if (view.kind === "note") return "notes";
    if (view.kind === "task") return "tasks";
    return section;
  };

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
  // reducedMotion: motion の既定は "never" で、渡さないとOSで動きを切っていても項目が動く。
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion={REDUCED_MOTION_POLICY}>
        <AppShell
          current={railSection()}
          onSelect={selectSection}
          // CHAT_ENABLED が false の間、チャットの枠ごと出さない（preload-api.ts 参照）。
          aside={
            CHAT_ENABLED ? (
              <ChatPanel
                onOpenSettings={() => {
                  selectSection("settings");
                }}
              />
            ) : undefined
          }
        >
          {view.kind === "list" && section === "settings" ? (
            <>
              {CHAT_ENABLED && <ChatSettings />}
              <BackupSettings />
            </>
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
      </MotionConfig>
    </LazyMotion>
  );
};
