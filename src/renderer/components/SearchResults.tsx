import { useEffect, useState, type JSX } from "react";
import type { Note } from "../../shared/preload-api";

const BODY_PREVIEW_LENGTH = 120;

const toPreview = (body: string): string =>
  body.length > BODY_PREVIEW_LENGTH ? `${body.slice(0, BODY_PREVIEW_LENGTH)}…` : body;

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
    <section>
      <button type="button" onClick={onBack}>
        戻る
      </button>
      <h2>「{query}」の検索結果</h2>
      {error !== null && <p role="alert">{error}</p>}
      {error === null && notes.length === 0 && <p>該当するノートはありません</p>}
      <ul>
        {notes.map((note) => (
          <li key={note.id}>
            <h3>
              <button
                type="button"
                onClick={() => {
                  onSelectNote(note.id);
                }}
              >
                {note.title}
              </button>
            </h3>
            <p>{toPreview(note.body)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
};
