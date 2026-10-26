import { diffLines, type Change } from "diff";

export type DiffRowKind = "add" | "del" | "ctx" | "skip";

export interface DiffRow {
  kind: DiffRowKind;
  text: string;
  skipped?: number;
}

export interface LineDiff {
  rows: DiffRow[];
  added: number;
  removed: number;
}

const MAX_UNCOLLAPSED_LINES = 3;
const CONTEXT_LINES = 1;

const splitLines = (value: string): string[] => {
  const parts = value.split("\n");
  return parts.at(-1) === "" ? parts.slice(0, -1) : parts;
};

const toRow =
  (kind: DiffRowKind) =>
  (text: string): DiffRow => ({ kind, text });

const collapseUnchanged = (
  texts: string[],
  atStart: boolean,
  atEnd: boolean,
): DiffRow[] => {
  if (texts.length <= MAX_UNCOLLAPSED_LINES) return texts.map(toRow("ctx"));
  // 文書の端には続きが無いので、前後の文脈は変更に接する側にだけ残す。
  const head = atStart ? [] : texts.slice(0, CONTEXT_LINES);
  const tail = atEnd ? [] : texts.slice(-CONTEXT_LINES);
  const skipped = texts.length - head.length - tail.length;
  return [
    ...head.map(toRow("ctx")),
    { kind: "skip", text: "", skipped },
    ...tail.map(toRow("ctx")),
  ];
};

const rowsOf = (
  change: Change,
  index: number,
  changes: Change[],
): DiffRow[] => {
  const texts = splitLines(change.value);
  if (change.added) return texts.map(toRow("add"));
  if (change.removed) return texts.map(toRow("del"));
  return collapseUnchanged(texts, index === 0, index === changes.length - 1);
};

const countLines = (
  changes: Change[],
  pick: (change: Change) => boolean,
): number =>
  changes
    .filter(pick)
    .reduce((sum, change) => sum + splitLines(change.value).length, 0);

export const buildLineDiff = (previous: string, current: string): LineDiff => {
  // 末尾の改行だけの違いを変更と数えると、見た目が同じ行が「−」「＋」で並んでしまう。
  const changes = diffLines(previous, current, { ignoreNewlineAtEof: true });
  return {
    rows: changes.flatMap(rowsOf),
    added: countLines(changes, (change) => change.added),
    removed: countLines(changes, (change) => change.removed),
  };
};
