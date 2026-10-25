/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { UnreadMark } from "../../src/renderer/components/UnreadMark";

afterEach(cleanup);

describe("UnreadMark", () => {
  it("「未読」の文字を1回だけ読み上げ対象にする", () => {
    const { container } = render(<UnreadMark />);

    expect(screen.getAllByText("未読")).toHaveLength(1);
    expect(container.textContent).toBe("未読");
  });

  it("点は飾りとして読み上げから外す", () => {
    const { container } = render(<UnreadMark />);

    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden).toHaveLength(1);
    expect(hidden[0]?.textContent).toBe("");
  });

  it("ボタンではない（行ボタンの名前に混ざらないよう外に置く前提）", () => {
    render(<UnreadMark />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
