import type { JSX } from "react";
import { KanbanView } from "./components/KanbanView";
import { NoteList } from "./components/NoteList";
import { TaskList } from "./components/TaskList";

export const App = (): JSX.Element => (
  <main>
    <h1>hanamask</h1>
    <NoteList />
    <TaskList />
    <KanbanView />
  </main>
);
