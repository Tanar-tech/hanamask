import { useEffect, useState, type RefObject } from "react";
import type { CommentAnchor } from "../../shared/preload-api";
import { locateAnchor, type TextRange } from "../text-quote";

export const HIGHLIGHT_NAME = "hanamask-comment";

const SCROLL_OPTIONS: ScrollIntoViewOptions = {
  block: "center",
  behavior: "smooth",
};

interface TextSpan {
  node: Text;
  start: number;
}

interface TextPosition {
  node: Text;
  offset: number;
}

// jsdom や古い Chromium には無い。光らせられない環境では何もしない。
const supportsHighlight = (): boolean =>
  typeof CSS !== "undefined" &&
  CSS !== undefined &&
  "highlights" in CSS &&
  typeof Highlight === "function";

const collectTextNodes = (container: HTMLElement): Text[] => {
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    if (walker.currentNode instanceof Text) nodes.push(walker.currentNode);
  }
  return nodes;
};

const toSpans = (nodes: Text[]): TextSpan[] =>
  nodes.reduce<TextSpan[]>((spans, node) => {
    const previous = spans.at(-1);
    const start = previous === undefined ? 0 : previous.start + previous.node.data.length;
    return [...spans, { node, start }];
  }, []);

// 始点は次の文字を含むノード、終点は直前の文字を含むノードに置く。境界で隣のノードに寄ると光る範囲がずれる。
const positionAt = (
  spans: TextSpan[],
  offset: number,
  edge: "start" | "end",
): TextPosition | null => {
  const span = spans.find(({ node, start }) =>
    edge === "start"
      ? start <= offset && offset < start + node.data.length
      : start < offset && offset <= start + node.data.length,
  );
  return span === undefined ? null : { node: span.node, offset: offset - span.start };
};

/** 容器の textContent 上の位置を、テキストノードをまたぐ DOM の Range にする。 */
export const rangeFromTextOffsets = (container: HTMLElement, target: TextRange): Range | null => {
  const spans = toSpans(collectTextNodes(container));
  const start = positionAt(spans, target.start, "start");
  const end = positionAt(spans, target.end, "end");
  if (start === null || end === null) return null;
  const range = container.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
};

const locateRange = (container: HTMLElement, anchor: CommentAnchor): Range | null => {
  const located = locateAnchor(container.textContent ?? "", anchor);
  return located === null ? null : rangeFromTextOffsets(container, located);
};

/*
 * 本文の DOM は書き換えない。MarkdownBody が描いた要素に印の要素を差し込むと、
 * React の再描画とぶつかるうえ、信頼できない本文の DOM を触ることになるため（SECURITY.md）。
 */
export const useTextQuoteHighlight = (
  containerRef: RefObject<HTMLElement | null>,
  anchor: CommentAnchor | null,
): boolean => {
  const [foundQuote, setFoundQuote] = useState<string | null>(null);
  // 取り直しのたびに目印のオブジェクトは作り直されるため、中身で比べる。
  const quote = anchor?.quote ?? null;
  const prefix = anchor?.prefix ?? "";
  const suffix = anchor?.suffix ?? "";

  useEffect(() => {
    const container = containerRef.current;
    if (quote === null || container === null || !supportsHighlight()) return undefined;
    const range = locateRange(container, { quote, prefix, suffix });
    if (range === null) return undefined;
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
    range.startContainer.parentElement?.scrollIntoView(SCROLL_OPTIONS);
    setFoundQuote(quote);
    return () => {
      CSS.highlights.delete(HIGHLIGHT_NAME);
      setFoundQuote(null);
    };
  }, [containerRef, quote, prefix, suffix]);

  return quote !== null && foundQuote === quote;
};
