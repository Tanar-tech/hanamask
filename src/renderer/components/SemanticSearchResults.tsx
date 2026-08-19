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

const HEADING = "意味が近い記録";
const NOTE_LABEL = "ノート";
const TASK_LABEL = "タスク";
const SEMANTIC_LIMIT = 10;
const EMPTY_RESULT: SemanticSearchResult = { notes: [], tasks: [] };

interface SemanticSearchResultsProps {
  query: string;
  onSelectNote: (id: string) => void;
  onSelectTask?: (id: string) => void;
}

interface ResultRow {
  key: string;
  id: string;
  title: string;
  score: number;
  typeLabel: string;
  onSelect: ((id: string) => void) | undefined;
}

// ノートとタスクを分けずスコアの降順で1本に並べる（近い順に読めることを優先する）。
const toRows = (
  result: SemanticSearchResult,
  onSelectNote: (id: string) => void,
  onSelectTask: ((id: string) => void) | undefined,
): ResultRow[] =>
  [
    ...result.notes.map((note) => ({
      key: `note-${note.id}`,
      id: note.id,
      title: note.title,
      score: note.score,
      typeLabel: NOTE_LABEL,
      onSelect: onSelectNote,
    })),
    ...result.tasks.map((task) => ({
      key: `task-${task.id}`,
      id: task.id,
      title: task.title,
      score: task.score,
      typeLabel: TASK_LABEL,
      onSelect: onSelectTask,
    })),
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
}: SemanticSearchResultsProps): JSX.Element | null => {
  const load = useCallback(() => window.hanamask.semanticSearch(query, SEMANTIC_LIMIT), [query]);
  const { status, result } = useSemanticSection(load, EMPTY_RESULT);

  const rows = toRows(result, onSelectNote, onSelectTask);
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
            <span className={TYPE_BADGE}>{row.typeLabel}</span>
          </li>
        ))}
      </ul>
    </SemanticSection>
  );
};
