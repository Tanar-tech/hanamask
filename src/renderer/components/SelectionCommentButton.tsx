import { useEffect, useState, type CSSProperties, type JSX, type RefObject } from "react";
import type { CommentAnchor } from "../../shared/preload-api";
import { buildAnchor } from "../text-quote";

const LABEL = "コメント";
const GAP_BELOW_SELECTION_PX = 8;
const VIEWPORT_MARGIN_PX = 8;
// ボタンの幅・高さの見込み。画面の端からはみ出さないよう、この分だけ内側に寄せる。
const BUTTON_WIDTH_ALLOWANCE_PX = 96;
const BUTTON_HEIGHT_ALLOWANCE_PX = 40;

/* preflight を入れていないため、ブラウザ既定のマージン・ボタン外観を打ち消している */
const BUTTON =
  "fixed top-[var(--selection-comment-top)] left-[var(--selection-comment-left)] z-50 m-0 cursor-pointer appearance-none rounded-md border border-solid border-ink-aqua bg-paper-raised px-3 py-1 font-body text-xs text-ink-aqua-text shadow-md transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-ink-aqua/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";

interface SelectionCommentButtonProps {
  containerRef: RefObject<HTMLElement | null>;
  onRequestComment: (anchor: CommentAnchor) => void;
}

interface PendingSelection {
  anchor: CommentAnchor;
  top_px: number;
  left_px: number;
}

type PositionStyle = CSSProperties &
  Record<"--selection-comment-top" | "--selection-comment-left", string>;

const clamp = (value: number, max: number): number =>
  Math.max(VIEWPORT_MARGIN_PX, Math.min(value, max));

// Range.toString() は textContent と同じくテキストノードを連結するので、容器の textContent 上の位置になる。
const textOffsetWithin = (container: HTMLElement, node: Node, offset: number): number => {
  const before = container.ownerDocument.createRange();
  before.selectNodeContents(container);
  before.setEnd(node, offset);
  return before.toString().length;
};

const anchorOfRange = (container: HTMLElement, range: Range): CommentAnchor | null => {
  const start = textOffsetWithin(container, range.startContainer, range.startOffset);
  const end = textOffsetWithin(container, range.endContainer, range.endOffset);
  return buildAnchor(container.textContent ?? "", start, end);
};

// jsdom の Range には getBoundingClientRect が無い。
const rectOf = (range: Range, container: HTMLElement): DOMRect =>
  typeof range.getBoundingClientRect === "function"
    ? range.getBoundingClientRect()
    : container.getBoundingClientRect();

const readSelection = (container: HTMLElement | null): PendingSelection | null => {
  const selection = document.getSelection();
  if (container === null || selection === null || selection.isCollapsed) return null;
  if (selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const anchor = anchorOfRange(container, range);
  if (anchor === null) return null;
  const rect = rectOf(range, container);
  return {
    anchor,
    top_px: clamp(
      rect.bottom + GAP_BELOW_SELECTION_PX,
      window.innerHeight - BUTTON_HEIGHT_ALLOWANCE_PX,
    ),
    left_px: clamp(rect.right, window.innerWidth - BUTTON_WIDTH_ALLOWANCE_PX),
  };
};

const toPositionStyle = (pending: PendingSelection): PositionStyle => ({
  "--selection-comment-top": `${pending.top_px}px`,
  "--selection-comment-left": `${pending.left_px}px`,
});

export const SelectionCommentButton = ({
  containerRef,
  onRequestComment,
}: SelectionCommentButtonProps): JSX.Element | null => {
  const [pending, setPending] = useState<PendingSelection | null>(null);

  useEffect(() => {
    const update = (): void => {
      setPending(readSelection(containerRef.current));
    };
    document.addEventListener("selectionchange", update);
    return () => {
      document.removeEventListener("selectionchange", update);
    };
  }, [containerRef]);

  if (pending === null) return null;
  return (
    <button
      type="button"
      className={BUTTON}
      style={toPositionStyle(pending)}
      // 押した瞬間に選択が解けてボタンが消えないよう、フォーカス移動を止める。
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        onRequestComment(pending.anchor);
        document.getSelection()?.removeAllRanges();
        setPending(null);
      }}
    >
      {LABEL}
    </button>
  );
};
