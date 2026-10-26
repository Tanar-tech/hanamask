import { useEffect, useMemo, useState, type JSX } from "react";
import type {
  ChangesSinceView as PreviousContent,
  DiffableEntityType,
} from "../../shared/preload-api";
import { buildLineDiff, type DiffRow, type DiffRowKind } from "../diff-lines";

interface ChangesSinceViewProps {
  entityType: DiffableEntityType;
  id: string;
  currentTitle: string;
  currentBody: string;
}

interface Loaded {
  key: string;
  previous: PreviousContent | null;
}

const HEADING = "前回から変わったところ";
const CLOSE_LABEL = "閉じる";
const EMPTY_LINE = " ";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const PANEL =
  "m-0 flex flex-col gap-2 rounded-md border border-ink-pink bg-paper-raised px-4 py-3";
const CLOSE_BUTTON = `${FOCUS_RING} m-0 shrink-0 cursor-pointer appearance-none rounded-md border border-line bg-transparent px-2 py-1 font-body text-xs text-text-soft hover:bg-paper`;
const LINES =
  "m-0 overflow-x-auto rounded-md border border-line font-mono text-xs leading-relaxed";
const LINE = "flex gap-2 whitespace-pre-wrap break-words px-2";

const ROW_STYLE: Record<DiffRowKind, string> = {
  add: "bg-ok/10 text-text",
  del: "bg-crit/10 text-text",
  ctx: "text-text-soft",
  skip: "italic text-text-faint",
};

const MARKS: Record<
  "add" | "del",
  { symbol: string; label: string; color: string }
> = {
  add: { symbol: "+", label: "追加", color: "text-ok" },
  del: { symbol: "−", label: "削除", color: "text-crit" },
};

const keyOf = (entityType: DiffableEntityType, id: string): string =>
  `${entityType}:${id}`;

const readPrevious = async (
  entityType: DiffableEntityType,
  id: string,
): Promise<PreviousContent | null> => {
  try {
    return await window.hanamask.readChangesSinceView(entityType, id);
  } catch {
    // 差分が出せなくても本文は読めるため、出さないだけにする。
    return null;
  }
};

const usePreviousContent = (
  entityType: DiffableEntityType,
  id: string,
): PreviousContent | null => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let current = true;
    const load = async (): Promise<void> => {
      // 既読にすると「最後に見た時点」が今になり差分が消えるため、必ず読み終えてから既読にする。
      const previous = await readPrevious(entityType, id);
      // 切り替え後や StrictMode の再実行で古い側が既読にすると、新しい側の読み込みが空になる。
      if (!current) return;
      setLoaded({ key: keyOf(entityType, id), previous });
      window.hanamask.markViewed(entityType, id).catch(() => undefined);
    };
    void load();
    return () => {
      current = false;
    };
  }, [entityType, id]);
  return loaded?.key === keyOf(entityType, id) ? loaded.previous : null;
};

const formatSummary = (added: number, removed: number): string =>
  `${added}行を足し、${removed}行を消しました`;

const DiffLine = ({ row }: { row: DiffRow }): JSX.Element => {
  if (row.kind === "skip") {
    return (
      <div
        className={`${LINE} ${ROW_STYLE.skip}`}
      >{`変わっていない${row.skipped ?? 0}行を省略`}</div>
    );
  }
  const mark = row.kind === "ctx" ? null : MARKS[row.kind];
  return (
    <div data-kind={row.kind} className={`${LINE} ${ROW_STYLE[row.kind]}`}>
      <span
        aria-hidden="true"
        className={`w-3 shrink-0 select-none ${mark?.color ?? ""}`}
      >
        {mark?.symbol ?? " "}
      </span>
      {mark ? <span className="sr-only">{mark.label}</span> : null}
      <span>{row.text === "" ? EMPTY_LINE : row.text}</span>
    </div>
  );
};

const PanelHeader = ({
  summary,
  onClose,
}: {
  summary: string | null;
  onClose: () => void;
}): JSX.Element => (
  <div className="flex items-start justify-between gap-3">
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="m-0 font-body text-sm font-bold text-ink-pink">{HEADING}</p>
      {summary ? (
        <p className="m-0 font-body text-xs text-text-soft">{summary}</p>
      ) : null}
    </div>
    <button type="button" className={CLOSE_BUTTON} onClick={onClose}>
      {CLOSE_LABEL}
    </button>
  </div>
);

const TitleChange = ({
  from,
  to,
}: {
  from: string;
  to: string;
}): JSX.Element => (
  <p className="m-0 break-words font-body text-xs text-text-soft">
    {`タイトル: 「${from}」→「${to}」`}
  </p>
);

const DiffLines = ({ rows }: { rows: DiffRow[] }): JSX.Element => (
  <div className={LINES}>
    {rows.map((row, index) => (
      // 行は並び順そのものが意味で、並べ替えも挿入もされないため位置を鍵にしてよい。
      <DiffLine key={index} row={row} />
    ))}
  </div>
);

export const ChangesSinceView = ({
  entityType,
  id,
  currentTitle,
  currentBody,
}: ChangesSinceViewProps): JSX.Element | null => {
  const previous = usePreviousContent(entityType, id);
  const [closedKey, setClosedKey] = useState<string | null>(null);
  const diff = useMemo(
    () => (previous ? buildLineDiff(previous.previousBody, currentBody) : null),
    [previous, currentBody],
  );
  if (!previous || !diff || closedKey === keyOf(entityType, id)) return null;
  const bodyChanged = diff.added + diff.removed > 0;
  const titleChanged = previous.previousTitle !== currentTitle;
  if (!bodyChanged && !titleChanged) return null;
  return (
    <section role="region" aria-label={HEADING} className={PANEL}>
      <PanelHeader
        summary={bodyChanged ? formatSummary(diff.added, diff.removed) : null}
        onClose={() => setClosedKey(keyOf(entityType, id))}
      />
      {titleChanged ? (
        <TitleChange from={previous.previousTitle} to={currentTitle} />
      ) : null}
      {bodyChanged ? <DiffLines rows={diff.rows} /> : null}
    </section>
  );
};
