import { useCallback, useEffect, useState, type JSX } from "react";
import type { Note } from "../../shared/preload-api";
import type { NotebookPages } from "./NotebookNav";
import { PIN_MARK, isPinned } from "./PinToggleButton";
import { toUpdatedLabel } from "../text/dateLabel";


/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const PAGE_BUTTON = `${FOCUS_RING} m-0 flex w-full cursor-pointer appearance-none flex-col gap-0.5 rounded-md border-0 bg-transparent px-3 py-1.5 text-left font-body text-sm text-text-soft transition-colors duration-[var(--duration-fast)] ease-standard hover:text-text`;

const EMPTY_MESSAGE = "ページはありません";
const PIN_MARK_LABEL = "ピン留め中";
const NO_NOTEBOOK: NotebookPages = { notebook: null, notes: [] };

// ナビと同じく更新日の新しい順。ISO文字列は辞書順と時刻順が一致する。
const byUpdatedDesc = (a: Note, b: Note): number => b.updatedAt.localeCompare(a.updatedAt);

interface NotebookSubPaneProps {
  notebookId: string;
  onSelectPage: (id: string) => void;
}

export const NotebookSubPane = ({
  notebookId,
  onSelectPage,
}: NotebookSubPaneProps): JSX.Element => {
  const [pages, setPages] = useState<NotebookPages>(NO_NOTEBOOK);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setPages(await window.hanamask.getNotebook(notebookId));
      setError(null);
    } catch (cause) {
      setError(`ページの読み込みに失敗しました: ${String(cause)}`);
    }
  }, [notebookId]);

  useEffect(() => {
    void reload();
    const stopNotes = window.hanamask.onNotesChanged(() => {
      void reload();
    });
    const stopNotebooks = window.hanamask.onNotebooksChanged(() => {
      void reload();
    });
    return () => {
      stopNotes();
      stopNotebooks();
    };
  }, [reload]);

  if (error !== null) {
    return (
      <p role="alert" className="m-0 px-3 py-2 font-body text-sm text-crit">
        {error}
      </p>
    );
  }

  const { notebook, notes } = pages;
  const heading = notebook === null ? "ページ" : `${notebook.title} のページ`;
  const sorted = [...notes].sort(byUpdatedDesc);

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 px-3 font-body text-xs tracking-wide text-text-faint">{heading}</p>
      {sorted.length === 0 ? (
        <p className="m-0 px-3 py-4 font-body text-sm text-text-faint">{EMPTY_MESSAGE}</p>
      ) : (
        <ul aria-label={heading} className="m-0 flex list-none flex-col gap-0.5 p-0">
          {sorted.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => {
                  onSelectPage(note.id);
                }}
                className={PAGE_BUTTON}
              >
                <span className="flex min-w-0 items-center gap-1">
                  {isPinned(note) && (
                    <span role="img" aria-label={PIN_MARK_LABEL}>
                      {PIN_MARK}
                    </span>
                  )}
                  <span className="min-w-0 truncate">{note.title}</span>
                </span>
                <span className="font-body text-xs text-text-faint">
                  {toUpdatedLabel(note.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
