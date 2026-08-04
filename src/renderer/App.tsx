import type { JSX } from "react";
import { NoteList } from "./components/NoteList";
import { TaskList } from "./components/TaskList";

export const App = (): JSX.Element => (
  <main>
    <h1>hanamask</h1>
    <NoteList />
    <TaskList />
  </main>
);
