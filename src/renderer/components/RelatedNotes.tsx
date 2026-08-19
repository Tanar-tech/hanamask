import { useCallback, type JSX } from "react";
import {
  SECTION_LIST,
  SECTION_ROW,
  SemanticSection,
  TITLE_BUTTON,
  useSemanticSection,
} from "./SemanticSection";
import type { RelatedNotesResult } from "../../shared/preload-api";

const HEADING = "関連するノート";
const RELATED_LIMIT = 5;
const EMPTY_RESULT: RelatedNotesResult = { notes: [] };

interface RelatedNotesProps {
  noteId: string;
  onSelectNote: (id: string) => void;
}

export const RelatedNotes = ({ noteId, onSelectNote }: RelatedNotesProps): JSX.Element | null => {
  const load = useCallback(() => window.hanamask.relatedNotes(noteId, RELATED_LIMIT), [noteId]);
  const { status, result } = useSemanticSection(load, EMPTY_RESULT);

  // 自分自身は「関連」ではないので出さない（main側でも除くが、UIでも取りこぼさない）。
  const notes = result.notes.filter((note) => note.id !== noteId).slice(0, RELATED_LIMIT);
  if (status?.state === "ready" && notes.length === 0) return null;

  return (
    <SemanticSection
      heading={HEADING}
      status={status}
      unavailable={result.unavailable !== undefined}
    >
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
    </SemanticSection>
  );
};
