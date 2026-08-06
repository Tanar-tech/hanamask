import { useCallback, useEffect, useState, type JSX } from "react";
import type { Note } from "../../shared/preload-api";

const BODY_PREVIEW_LENGTH = 120;

const toPreview = (body: string): string =>
  body.length > BODY_PREVIEW_LENGTH ? `${body.slice(0, BODY_PREVIEW_LENGTH)}…` : body;

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BARE_BUTTON = `cursor-pointer appearance-none border-0 bg-transparent p-0 font-body ${FOCUS_RING}`;

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
    return (
      <p
        role="alert"
        className="m-0 rounded-md border border-crit bg-paper-raised px-4 py-3 font-body text-sm text-crit"
      >
        {error}
      </p>
    );
  }

  if (notes.length === 0) {
    return (
      <p className="m-0 rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center font-body text-sm text-text-faint">
        ノートはまだありません
      </p>
    );
  }

  return (
    <ul aria-label="ノート一覧" className="m-0 flex list-none flex-col gap-3 p-0">
      {notes.map((note) => (
        <li
          key={note.id}
          className="flex flex-col gap-2 rounded-lg border border-line bg-paper-raised px-4 py-3 transition-colors duration-[var(--duration-fast)] ease-standard hover:border-ink-aqua"
        >
          <h2 className="m-0 font-display text-base leading-snug font-semibold">
            <button
              type="button"
              className={`${BARE_BUTTON} text-left text-base font-semibold text-ink-aqua-text underline-offset-4 hover:underline`}
              onClick={() => {
                onSelectNote(note.id);
              }}
            >
              {note.title}
            </button>
          </h2>
          <p className="m-0 font-body text-sm leading-relaxed text-text-soft">
            {toPreview(note.body)}
          </p>
          <button
            type="button"
            className={`${FOCUS_RING} cursor-pointer self-start rounded-md border border-line bg-transparent px-3 py-1 font-body text-xs text-text-faint transition-colors duration-[var(--duration-fast)] ease-standard hover:border-crit hover:text-crit`}
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
