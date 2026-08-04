import { useState, type JSX } from "react";
import { KanbanView } from "./components/KanbanView";
import { NoteDetail } from "./components/NoteDetail";
import { NoteList } from "./components/NoteList";
import { TaskDetail } from "./components/TaskDetail";
import { TaskList } from "./components/TaskList";

type View =
  | { kind: "list" }
  | { kind: "note"; id: string }
  | { kind: "task"; id: string };

const LIST_VIEW: View = { kind: "list" };

export const App = (): JSX.Element => {
  const [view, setView] = useState<View>(LIST_VIEW);
  const backToList = (): void => {
    setView(LIST_VIEW);
  };

  return (
    <main>
      <h1>hanamask</h1>
      {view.kind === "note" && <NoteDetail noteId={view.id} onBack={backToList} />}
      {view.kind === "task" && <TaskDetail taskId={view.id} onBack={backToList} />}
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
        </>
      )}
    </main>
  );
};
