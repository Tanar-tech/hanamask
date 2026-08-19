import { useCallback, useEffect, useState, type JSX } from "react";
import type { Note, Task } from "../../shared/preload-api";

/*
 * 意味検索のpreload APIはPhase 4で `preload-api.ts` に入る。それまでの間、
 * レンダラー側だけで契約を持ち、実体があるかどうかを実行時に確かめてから使う。
 */
export interface ScoredNote extends Note {
  score: number;
}

export interface ScoredTask extends Task {
  score: number;
}

export interface SemanticSearchResult {
  notes: ScoredNote[];
  tasks: ScoredTask[];
  unavailable?: string;
}

export interface RelatedNotesResult {
  notes: ScoredNote[];
  unavailable?: string;
}

export interface EmbeddingStatus {
  state: "ready" | "loading" | "unavailable";
  pending: number;
  reason?: string;
}

export interface EmbeddingApi {
  semanticSearch(query: string, limit?: number): Promise<SemanticSearchResult>;
  relatedNotes(noteId: string, limit?: number): Promise<RelatedNotesResult>;
  readEmbeddingStatus(): Promise<EmbeddingStatus>;
  onEmbeddingStatusChanged(callback: (status: EmbeddingStatus) => void): () => void;
}

const EMBEDDING_API_KEYS: readonly string[] = [
  "semanticSearch",
  "relatedNotes",
  "readEmbeddingStatus",
  "onEmbeddingStatusChanged",
];

const isEmbeddingApi = (api: object): api is EmbeddingApi =>
  EMBEDDING_API_KEYS.every((key) => typeof Reflect.get(api, key) === "function");

export const readEmbeddingApi = (): EmbeddingApi | null => {
  const api: object = window.hanamask;
  return isEmbeddingApi(api) ? api : null;
};

const UNAVAILABLE_STATUS: EmbeddingStatus = {
  state: "unavailable",
  pending: 0,
};

/** 意味検索の欄で共通する「状態と結果を読み、状態変化で読み直す」部分。 */
export const useSemanticSection = <T,>(
  load: (api: EmbeddingApi) => Promise<T>,
  emptyResult: T,
): { status: EmbeddingStatus | null; result: T } => {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [result, setResult] = useState<T>(emptyResult);

  useEffect(() => {
    const api = readEmbeddingApi();
    if (api === null) return;
    let abandoned = false;
    const refresh = async (): Promise<void> => {
      try {
        const [nextStatus, nextResult] = await Promise.all([api.readEmbeddingStatus(), load(api)]);
        if (abandoned) return;
        setStatus(nextStatus);
        setResult(nextResult);
      } catch {
        // 意味検索は補助的な欄なので、失敗しても他の表示を壊さず黙って引っ込める。
        if (!abandoned) setStatus(UNAVAILABLE_STATUS);
      }
    };
    void refresh();
    const unsubscribe = api.onEmbeddingStatusChanged(() => {
      void refresh();
    });
    return () => {
      abandoned = true;
      unsubscribe();
    };
  }, [load, emptyResult]);

  return { status, result };
};

export const LOADING_MESSAGE = "準備中です";

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
export const SECTION = "flex flex-col gap-3 font-body text-text";
export const SECTION_HEADING = "m-0 font-display text-sm tracking-wide text-text-faint";
export const SECTION_LIST = "m-0 flex list-none flex-col gap-2 p-0";
export const SECTION_ROW =
  "flex flex-wrap items-center justify-between gap-3 rounded-md border border-solid border-line bg-paper-raised px-4 py-2 transition-colors duration-[var(--duration-fast)] ease-standard hover:border-ink-aqua";
export const SECTION_NOTE_MESSAGE =
  "m-0 rounded-md border border-dashed border-line bg-paper px-4 py-3 text-center text-sm text-text-faint";
export const TITLE_BUTTON = `${FOCUS_RING} m-0 cursor-pointer appearance-none border-0 bg-transparent p-0 text-left font-body text-sm font-semibold text-ink-aqua-text underline-offset-4 hover:underline`;
export const TYPE_BADGE = "font-body text-xs text-text-faint";

const HEADING = "関連するノート";
const RELATED_LIMIT = 5;
const EMPTY_RESULT: RelatedNotesResult = { notes: [] };

interface RelatedNotesProps {
  noteId: string;
  onSelectNote: (id: string) => void;
}

export const RelatedNotes = ({ noteId, onSelectNote }: RelatedNotesProps): JSX.Element | null => {
  const load = useCallback(
    (api: EmbeddingApi) => api.relatedNotes(noteId, RELATED_LIMIT),
    [noteId],
  );
  const { status, result } = useSemanticSection(load, EMPTY_RESULT);

  if (status === null || status.state === "unavailable") return null;
  if (result.unavailable !== undefined) return null;

  if (status.state === "loading") {
    return (
      <section className={SECTION}>
        <h3 className={SECTION_HEADING}>{HEADING}</h3>
        <p className={SECTION_NOTE_MESSAGE}>{LOADING_MESSAGE}</p>
      </section>
    );
  }

  // 自分自身は「関連」ではないので出さない（main側でも除くが、UIでも取りこぼさない）。
  const notes = result.notes.filter((note) => note.id !== noteId).slice(0, RELATED_LIMIT);
  if (notes.length === 0) return null;

  return (
    <section className={SECTION}>
      <h3 className={SECTION_HEADING}>{HEADING}</h3>
      <ul aria-label={HEADING} className={SECTION_LIST}>
        {notes.map((note) => (
          <li key={note.id} className={SECTION_ROW}>
            <button
              type="button"
              onClick={() => {
                onSelectNote(note.id);
              }}
              className={TITLE_BUTTON}
            >
              {note.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
