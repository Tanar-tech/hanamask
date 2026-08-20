/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotebookDetail } from "../../src/renderer/components/NotebookDetail";
import type { Note, Notebook } from "../../src/shared/preload-api";
import { stubHanamask } from "./hanamask-stub";

const NOTEBOOK_ID = "notebook-1";

const makeNotebook = (overrides: Partial<Notebook> = {}): Notebook => ({
  id: NOTEBOOK_ID,
  title: "MCPサーバー設計",
  summary: "## 概要\n\nMCPサーバーの設計方針をまとめる",
  tags: ["design", "mcp"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T09:00:00.000Z",
  ...overrides,
});

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "note-1",
  title: "ページ1",
  body: "ページ1の本文",
  tags: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
  ...overrides,
});

interface NotebookApiOverrides {
  notebook?: Notebook | null;
  notes?: Note[];
  updated?: Notebook | null;
}

const mockHanamask = ({ notebook, notes, updated }: NotebookApiOverrides = {}) => {
  const getNotebook = vi.fn(async () => ({
    notebook: notebook === undefined ? makeNotebook() : notebook,
    notes: notes ?? [],
  }));
  const updateNotebook = vi.fn(async () => (updated === undefined ? makeNotebook() : updated));
  const listeners: Array<() => void> = [];
  const onNotebooksChanged = vi.fn((callback: () => void) => {
    listeners.push(callback);
    return () => {};
  });
  const noteListeners: Array<() => void> = [];
  const onNotesChanged = vi.fn((callback: () => void) => {
    noteListeners.push(callback);
    return () => {};
  });
  stubHanamask({ getNotebook, updateNotebook, onNotebooksChanged, onNotesChanged });
  const emitTo = (targets: Array<() => void>) => async (): Promise<void> => {
    await act(async () => {
      targets.forEach((listener) => {
        listener();
      });
    });
  };
  return {
    getNotebook,
    updateNotebook,
    emitChange: emitTo(listeners),
    emitNotesChange: emitTo(noteListeners),
  };
};

const renderDetail = (onSelectPage = vi.fn()) => {
  render(<NotebookDetail notebookId={NOTEBOOK_ID} onSelectPage={onSelectPage} onBack={vi.fn()} />);
  return onSelectPage;
};

const startEditing = async (): Promise<void> => {
  fireEvent.click(await screen.findByRole("button", { name: "編集" }));
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NotebookDetail", () => {
  it("タイトル・メタ情報・タグ・概要を表示する", async () => {
    mockHanamask({ notes: [makeNote(), makeNote({ id: "note-2", title: "ページ2" })] });
    renderDetail();

    expect(await screen.findByRole("heading", { name: "MCPサーバー設計" })).toBeTruthy();
    expect(screen.getByText("ノート · ページ 2 件 · 更新 2026-08-20")).toBeTruthy();
    expect(screen.getByRole("list", { name: "タグ" }).textContent).toContain("mcp");
    expect(screen.getByText("概要（AIが自動で追従更新）")).toBeTruthy();
    expect(screen.getByText("MCPサーバーの設計方針をまとめる")).toBeTruthy();
  });

  it("最近更新されたページを更新日の新しい順に最大3件、本文抜粋つきで出す", async () => {
    mockHanamask({
      notes: [
        makeNote({ id: "a", title: "古い", updatedAt: "2026-08-01T00:00:00.000Z" }),
        makeNote({ id: "b", title: "新しい", updatedAt: "2026-08-19T00:00:00.000Z" }),
        makeNote({ id: "c", title: "中1", updatedAt: "2026-08-10T00:00:00.000Z" }),
        makeNote({ id: "d", title: "中2", updatedAt: "2026-08-09T00:00:00.000Z" }),
      ],
    });
    renderDetail();

    const list = await screen.findByRole("list", { name: "最近更新されたページ" });
    const items = list.querySelectorAll("li");
    expect(items.length).toBe(3);
    expect([...items].map((item) => item.querySelector("button")?.textContent)).toEqual([
      "新しい",
      "中1",
      "中2",
    ]);
    expect(list.textContent).toContain("更新 2026-08-19");
    expect(list.textContent).toContain("ページ1の本文");
  });

  it("ページが1件も無いノートでは空の案内を出す", async () => {
    mockHanamask({ notes: [] });
    renderDetail();

    expect(await screen.findByText("ページはありません")).toBeTruthy();
  });

  it("ページ一覧は置かず、最近更新されたページだけを出す", async () => {
    mockHanamask({
      notes: [
        makeNote({ id: "a", updatedAt: "2026-08-01T00:00:00.000Z" }),
        makeNote({ id: "b", updatedAt: "2026-08-02T00:00:00.000Z" }),
        makeNote({ id: "c", updatedAt: "2026-08-03T00:00:00.000Z" }),
        makeNote({ id: "d", updatedAt: "2026-08-04T00:00:00.000Z" }),
        makeNote({ id: "e", updatedAt: "2026-08-05T00:00:00.000Z" }),
      ],
    });
    renderDetail();

    await screen.findByRole("list", { name: "最近更新されたページ" });
    expect(screen.queryByRole("list", { name: /ページ一覧/ })).toBeNull();
    // 一覧を足すと押せるページが増えるため、遷移できるページの数そのものを縛る。
    expect(screen.getAllByRole("button", { name: /^ページ1$/ }).length).toBe(3);
    expect(screen.getByText("一覧はナビゲーションに")).toBeTruthy();
  });

  it("ページをクリックすると遷移する", async () => {
    mockHanamask({ notes: [makeNote({ id: "note-9", title: "設計の断片" })] });
    const onSelectPage = renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "設計の断片" }));

    expect(onSelectPage).toHaveBeenCalledWith("note-9");
  });

  it("タイトル・概要・タグを編集して保存できる", async () => {
    const { updateNotebook } = mockHanamask({
      updated: makeNotebook({ title: "新タイトル", summary: "新概要", tags: ["design"] }),
    });
    renderDetail();
    await startEditing();

    fireEvent.change(screen.getByLabelText("タイトル"), { target: { value: "新タイトル" } });
    fireEvent.change(screen.getByLabelText("概要"), { target: { value: "新概要" } });
    fireEvent.change(screen.getByLabelText("タグ"), { target: { value: "design, mcp" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateNotebook).toHaveBeenCalledWith(NOTEBOOK_ID, {
        title: "新タイトル",
        summary: "新概要",
        tags: ["design", "mcp"],
      });
    });
    expect(await screen.findByRole("heading", { name: "新タイトル" })).toBeTruthy();
  });

  it("削除済み・存在しないノートでは見つからないと伝える", async () => {
    mockHanamask({ notebook: null });
    renderDetail();

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "ノートが見つかりません");
  });

  it("保存対象が消えていたら見つからないと伝える", async () => {
    mockHanamask({ updated: null });
    renderDetail();
    await startEditing();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "ノートが見つかりません");
  });

  it("編集中に外部で更新されるとバナーを出し、破棄すると最新を読み込む", async () => {
    const { getNotebook, emitChange } = mockHanamask();
    renderDetail();
    await startEditing();

    getNotebook.mockResolvedValue({ notebook: makeNotebook({ title: "外から来た" }), notes: [] });
    await emitChange();

    expect(screen.getByText("このノートは別の場所で更新されました")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "破棄して最新を読み込む" }));
    expect(await screen.findByRole("heading", { name: "外から来た" })).toBeTruthy();
  });

  it("保存の前に始まった取り直しが後から届いても保存結果を打ち消さない", async () => {
    const { getNotebook, updateNotebook, emitChange } = mockHanamask({
      updated: makeNotebook({ title: "保存した値" }),
    });
    renderDetail();
    await startEditing();

    let releaseStale = (): void => {};
    getNotebook.mockReturnValue(
      new Promise((resolve) => {
        releaseStale = () => {
          resolve({ notebook: makeNotebook({ title: "保存前の値" }), notes: [] });
        };
      }),
    );
    await emitChange();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    // 保存が反映され編集モードを抜けきってから返す。ここで待たないと、編集中扱いのまま
    // 取り直しが解決してバナー側の経路に逃げてしまい、打ち消しの有無を確かめられない。
    await screen.findByRole("heading", { name: "保存した値" });
    expect(updateNotebook).toHaveBeenCalled();
    await act(async () => {
      releaseStale();
    });

    expect(screen.getByRole("heading", { name: "保存した値" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "保存前の値" })).toBeNull();
  });

  it("取り直しに失敗しても表示中の内容は消さない", async () => {
    const { getNotebook, emitChange } = mockHanamask({ notes: [makeNote()] });
    renderDetail();
    await screen.findByRole("heading", { name: "MCPサーバー設計" });

    getNotebook.mockRejectedValue(new Error("切断"));
    await emitChange();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "MCPサーバー設計" })).toBeTruthy();
  });

  // create_page はページ側の変更（notes:changed）しか流さないため、ノート側の通知だけを
  // 見ていると件数とプレビューが取り残される。
  it("所属ページが増えたときもプレビューと件数を取り直す", async () => {
    const { getNotebook, emitNotesChange } = mockHanamask();
    renderDetail();
    await screen.findByRole("heading", { name: "MCPサーバー設計" });
    expect(screen.getByText("ページはありません")).toBeTruthy();

    getNotebook.mockResolvedValue({
      notebook: makeNotebook(),
      notes: [makeNote({ title: "あとから来たページ" })],
    });
    await emitNotesChange();

    expect(await screen.findByRole("button", { name: /あとから来たページ/ })).toBeTruthy();
  });

  it("編集していなければ外部の更新をそのまま反映する", async () => {
    const { getNotebook, emitChange } = mockHanamask();
    renderDetail();
    await screen.findByRole("heading", { name: "MCPサーバー設計" });

    getNotebook.mockResolvedValue({
      notebook: makeNotebook({ title: "外から来た" }),
      notes: [makeNote()],
    });
    await emitChange();

    expect(await screen.findByRole("heading", { name: "外から来た" })).toBeTruthy();
    expect(screen.queryByText("このノートは別の場所で更新されました")).toBeNull();
  });
});
