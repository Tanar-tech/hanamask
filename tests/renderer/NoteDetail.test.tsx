/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NoteDetail } from "../../src/renderer/components/NoteDetail";
import type { Note } from "../../src/shared/preload-api";

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "note-1",
  title: "設計メモ",
  body: "MCPサーバーの設計についてのメモ本文",
  tags: ["design", "mcp"],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const mockHanamask = (getNote: (id: string) => Promise<Note | null>) => {
  const getNoteMock = vi.fn(getNote);
  window.hanamask = {
    listNotes: vi.fn(async () => []),
    getNote: getNoteMock,
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    onTasksChanged: vi.fn(() => () => {}),
  };
  return { getNote: getNoteMock };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NoteDetail", () => {
  it("マウント時に指定IDのノートを取得してタイトル・本文・タグを表示する", async () => {
    const { getNote } = mockHanamask(async () => makeNote());

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    expect(await screen.findByText("設計メモ")).toBeTruthy();
    expect(screen.getByText("MCPサーバーの設計についてのメモ本文")).toBeTruthy();
    expect(screen.getByText("design")).toBeTruthy();
    expect(screen.getByText("mcp")).toBeTruthy();
    expect(getNote).toHaveBeenCalledWith("note-1");
  });

  it("本文の改行を含む全文を表示する", async () => {
    mockHanamask(async () => makeNote({ body: "1行目\n2行目" }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    expect(await screen.findByText(/1行目/)).toBeTruthy();
    expect(screen.getByText(/2行目/)).toBeTruthy();
  });

  it("ノートが見つからない場合はエラーメッセージを表示する", async () => {
    mockHanamask(async () => null);

    render(<NoteDetail noteId="missing-note" onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("設計メモ")).toBeNull();
  });

  it("取得に失敗した場合はエラーメッセージを表示する", async () => {
    mockHanamask(async () => {
      throw new Error("boom");
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("タグが空の場合でもタイトルと本文を表示する", async () => {
    mockHanamask(async () => makeNote({ tags: [] }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    expect(await screen.findByText("設計メモ")).toBeTruthy();
  });

  it("戻るボタンをクリックするとonBackを呼ぶ", async () => {
    mockHanamask(async () => makeNote());
    const onBack = vi.fn();

    render(<NoteDetail noteId="note-1" onBack={onBack} />);
    await screen.findByText("設計メモ");
    await act(async () => {
      screen.getByRole("button", { name: "戻る" }).click();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("取得に失敗しても戻るボタンで一覧に戻れる", async () => {
    mockHanamask(async () => null);
    const onBack = vi.fn();

    render(<NoteDetail noteId="missing-note" onBack={onBack} />);
    await screen.findByRole("alert");
    await act(async () => {
      screen.getByRole("button", { name: "戻る" }).click();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("noteIdが変わったら新しいノートを取得し直す", async () => {
    const { getNote } = mockHanamask(async () => makeNote());
    getNote.mockImplementation(async (id: string) =>
      id === "note-2" ? makeNote({ id: "note-2", title: "別のノート" }) : makeNote(),
    );

    const { rerender } = render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    expect(await screen.findByText("設計メモ")).toBeTruthy();

    rerender(<NoteDetail noteId="note-2" onBack={vi.fn()} />);

    expect(await screen.findByText("別のノート")).toBeTruthy();
    expect(getNote).toHaveBeenCalledTimes(2);
  });
});
