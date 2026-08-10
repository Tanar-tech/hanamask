import { li as MotionLi } from "motion/react-m";
import { useCallback, useEffect, useState, type JSX } from "react";
import { useNewlyArrived } from "../hooks/useNewlyArrived";
import { ENTRY_MOTION } from "../styles/motion";
import { toBodyPreview } from "../text/bodyPreview";
import type { Note } from "../../shared/preload-api";
import { DeleteButton } from "./DeleteButton";

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

  const newlyArrived = useNewlyArrived(notes.map((note) => note.id));

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
      {notes.map((note) => {
        const preview = toBodyPreview(note.body);
        return (
          <MotionLi
            {...(newlyArrived.has(note.id) ? ENTRY_MOTION : {})}
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
            {preview !== "" && (
              <p className="m-0 font-body text-sm leading-relaxed text-text-soft">{preview}</p>
            )}
            <DeleteButton
              title={note.title}
              onConfirm={() => {
                void deleteNote(note);
              }}
            />
          </MotionLi>
        );
      })}
    </ul>
  );
};
