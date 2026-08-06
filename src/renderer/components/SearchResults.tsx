import { useEffect, useState, type JSX } from "react";
import type { Note } from "../../shared/preload-api";

const BODY_PREVIEW_LENGTH = 120;
const BACK_LABEL = "戻る";
const EMPTY_MESSAGE = "該当するノートはありません";
const LIST_LABEL = "検索結果";

const toPreview = (body: string): string =>
  body.length > BODY_PREVIEW_LENGTH ? `${body.slice(0, BODY_PREVIEW_LENGTH)}…` : body;

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BACK_BUTTON = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border border-solid border-line bg-transparent px-3 py-1.5 font-body text-sm text-text-soft transition-colors duration-[var(--duration-fast)] ease-standard hover:border-ink-aqua hover:text-ink-aqua-text-text`;
const TITLE_BUTTON = `${FOCUS_RING} m-0 cursor-pointer appearance-none border-0 bg-transparent p-0 text-left font-body text-base font-semibold text-ink-aqua-text underline-offset-4 hover:underline`;

interface SearchResultsProps {
  query: string;
  onSelectNote: (id: string) => void;
  onBack: () => void;
}

export const SearchResults = ({ query, onSelectNote, onBack }: SearchResultsProps): JSX.Element => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let abandoned = false;
    const search = async (): Promise<void> => {
      try {
        const found = await window.hanamask.searchNotes(query);
        if (abandoned) return;
        setNotes(found);
        setError(null);
      } catch (cause) {
        if (abandoned) return;
        setError(`検索に失敗しました: ${String(cause)}`);
      }
    };
    void search();
    return () => {
      abandoned = true;
    };
  }, [query]);

  return (
    <section className="flex flex-col gap-4 font-body text-text">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 font-display text-xl font-bold tracking-wide">
          「{query}」の検索結果
        </h2>
        <button type="button" onClick={onBack} className={BACK_BUTTON}>
          {BACK_LABEL}
        </button>
      </header>
      {error !== null && (
        <p
          role="alert"
          className="m-0 rounded-md border border-solid border-crit bg-paper-raised px-4 py-3 text-sm text-crit"
        >
          {error}
        </p>
      )}
      {error === null && notes.length === 0 && (
        <p className="m-0 rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-text-faint">
          {EMPTY_MESSAGE}
        </p>
      )}
      {notes.length > 0 && (
        <ul aria-label={LIST_LABEL} className="m-0 flex list-none flex-col gap-3 p-0">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex flex-col gap-2 rounded-lg border border-solid border-line bg-paper-raised px-4 py-3 transition-colors duration-[var(--duration-fast)] ease-standard hover:border-ink-aqua"
            >
              <h3 className="m-0 font-display text-base leading-snug font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    onSelectNote(note.id);
                  }}
                  className={TITLE_BUTTON}
                >
                  {note.title}
                </button>
              </h3>
              <p className="m-0 text-sm leading-relaxed text-text-soft">{toPreview(note.body)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
