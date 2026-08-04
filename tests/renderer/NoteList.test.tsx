/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NoteList } from "../../src/renderer/components/NoteList";
import type { Note } from "../../src/shared/preload-api";

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
  window.hanamask = {
    listNotes,
    onNotesChanged,
    listTasks: vi.fn(async () => []),
    onTasksChanged: vi.fn(() => () => {}),
  };
  return { listNotes, onNotesChanged, listeners, unsubscribe };
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

    render(<NoteList />);

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

    render(<NoteList />);
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

    render(<NoteList />);

    expect(await screen.findByText("ノートはまだありません")).toBeTruthy();
  });

  it("アンマウント時に購読を解除する", async () => {
    const { unsubscribe } = mockHanamask([[makeNote()]]);

    const { unmount } = render(<NoteList />);
    expect(await screen.findByText("設計メモ")).toBeTruthy();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
