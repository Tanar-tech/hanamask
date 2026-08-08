import type { JSX } from "react";
import { MarkdownBody } from "./MarkdownBody";
import { MermaidDiagram } from "./MermaidDiagram";

interface MarkdownDocumentProps {
  content: string;
}

interface BodySegment {
  kind: "text" | "mermaid";
  content: string;
}

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
    <MarkdownBody key={`${segment.kind}-${index}`} content={segment.content} />
  );

export const MarkdownDocument = ({ content }: MarkdownDocumentProps): JSX.Element => (
  <div className="flex flex-col gap-4">{splitByMermaidFence(content).map(renderSegment)}</div>
);
