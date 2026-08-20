/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotebookSubPane } from "../../src/renderer/components/NotebookSubPane";
import { toUpdatedLabel } from "../../src/renderer/text/dateLabel";
import type { Note, Notebook } from "../../src/shared/preload-api";
import { stubHanamask } from "./hanamask-stub";

const NOTEBOOK: Notebook = {
  id: "nb-1",
  title: "ローカルLLM組み込み",
  summary: "",
  tags: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const NEWER: Note = {
  id: "note-1",
  title: "T48 意味検索の実装",
  body: "",
  tags: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const OLDER: Note = {
  ...NEWER,
  id: "note-2",
  title: "上流3件の精査結果",
  updatedAt: "2026-08-19T00:00:00.000Z",
};

const mockSubPaneApi = (pages: () => Note[]) => {
  const getNotebook = vi.fn(async () => ({ notebook: NOTEBOOK, notes: pages() }));
  const noteListeners: Array<() => void> = [];
  const notebookListeners: Array<() => void> = [];
  stubHanamask({
    getNotebook,
    onNotesChanged: vi.fn((callback: () => void) => {
      noteListeners.push(callback);
      return () => {};
    }),
    onNotebooksChanged: vi.fn((callback: () => void) => {
      notebookListeners.push(callback);
      return () => {};
    }),
  });
  const emit = async (listeners: Array<() => void>): Promise<void> => {
    await act(async () => {
      listeners.forEach((listener) => {
        listener();
      });
    });
  };
  return {
    getNotebook,
    emitNotesChanged: () => emit(noteListeners),
    emitNotebooksChanged: () => emit(notebookListeners),
  };
};

const noop = (): void => {};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NotebookSubPane", () => {
  it("そのノートのページを更新日つきで新しい順に並べる", async () => {
    const { getNotebook } = mockSubPaneApi(() => [OLDER, NEWER]);

    render(<NotebookSubPane notebookId="nb-1" onSelectPage={noop} />);

    expect(await screen.findByText("ローカルLLM組み込み のページ")).toBeTruthy();
    expect(getNotebook).toHaveBeenCalledWith("nb-1");
    expect(screen.getByText(toUpdatedLabel(OLDER.updatedAt))).toBeTruthy();
    const titles = screen.getAllByRole("button").map((button) => button.textContent);
    expect(titles[0]).toContain(NEWER.title);
    expect(titles[1]).toContain(OLDER.title);
  });

  it("ページのクリックを通知する", async () => {
    mockSubPaneApi(() => [NEWER]);
    const onSelectPage = vi.fn();

    render(<NotebookSubPane notebookId="nb-1" onSelectPage={onSelectPage} />);

    fireEvent.click(await screen.findByRole("button", { name: new RegExp(NEWER.title) }));
    expect(onSelectPage).toHaveBeenCalledWith("note-1");
  });

  it("ページが1件も無いノートではその旨を出す", async () => {
    mockSubPaneApi(() => []);

    render(<NotebookSubPane notebookId="nb-1" onSelectPage={noop} />);

    expect(await screen.findByText("ページはありません")).toBeTruthy();
  });

  it("ページ・ノートの変更を受け取ったら読み直す", async () => {
    let pages: Note[] = [];
    const { getNotebook, emitNotesChanged, emitNotebooksChanged } = mockSubPaneApi(() => pages);

    render(<NotebookSubPane notebookId="nb-1" onSelectPage={noop} />);
    expect(await screen.findByText("ページはありません")).toBeTruthy();

    pages = [NEWER];
    await emitNotesChanged();

    expect(await screen.findByRole("button", { name: new RegExp(NEWER.title) })).toBeTruthy();
    expect(getNotebook).toHaveBeenCalledTimes(2);

    await emitNotebooksChanged();
    expect(getNotebook).toHaveBeenCalledTimes(3);
  });

  it("読み込みに失敗したら理由を出す", async () => {
    stubHanamask({
      getNotebook: vi.fn(async () => {
        throw new Error("読めない");
      }),
    });

    render(<NotebookSubPane notebookId="nb-1" onSelectPage={noop} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
