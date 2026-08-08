/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, within } from "@testing-library/react";
import { renderWithMotion as render } from "./motion-render";
import { NoteList } from "../../src/renderer/components/NoteList";
import type { Image, Note } from "../../src/shared/preload-api";

const stubImage: Image = {
  id: "image-1",
  noteId: "note-1",
  filePath: "/data/images/a.png",
  fileUrl: "file:///data/images/a.png",
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
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    listNotes,
    onNotesChanged,
    deleteNote,
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    onTasksChanged: vi.fn(() => () => {}),
    attachImage: vi.fn(async () => stubImage),
    listImages: vi.fn(async () => []),
    searchNotes: vi.fn(async () => []),
    onNavigate: vi.fn(() => () => {}),
    listLinks: vi.fn(async () => []),
    createLink: vi.fn(),
    deleteLink: vi.fn(async () => true),
    onLinksChanged: vi.fn(() => () => {}),
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
    sendChatMessage: vi.fn(async () => []),
    abortChat: vi.fn(async () => {}),
    onChatEvent: vi.fn(() => () => {}),
    readChatSettings: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatApiKey: vi.fn(async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" })),
    clearChatApiKey: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatModel: vi.fn(async (model: string) => ({ apiKeyMask: null, model })),
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

  it("一覧に名前を付けて読み上げできるようにする", async () => {
    mockHanamask([[makeNote()]]);

    render(<NoteList onSelectNote={vi.fn()} />);

    expect(await screen.findByRole("list", { name: "ノート一覧" })).toBeTruthy();
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
  /*
   * 変更のたびに一覧を丸ごと取り直すため、これが効いていないと毎回すべての項目が
   * アニメーションする。「増えたものだけを対象にする」判定は useNewlyArrived が持ち、
   * その正しさは useNewlyArrived.test.tsx で網羅している（誤実装で落ちることも実測済み）。
   * ここでは NoteList がその判定を実際に使って描画できていること（＝結線）を確かめる。
   */
  it("ノートが増えても一覧が壊れない", async () => {
    const existing = makeNote({ id: "note-1", title: "元からあるノート" });
    const arrived = makeNote({ id: "note-2", title: "いま増えたノート" });
    const { listeners } = mockHanamask([[existing], [arrived, existing]]);

    render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText("元からあるノート");
    await act(async () => {
      listeners.forEach((listener) => listener());
    });

    expect(await screen.findByText("いま増えたノート")).toBeTruthy();
    expect(screen.getByText("元からあるノート")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
