import type { JSX } from "react";
import { NoteList } from "./components/NoteList";

export const App = (): JSX.Element => (
  <main>
    <h1>hanamask</h1>
    <NoteList />
  </main>
);
