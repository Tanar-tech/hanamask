import { useCallback, useEffect, useState, type JSX } from "react";
import type { Note } from "../types/preload";

const BODY_PREVIEW_LENGTH = 120;

const toPreview = (body: string): string =>
  body.length > BODY_PREVIEW_LENGTH ? `${body.slice(0, BODY_PREVIEW_LENGTH)}…` : body;

export const NoteList = (): JSX.Element => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setNotes(await window.hanamask.listNotes());
      setError(null);
    } catch (cause) {
      setError(`ノートの読み込みに失敗しました: ${String(cause)}`);
    }
  }, []);

  useEffect(() => {
    void reload();
    return window.hanamask.onNotesChanged(() => {
      void reload();
    });
  }, [reload]);

  if (error !== null) {
    return <p role="alert">{error}</p>;
  }

  if (notes.length === 0) {
    return <p>ノートはまだありません</p>;
  }

  return (
    <ul>
      {notes.map((note) => (
        <li key={note.id}>
          <h2>{note.title}</h2>
          <p>{toPreview(note.body)}</p>
        </li>
      ))}
    </ul>
  );
};
