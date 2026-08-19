import { useCallback, type JSX } from "react";
import {
  LOADING_MESSAGE,
  SECTION,
  SECTION_HEADING,
  SECTION_LIST,
  SECTION_NOTE_MESSAGE,
  SECTION_ROW,
  TITLE_BUTTON,
  TYPE_BADGE,
  useSemanticSection,
  type EmbeddingApi,
  type SemanticSearchResult,
} from "./RelatedNotes";

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
  typeLabel: string;
  onSelect: ((id: string) => void) | undefined;
}

const toRows = (
  result: SemanticSearchResult,
  onSelectNote: (id: string) => void,
  onSelectTask: ((id: string) => void) | undefined,
): ResultRow[] => [
  ...result.notes.map((note) => ({
    key: `note-${note.id}`,
    id: note.id,
    title: note.title,
    typeLabel: NOTE_LABEL,
    onSelect: onSelectNote,
  })),
  ...result.tasks.map((task) => ({
    key: `task-${task.id}`,
    id: task.id,
    title: task.title,
    typeLabel: TASK_LABEL,
    onSelect: onSelectTask,
  })),
];

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
  const load = useCallback(
    (api: EmbeddingApi) => api.semanticSearch(query, SEMANTIC_LIMIT),
    [query],
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

  const rows = toRows(result, onSelectNote, onSelectTask);
  if (rows.length === 0) return null;

  return (
    <section className={SECTION}>
      <h3 className={SECTION_HEADING}>{HEADING}</h3>
      <ul aria-label={HEADING} className={SECTION_LIST}>
        {rows.map((row) => (
          <li key={row.key} className={SECTION_ROW}>
            <ResultTitle row={row} />
            <span className={TYPE_BADGE}>{row.typeLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
