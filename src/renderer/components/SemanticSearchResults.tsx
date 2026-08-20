import { useCallback, type JSX } from "react";
import {
  SECTION_LIST,
  SECTION_ROW,
  SemanticSection,
  TITLE_BUTTON,
  TYPE_BADGE,
  useSemanticSection,
} from "./SemanticSection";
import type { SemanticSearchResult } from "../../shared/preload-api";
import { toUpdatedLabel } from "../text/dateLabel";

const HEADING = "意味が近い記録";
const NOTE_LABEL = "ノート";
const TASK_LABEL = "タスク";
const NOTEBOOK_LABEL = "ノート（束）";
const SEMANTIC_LIMIT = 10;
const EMPTY_RESULT: SemanticSearchResult = { notes: [], tasks: [], notebooks: [] };

interface SelectHandlers {
  onSelectNote: (id: string) => void;
  onSelectTask?: (id: string) => void;
  onSelectNotebook?: (id: string) => void;
}

interface SemanticSearchResultsProps extends SelectHandlers {
  query: string;
}

interface ResultRow {
  key: string;
  id: string;
  title: string;
  score: number;
  typeLabel: string;
  updatedAt: string;
  onSelect: ((id: string) => void) | undefined;
}

interface RowSource {
  id: string;
  title: string;
  score: number;
  updatedAt: string;
}

const toRow =
  (typeLabel: string, onSelect: ((id: string) => void) | undefined) =>
  (source: RowSource): ResultRow => ({
    key: `${typeLabel}-${source.id}`,
    id: source.id,
    title: source.title,
    score: source.score,
    typeLabel,
    updatedAt: source.updatedAt,
    onSelect,
  });

// 種別で分けずスコアの降順で1本に並べる（近い順に読めることを優先する）。
const toRows = (result: SemanticSearchResult, handlers: SelectHandlers): ResultRow[] =>
  [
    ...result.notes.map(toRow(NOTE_LABEL, handlers.onSelectNote)),
    ...result.tasks.map(toRow(TASK_LABEL, handlers.onSelectTask)),
    ...result.notebooks.map(toRow(NOTEBOOK_LABEL, handlers.onSelectNotebook)),
  ].sort((left, right) => right.score - left.score);

const ResultTitle = ({ row }: { row: ResultRow }): JSX.Element => {
  const { onSelect } = row;
  if (onSelect === undefined) {
    return <span className="font-body text-sm font-semibold text-text">{row.title}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(row.id);
      }}
      className={TITLE_BUTTON}
    >
      {row.title}
    </button>
  );
};

export const SemanticSearchResults = ({
  query,
  onSelectNote,
  onSelectTask,
  onSelectNotebook,
}: SemanticSearchResultsProps): JSX.Element | null => {
  const load = useCallback(() => window.hanamask.semanticSearch(query, SEMANTIC_LIMIT), [query]);
  const { status, result } = useSemanticSection(load, EMPTY_RESULT);

  const rows = toRows(result, { onSelectNote, onSelectTask, onSelectNotebook });
  if (status?.state === "ready" && rows.length === 0) return null;

  return (
    <SemanticSection
      heading={HEADING}
      status={status}
      unavailable={result.unavailable !== undefined}
    >
      <ul aria-label={HEADING} className={SECTION_LIST}>
        {rows.map((row) => (
          <li key={row.key} className={SECTION_ROW}>
            <ResultTitle row={row} />
            <span className="flex items-center gap-3">
              <span className={TYPE_BADGE}>{toUpdatedLabel(row.updatedAt)}</span>
              <span className={TYPE_BADGE}>{row.typeLabel}</span>
            </span>
          </li>
        ))}
      </ul>
    </SemanticSection>
  );
};
