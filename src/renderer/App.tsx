import { useEffect, useState, type JSX } from "react";
import { KanbanView } from "./components/KanbanView";
import { NoteDetail } from "./components/NoteDetail";
import { NoteList } from "./components/NoteList";
import { SearchResults } from "./components/SearchResults";
import { TaskDetail } from "./components/TaskDetail";
import { TaskList } from "./components/TaskList";
import { TrashView } from "./components/TrashView";
import type { NavigateTarget } from "../shared/preload-api";

const LIST_VIEW: NavigateTarget = { kind: "list" };

export const App = (): JSX.Element => {
  const [view, setView] = useState<NavigateTarget>(LIST_VIEW);
  const backToList = (): void => {
    setView(LIST_VIEW);
  };

  // MCPのUI連携ツール（open_note等）はこのIPCイベント経由で画面を切り替える。
  useEffect(() => window.hanamask.onNavigate(setView), []);

  return (
    <main>
      <h1>hanamask</h1>
      {/* keyで再マウントさせないと、応答待ちの非同期処理が切替後のノートを上書きしうる。 */}
      {view.kind === "note" && <NoteDetail key={view.id} noteId={view.id} onBack={backToList} />}
      {view.kind === "task" && <TaskDetail key={view.id} taskId={view.id} onBack={backToList} />}
      {view.kind === "trash" && <TrashView onBack={backToList} />}
      {view.kind === "search" && (
        <SearchResults
          query={view.query}
          onSelectNote={(id) => {
            setView({ kind: "note", id });
          }}
          onBack={backToList}
        />
      )}
      {view.kind === "list" && (
        <>
          <NoteList
            onSelectNote={(id) => {
              setView({ kind: "note", id });
            }}
          />
          <TaskList
            onSelectTask={(id) => {
              setView({ kind: "task", id });
            }}
          />
          <KanbanView />
          <button
            type="button"
            onClick={() => {
              setView({ kind: "trash" });
            }}
          >
            ゴミ箱
          </button>
        </>
      )}
    </main>
  );
};
