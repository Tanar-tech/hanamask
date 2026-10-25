/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ChangesSinceView } from "../../src/renderer/components/ChangesSinceView";
import type { ChangesSinceView as Changes } from "../../src/shared/preload-api";
import { stubHanamask } from "./hanamask-stub";

const REGION = { name: "前回から変わったところ" };

const previous = (overrides: Partial<Changes> = {}): Changes => ({
  viewedAt: "2026-10-25T00:00:00.000Z",
  previousTitle: "設計メモ",
  previousBody: "a\nb\nc",
  ...overrides,
});

const setup = (read: () => Promise<Changes | null>) => {
  const calls: string[] = [];
  const readChangesSinceView = vi.fn(async () => {
    calls.push("read");
    return read();
  });
  const markViewed = vi.fn(async () => {
    calls.push("mark");
  });
  stubHanamask({ readChangesSinceView, markViewed });
  return { calls, readChangesSinceView, markViewed };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChangesSinceView", () => {
  it("差分を読み終えてから既読にする（逆だと必ず null が返る）", async () => {
    let resolveRead: (value: Changes | null) => void = () => undefined;
    const { calls, markViewed } = setup(
      () => new Promise<Changes | null>((resolve) => (resolveRead = resolve)),
    );
    render(
      <ChangesSinceView
        entityType="note"
        id="n1"
        currentTitle="設計メモ"
        currentBody="a"
      />,
    );
    await waitFor(() => expect(calls).toEqual(["read"]));
    expect(markViewed).not.toHaveBeenCalled();

    await act(async () => resolveRead(null));

    await waitFor(() => expect(calls).toEqual(["read", "mark"]));
    expect(markViewed).toHaveBeenCalledWith("note", "n1");
  });

  it("null なら何も出さない", async () => {
    const { markViewed } = setup(async () => null);
    const { container } = render(
      <ChangesSinceView
        entityType="notebook"
        id="b1"
        currentTitle="t"
        currentBody="x"
      />,
    );

    await waitFor(() => expect(markViewed).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("タイトルも本文も同じなら何も出さない", async () => {
    const { markViewed } = setup(async () => previous());
    const { container } = render(
      <ChangesSinceView
        entityType="note"
        id="n1"
        currentTitle="設計メモ"
        currentBody={"a\nb\nc"}
      />,
    );

    await waitFor(() => expect(markViewed).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("足した行と消した行を記号と件数で示す", async () => {
    setup(async () => previous());
    render(
      <ChangesSinceView
        entityType="note"
        id="n1"
        currentTitle="設計メモ"
        currentBody={"a\nB\nc\nd"}
      />,
    );

    const region = await screen.findByRole("region", REGION);
    expect(region.textContent).toContain("2行を足し、1行を消しました");
    expect(
      screen.getByText("B").closest("[data-kind]")?.getAttribute("data-kind"),
    ).toBe("add");
    expect(
      screen.getByText("b").closest("[data-kind]")?.getAttribute("data-kind"),
    ).toBe("del");
    expect(region.textContent).toContain("+");
    expect(region.textContent).toContain("−");
  });

  it("長い変わらない部分は「変わっていないN行を省略」に畳む", async () => {
    const body = ["1", "2", "3", "4", "5", "6"].join("\n");
    setup(async () => previous({ previousBody: `${body}\nold` }));
    render(
      <ChangesSinceView
        entityType="note"
        id="n1"
        currentTitle="設計メモ"
        currentBody={`${body}\nnew`}
      />,
    );

    expect(await screen.findByText("変わっていない5行を省略")).toBeTruthy();
  });

  it("タイトルだけ変わったときはタイトルの変化を出す", async () => {
    setup(async () => previous({ previousTitle: "旧題" }));
    render(
      <ChangesSinceView
        entityType="note"
        id="n1"
        currentTitle="設計メモ"
        currentBody={"a\nb\nc"}
      />,
    );

    const region = await screen.findByRole("region", REGION);
    expect(region.textContent).toContain("旧題");
    expect(region.textContent).toContain("設計メモ");
    expect(region.textContent).not.toContain("行を足し");
  });

  it("「閉じる」で隠れる", async () => {
    setup(async () => previous());
    render(
      <ChangesSinceView
        entityType="note"
        id="n1"
        currentTitle="設計メモ"
        currentBody="a"
      />,
    );
    await screen.findByRole("region", REGION);

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.queryByRole("region", REGION)).toBeNull();
  });

  it("id が変わったら読み直し、閉じた状態も戻す", async () => {
    const { readChangesSinceView } = setup(async () => previous());
    const { rerender } = render(
      <ChangesSinceView
        entityType="note"
        id="n1"
        currentTitle="設計メモ"
        currentBody="a"
      />,
    );
    await screen.findByRole("region", REGION);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    rerender(
      <ChangesSinceView
        entityType="note"
        id="n2"
        currentTitle="設計メモ"
        currentBody="a"
      />,
    );

    expect(await screen.findByRole("region", REGION)).toBeTruthy();
    expect(readChangesSinceView).toHaveBeenLastCalledWith("note", "n2");
  });

  it("切り替え前の読み込み結果は表示せず、既読にもしない", async () => {
    const resolvers: ((value: Changes | null) => void)[] = [];
    const { markViewed } = setup(
      () => new Promise<Changes | null>((resolve) => resolvers.push(resolve)),
    );
    const { rerender } = render(
      <ChangesSinceView
        entityType="note"
        id="n1"
        currentTitle="設計メモ"
        currentBody="a"
      />,
    );
    rerender(
      <ChangesSinceView
        entityType="note"
        id="n2"
        currentTitle="設計メモ"
        currentBody="a"
      />,
    );
    await waitFor(() => expect(resolvers).toHaveLength(2));

    await act(async () => resolvers[0]?.(previous()));

    expect(screen.queryByRole("region", REGION)).toBeNull();
    expect(markViewed).not.toHaveBeenCalledWith("note", "n1");
  });

  it("読み込みに失敗しても何も出さず、既読にはする", async () => {
    const { markViewed } = setup(async () => {
      throw new Error("boom");
    });
    const { container } = render(
      <ChangesSinceView
        entityType="note"
        id="n1"
        currentTitle="t"
        currentBody="a"
      />,
    );

    await waitFor(() => expect(markViewed).toHaveBeenCalledWith("note", "n1"));
    expect(container.textContent).toBe("");
  });
});
