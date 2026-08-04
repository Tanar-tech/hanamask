import { useEffect, useState, type JSX } from "react";
import type { Note } from "../../shared/preload-api";
import { MermaidDiagram } from "./MermaidDiagram";

interface NoteDetailProps {
  noteId: string;
  onBack: () => void;
}

interface BodySegment {
  kind: "text" | "mermaid";
  content: string;
}

const NOT_FOUND_MESSAGE = "ノートが見つかりません";

const MERMAID_FENCE = /^```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n?^```[ \t]*$/gm;

const splitByMermaidFence = (body: string): BodySegment[] => {
  const segments: BodySegment[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(MERMAID_FENCE)) {
    const text = body.slice(lastIndex, match.index);
    if (text.trim() !== "") segments.push({ kind: "text", content: text });
    segments.push({ kind: "mermaid", content: match[1] ?? "" });
    lastIndex = match.index + match[0].length;
  }
  const rest = body.slice(lastIndex);
  if (rest.trim() !== "") segments.push({ kind: "text", content: rest });
  return segments;
};

const renderSegment = (segment: BodySegment, index: number): JSX.Element =>
  segment.kind === "mermaid" ? (
    <MermaidDiagram key={`${segment.kind}-${index}`} code={segment.content} />
  ) : (
    <p key={`${segment.kind}-${index}`} style={{ whiteSpace: "pre-wrap" }}>
      {segment.content}
    </p>
  );

export const NoteDetail = ({ noteId, onBack }: NoteDetailProps): JSX.Element => {
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // ノート切替時に古い取得結果が後から届いて上書きするのを防ぐ。
    let current = true;
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.getNote(noteId);
        if (!current) return;
        setNote(loaded);
        setError(loaded === null ? NOT_FOUND_MESSAGE : null);
      } catch (cause) {
        if (current) setError(`ノートの読み込みに失敗しました: ${String(cause)}`);
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [noteId]);

  return (
    <article>
      <button type="button" onClick={onBack}>
        戻る
      </button>
      {error !== null && <p role="alert">{error}</p>}
      {note !== null && error === null && (
        <>
          <h2>{note.title}</h2>
          {splitByMermaidFence(note.body).map(renderSegment)}
          <ul>
            {note.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
};
