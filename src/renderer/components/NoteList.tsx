import { useCallback, useEffect, useState, type JSX } from "react";
import type { Note } from "../../shared/preload-api";

const BODY_PREVIEW_LENGTH = 120;

const toPreview = (body: string): string =>
  body.length > BODY_PREVIEW_LENGTH ? `${body.slice(0, BODY_PREVIEW_LENGTH)}…` : body;

interface NoteListProps {
  onSelectNote: (id: string) => void;
}

export const NoteList = ({ onSelectNote }: NoteListProps): JSX.Element => {
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

  const deleteNote = useCallback(async (note: Note) => {
    if (!window.confirm(`「${note.title}」を削除しますか?`)) return;
    try {
      await window.hanamask.deleteNote(note.id);
    } catch (cause) {
      setError(`ノートの削除に失敗しました: ${String(cause)}`);
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
          <h2>
            <button
              type="button"
              onClick={() => {
                onSelectNote(note.id);
              }}
            >
              {note.title}
            </button>
          </h2>
          <p>{toPreview(note.body)}</p>
          <button
            type="button"
            onClick={() => {
              void deleteNote(note);
            }}
          >
            削除
          </button>
        </li>
      ))}
    </ul>
  );
};
