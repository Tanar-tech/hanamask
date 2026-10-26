/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, type JSX } from "react";
import { SelectionCommentButton } from "../../src/renderer/components/SelectionCommentButton";
import type { CommentAnchor } from "../../src/shared/preload-api";

const BUTTON_NAME = "コメント";

const Harness = ({
  onRequestComment,
}: {
  onRequestComment: (anchor: CommentAnchor) => void;
}): JSX.Element => {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div>
      <p data-testid="outside">外の文章</p>
      <div ref={ref} data-testid="body">
        <p>前の文。</p>
        <p>
          ここを<strong>選ぶ</strong>。後の文。
        </p>
      </div>
      <SelectionCommentButton containerRef={ref} onRequestComment={onRequestComment} />
    </div>
  );
};

const textNodeOf = (element: Element): Text => {
  const node = element.firstChild;
  if (!(node instanceof Text)) throw new Error("text node expected");
  return node;
};

const select = async (start: [Node, number], end: [Node, number]): Promise<void> => {
  const range = document.createRange();
  range.setStart(...start);
  range.setEnd(...end);
  await act(async () => {
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
};

// 「ここを」の先頭から <strong> の「選ぶ」の末尾までを選ぶ。
const selectQuote = async (): Promise<void> => {
  const paragraph = screen.getByText("選ぶ").parentElement;
  if (paragraph === null) throw new Error("paragraph expected");
  await select([textNodeOf(paragraph), 0], [textNodeOf(screen.getByText("選ぶ")), 2]);
};

beforeEach(() => {
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(100, 200, 50, 20);
});

afterEach(() => {
  cleanup();
  document.getSelection()?.removeAllRanges();
});

describe("SelectionCommentButton", () => {
  it("選択が無ければボタンを出さない", () => {
    render(<Harness onRequestComment={vi.fn()} />);
    expect(screen.queryByRole("button", { name: BUTTON_NAME })).toBeNull();
  });

  it("本文の中を選ぶとボタンが出て、押すと引用と前後の文字を渡し選択を解く", async () => {
    const onRequestComment = vi.fn();
    render(<Harness onRequestComment={onRequestComment} />);
    await selectQuote();
    fireEvent.click(screen.getByRole("button", { name: BUTTON_NAME }));
    expect(onRequestComment).toHaveBeenCalledWith({
      quote: "ここを選ぶ",
      prefix: "前の文。",
      suffix: "。後の文。",
    });
    expect(document.getSelection()?.isCollapsed ?? true).toBe(true);
    expect(screen.queryByRole("button", { name: BUTTON_NAME })).toBeNull();
  });

  it("ボタンは選択の終わりの近くに固定配置で出る", async () => {
    render(<Harness onRequestComment={vi.fn()} />);
    await selectQuote();
    const button = screen.getByRole("button", { name: BUTTON_NAME });
    expect(button.className).toContain("fixed");
    expect(button.style.getPropertyValue("--selection-comment-top")).toBe("228px");
    expect(button.style.getPropertyValue("--selection-comment-left")).toBe("150px");
  });

  it("本文の外の選択ではボタンを出さない", async () => {
    render(<Harness onRequestComment={vi.fn()} />);
    const outside = textNodeOf(screen.getByTestId("outside"));
    await select([outside, 0], [outside, 2]);
    expect(screen.queryByRole("button", { name: BUTTON_NAME })).toBeNull();
  });

  it("空白だけの選択ではボタンを出さない", async () => {
    render(<Harness onRequestComment={vi.fn()} />);
    const body = screen.getByTestId("body");
    body.append(document.createTextNode("   "));
    const space = body.lastChild;
    if (space === null) throw new Error("space expected");
    await select([space, 0], [space, 3]);
    expect(screen.queryByRole("button", { name: BUTTON_NAME })).toBeNull();
  });

  it("選択を解くとボタンが消える", async () => {
    render(<Harness onRequestComment={vi.fn()} />);
    await selectQuote();
    expect(screen.getByRole("button", { name: BUTTON_NAME })).toBeTruthy();
    await act(async () => {
      document.getSelection()?.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(screen.queryByRole("button", { name: BUTTON_NAME })).toBeNull();
  });
});
