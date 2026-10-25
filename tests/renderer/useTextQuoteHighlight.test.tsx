/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useRef, type JSX } from "react";
import {
  HIGHLIGHT_NAME,
  useTextQuoteHighlight,
} from "../../src/renderer/hooks/useTextQuoteHighlight";
import type { CommentAnchor } from "../../src/shared/preload-api";

const Harness = ({ anchor }: { anchor: CommentAnchor | null }): JSX.Element => {
  const ref = useRef<HTMLDivElement | null>(null);
  const found = useTextQuoteHighlight(ref, anchor);
  return (
    <div>
      <div ref={ref} data-testid="body">
        <p>前の文。</p>
        <p>
          ここを<strong>選ぶ</strong>。後の文。
        </p>
      </div>
      <output>{found ? "found" : "not-found"}</output>
    </div>
  );
};

const ANCHOR: CommentAnchor = {
  quote: "ここを選ぶ",
  prefix: "前の文。",
  suffix: "。",
};

class FakeHighlight {
  readonly ranges: Range[];
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

const installHighlightApi = (): Map<string, FakeHighlight> => {
  const registry = new Map<string, FakeHighlight>();
  vi.stubGlobal("CSS", { highlights: registry });
  vi.stubGlobal("Highlight", FakeHighlight);
  return registry;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useTextQuoteHighlight", () => {
  it("CSS Custom Highlight API が無い環境では何もせず false を返す", () => {
    vi.stubGlobal("CSS", undefined);
    render(<Harness anchor={ANCHOR} />);
    expect(screen.getByText("not-found")).toBeTruthy();
  });

  describe("CSS Custom Highlight API がある環境", () => {
    it("引用の範囲を、要素をまたいで光らせ、スクロールする", async () => {
      const registry = installHighlightApi();
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      render(<Harness anchor={ANCHOR} />);
      await waitFor(() => {
        expect(screen.getByText("found")).toBeTruthy();
      });
      const range = registry.get(HIGHLIGHT_NAME)?.ranges[0];
      expect(range?.toString()).toBe("ここを選ぶ");
      expect(scrollIntoView).toHaveBeenCalled();
    });

    it("本文に引用が無ければ光らせず false", () => {
      const registry = installHighlightApi();
      render(<Harness anchor={{ quote: "無い文字", prefix: "", suffix: "" }} />);
      expect(screen.getByText("not-found")).toBeTruthy();
      expect(registry.has(HIGHLIGHT_NAME)).toBe(false);
    });

    it("目印が外れたら・アンマウントしたら光を消す", async () => {
      const registry = installHighlightApi();
      Element.prototype.scrollIntoView = vi.fn();
      const view = render(<Harness anchor={ANCHOR} />);
      await waitFor(() => {
        expect(registry.has(HIGHLIGHT_NAME)).toBe(true);
      });
      view.rerender(<Harness anchor={null} />);
      expect(registry.has(HIGHLIGHT_NAME)).toBe(false);
      expect(screen.getByText("not-found")).toBeTruthy();
      view.rerender(<Harness anchor={ANCHOR} />);
      await waitFor(() => {
        expect(registry.has(HIGHLIGHT_NAME)).toBe(true);
      });
      view.unmount();
      expect(registry.has(HIGHLIGHT_NAME)).toBe(false);
    });
  });
});
