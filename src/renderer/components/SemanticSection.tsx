import { useEffect, useState, type JSX, type ReactNode } from "react";
import type { EmbeddingStatus } from "../../shared/preload-api";

const UNAVAILABLE_STATUS: EmbeddingStatus = {
  state: "unavailable",
  pending: 0,
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

interface SectionRead<T> {
  status: EmbeddingStatus;
  result: T;
}

const readSection = async <T,>(load: () => Promise<T>): Promise<SectionRead<T>> => {
  const [status, result] = await Promise.all([window.hanamask.readEmbeddingStatus(), load()]);
  return { status, result };
};

/** 意味検索の欄で共通する「状態と結果を読み、状態変化で読み直す」部分。 */
export const useSemanticSection = <T,>(
  load: () => Promise<T>,
  emptyResult: T,
): { status: EmbeddingStatus | null; result: T } => {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [result, setResult] = useState<T>(emptyResult);

  useEffect(() => {
    let abandoned = false;
    const refresh = async (): Promise<void> => {
      try {
        const next = await readSection(load);
        if (abandoned) return;
        setStatus(next.status);
        setResult(next.result);
      } catch {
        // 意味検索は補助的な欄なので、失敗しても他の表示を壊さず黙って引っ込める。
        if (!abandoned) setStatus(UNAVAILABLE_STATUS);
      }
    };
    void refresh();
    const unsubscribe = window.hanamask.onEmbeddingStatusChanged(() => {
      void refresh();
    });
    return () => {
      abandoned = true;
      unsubscribe();
    };
  }, [load, emptyResult]);

  return { status, result };
};

interface SemanticSectionProps {
  heading: string;
  status: EmbeddingStatus | null;
  unavailable: boolean;
  children: ReactNode;
}

/** 見出しと、読み込み中・使えないときの扱いをまとめた入れ物。中身は呼び出し側が描く。 */
export const SemanticSection = ({
  heading,
  status,
  unavailable,
  children,
}: SemanticSectionProps): JSX.Element | null => {
  if (status === null || status.state === "unavailable" || unavailable) return null;

  return (
    <section className={SECTION}>
      <h3 className={SECTION_HEADING}>{heading}</h3>
      {status.state === "loading" ? (
        <p className={SECTION_NOTE_MESSAGE}>{LOADING_MESSAGE}</p>
      ) : (
        children
      )}
    </section>
  );
};
