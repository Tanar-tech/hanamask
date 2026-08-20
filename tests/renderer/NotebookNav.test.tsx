/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotebookNav } from "../../src/renderer/components/NotebookNav";
import type { Note, Notebook } from "../../src/shared/preload-api";
import { stubHanamask } from "./hanamask-stub";

const LOCAL_LLM: Notebook = {
  id: "nb-1",
  title: "ローカルLLM組み込み",
  summary: "",
  tags: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const RELEASE: Notebook = {
  ...LOCAL_LLM,
  id: "nb-2",
  title: "リリース運用",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

const makeNote = (overrides: Partial<Note>): Note => ({
  id: "note-1",
  title: "WSLからMCPへ接続する手順",
  body: "",
  tags: [],
  notebookId: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
  ...overrides,
});

const UNFILED = makeNote({});
const FILED = makeNote({
  id: "note-2",
  title: "T48 意味検索の実装",
  notebookId: "nb-1",
  updatedAt: "2026-08-17T00:00:00.000Z",
});

const LOCAL_LLM_EMPTY = "ローカルLLM組み込み（ページ0件）";
const RELEASE_EMPTY = "リリース運用（ページ0件）";

interface NavStubs {
  notebooks?: Notebook[];
  notes?: Note[];
}

const mockNavApi = ({ notebooks = [], notes = [] }: NavStubs) => {
  const listNotebooks = vi.fn(async () => notebooks);
  const listNotes = vi.fn(async (): Promise<Note[]> => notes);
  const noteListeners: Array<() => void> = [];
  const notebookListeners: Array<() => void> = [];
  stubHanamask({
    listNotebooks,
    listNotes,
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
    listNotebooks,
    listNotes,
    emitNotesChanged: () => emit(noteListeners),
    emitNotebooksChanged: () => emit(notebookListeners),
  };
};

const noop = (): void => {};

const renderNav = (overrides: Partial<Parameters<typeof NotebookNav>[0]> = {}) =>
  render(
    <NotebookNav
      selectedNotebookId={null}
      onSelectNotebook={noop}
      onSelectPage={noop}
      {...overrides}
    />,
  );

const typeFilter = (value: string): void => {
  fireEvent.change(screen.getByRole("searchbox", { name: "ノート・ページを絞り込み" }), {
    target: { value },
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NotebookNav", () => {
  it("ノートと無所属ページを混在して並べ、ノートにはページ数を出す", async () => {
    mockNavApi({ notebooks: [LOCAL_LLM, RELEASE], notes: [UNFILED, FILED] });

    renderNav();

    expect(
      await screen.findByRole("button", { name: "ローカルLLM組み込み（ページ1件）" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: RELEASE_EMPTY })).toBeTruthy();
    expect(screen.getByRole("button", { name: UNFILED.title })).toBeTruthy();
    // 所属ページはサブペインの担当なので、絞り込んでいないナビには出さない。
    expect(screen.queryByRole("button", { name: FILED.title })).toBeNull();
  });

  it("ノートとページのクリックをそれぞれ通知する", async () => {
    mockNavApi({ notebooks: [LOCAL_LLM], notes: [UNFILED] });
    const onSelectNotebook = vi.fn();
    const onSelectPage = vi.fn();

    renderNav({ onSelectNotebook, onSelectPage });

    fireEvent.click(await screen.findByRole("button", { name: LOCAL_LLM_EMPTY }));
    expect(onSelectNotebook).toHaveBeenCalledWith("nb-1");

    fireEvent.click(screen.getByRole("button", { name: UNFILED.title }));
    expect(onSelectPage).toHaveBeenCalledWith("note-1");
  });

  it("選択中のノートを現在地として示す", async () => {
    mockNavApi({ notebooks: [LOCAL_LLM, RELEASE] });

    renderNav({ selectedNotebookId: "nb-2" });

    const selected = await screen.findByRole("button", { name: RELEASE_EMPTY });
    expect(selected.getAttribute("aria-current")).toBe("page");
    expect(
      screen.getByRole("button", { name: LOCAL_LLM_EMPTY }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("ノート名で絞り込める", async () => {
    mockNavApi({ notebooks: [LOCAL_LLM, RELEASE], notes: [UNFILED] });

    renderNav();
    await screen.findByRole("button", { name: RELEASE_EMPTY });

    typeFilter("リリース");

    expect(screen.getByRole("button", { name: RELEASE_EMPTY })).toBeTruthy();
    expect(screen.queryByRole("button", { name: LOCAL_LLM_EMPTY })).toBeNull();
    expect(screen.queryByRole("button", { name: UNFILED.title })).toBeNull();
  });

  it("ページ名で絞り込むと、所属ページもノート名つきで出る", async () => {
    mockNavApi({ notebooks: [LOCAL_LLM], notes: [UNFILED, FILED] });

    renderNav();
    await screen.findByRole("button", { name: UNFILED.title });

    typeFilter("意味検索");

    expect(
      screen.getByRole("button", { name: `ローカルLLM組み込み > ${FILED.title}` }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: UNFILED.title })).toBeNull();
  });

  it("絞り込みに一致しなければその旨を出す", async () => {
    mockNavApi({ notebooks: [LOCAL_LLM], notes: [UNFILED] });

    renderNav();
    await screen.findByRole("button", { name: UNFILED.title });

    typeFilter("該当なし");

    expect(screen.getByText("一致するノート・ページはありません")).toBeTruthy();
  });

  it("空のDBでは案内だけを出す", async () => {
    mockNavApi({});

    renderNav();

    expect(await screen.findByText("ノートもページもまだありません")).toBeTruthy();
  });

  it("ページ・ノートの変更を受け取ったら読み直す", async () => {
    const { listNotebooks, listNotes, emitNotesChanged, emitNotebooksChanged } = mockNavApi({
      notebooks: [LOCAL_LLM],
    });

    renderNav();
    await screen.findByRole("button", { name: LOCAL_LLM_EMPTY });
    expect(listNotebooks).toHaveBeenCalledTimes(1);
    expect(listNotes).toHaveBeenCalledTimes(1);

    await emitNotesChanged();
    await emitNotebooksChanged();

    expect(listNotebooks).toHaveBeenCalledTimes(3);
    expect(listNotes).toHaveBeenCalledTimes(3);
  });

  it("読み込みに失敗したら理由を出す", async () => {
    stubHanamask({
      listNotebooks: vi.fn(async () => {
        throw new Error("読めない");
      }),
    });

    renderNav();

    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
