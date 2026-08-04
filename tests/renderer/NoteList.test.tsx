/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { NoteList } from "../../src/renderer/components/NoteList";
import type { Image, Note } from "../../src/shared/preload-api";

const stubImage: Image = {
  id: "image-1",
  noteId: "note-1",
  filePath: "/data/images/a.png",
  mimeType: "image/png",
};

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "note-1",
  title: "設計メモ",
  body: "MCPサーバーの設計についてのメモ本文",
  tags: ["design"],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const mockHanamask = (notesByCall: Note[][]) => {
  const listeners: Array<() => void> = [];
  const unsubscribe = vi.fn();
  const listNotes = vi.fn(async () => notesByCall[Math.min(listNotes.mock.calls.length - 1, notesByCall.length - 1)] ?? []);
  const onNotesChanged = vi.fn((callback: () => void) => {
    listeners.push(callback);
    return unsubscribe;
  });
  const deleteNote = vi.fn(async () => {});
  window.hanamask = {
    listNotes,
    onNotesChanged,
    deleteNote,
    getNote: vi.fn(async () => null),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    onTasksChanged: vi.fn(() => () => {}),
    attachImage: vi.fn(async () => stubImage),
    listImages: vi.fn(async () => []),
  };
  return { listNotes, onNotesChanged, deleteNote, listeners, unsubscribe };
};

const clickDeleteButtonOf = async (title: string): Promise<void> => {
  const item = (await screen.findByText(title)).closest("li");
  if (item === null) throw new Error(`no list item for ${title}`);
  await act(async () => {
    within(item).getByRole("button", { name: "削除" }).click();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NoteList", () => {
  it("初期表示でノート一覧をレンダリングする", async () => {
    mockHanamask([
      [makeNote(), makeNote({ id: "note-2", title: "TODO整理", body: "積み残しタスクの一覧" })],
    ]);

    render(<NoteList onSelectNote={vi.fn()} />);

    expect(await screen.findByText("設計メモ")).toBeTruthy();
    expect(screen.getByText("TODO整理")).toBeTruthy();
    expect(screen.getByText(/MCPサーバーの設計/)).toBeTruthy();
    expect(screen.getByText("積み残しタスクの一覧")).toBeTruthy();
  });

  it("onNotesChangedのコールバックでノート一覧を再取得して更新する", async () => {
    const { listNotes, listeners } = mockHanamask([
      [makeNote()],
      [makeNote(), makeNote({ id: "note-2", title: "追加されたノート" })],
    ]);

    render(<NoteList onSelectNote={vi.fn()} />);
    expect(await screen.findByText("設計メモ")).toBeTruthy();
    expect(listNotes).toHaveBeenCalledTimes(1);

    await act(async () => {
      listeners.forEach((listener) => listener());
    });

    expect(listNotes).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("追加されたノート")).toBeTruthy();
  });

  it("ノートが0件のとき空状態メッセージを表示する", async () => {
    mockHanamask([[]]);

    render(<NoteList onSelectNote={vi.fn()} />);

    expect(await screen.findByText("ノートはまだありません")).toBeTruthy();
  });

  it("削除ボタンで確認してOKするとそのノートを削除する", async () => {
    const { deleteNote } = mockHanamask([[makeNote(), makeNote({ id: "note-2", title: "TODO整理" })]]);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<NoteList onSelectNote={vi.fn()} />);
    await clickDeleteButtonOf("TODO整理");

    expect(deleteNote).toHaveBeenCalledTimes(1);
    expect(deleteNote).toHaveBeenCalledWith("note-2");
  });

  it("削除後のonNotesChangedで削除したノートが一覧から消える", async () => {
    const { deleteNote, listeners } = mockHanamask([
      [makeNote(), makeNote({ id: "note-2", title: "TODO整理" })],
      [makeNote()],
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<NoteList onSelectNote={vi.fn()} />);
    await clickDeleteButtonOf("TODO整理");
    expect(deleteNote).toHaveBeenCalledWith("note-2");

    await act(async () => {
      listeners.forEach((listener) => listener());
    });

    expect(screen.queryByText("TODO整理")).toBeNull();
    expect(screen.getByText("設計メモ")).toBeTruthy();
  });

  it("削除の確認をキャンセルすると削除しない", async () => {
    const { deleteNote } = mockHanamask([[makeNote()]]);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<NoteList onSelectNote={vi.fn()} />);
    await clickDeleteButtonOf("設計メモ");

    expect(deleteNote).not.toHaveBeenCalled();
  });

  it("削除に失敗したらエラーを表示する", async () => {
    const { deleteNote } = mockHanamask([[makeNote()]]);
    deleteNote.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<NoteList onSelectNote={vi.fn()} />);
    await clickDeleteButtonOf("設計メモ");

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("アンマウント時に購読を解除する", async () => {
    const { unsubscribe } = mockHanamask([[makeNote()]]);

    const { unmount } = render(<NoteList onSelectNote={vi.fn()} />);
    expect(await screen.findByText("設計メモ")).toBeTruthy();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
