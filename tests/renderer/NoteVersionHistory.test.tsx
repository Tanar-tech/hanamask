/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { NoteVersionHistory } from "../../src/renderer/components/NoteVersionHistory";
import type { Note, NoteVersion } from "../../src/shared/preload-api";

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "note-1",
  title: "設計メモ",
  body: "現在の本文",
  tags: ["design"],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T10:00:00.000Z",
  ...overrides,
});

const makeVersion = (overrides: Partial<NoteVersion> = {}): NoteVersion => ({
  id: "version-1",
  noteId: "note-1",
  title: "旧タイトル",
  body: "旧本文",
  tags: ["design"],
  createdAt: "2026-08-03T09:00:00.000Z",
  ...overrides,
});

interface HistoryApiOverrides {
  listNoteVersions?: (noteId: string) => Promise<NoteVersion[]>;
  restoreNoteVersion?: (versionId: string) => Promise<Note | null>;
}

const mockHanamask = (overrides: HistoryApiOverrides = {}) => {
  const listNoteVersions = vi.fn(overrides.listNoteVersions ?? (async () => []));
  const restoreNoteVersion = vi.fn(overrides.restoreNoteVersion ?? (async () => makeNote()));
  window.hanamask = {
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    listNotes: vi.fn(async () => []),
    searchNotes: vi.fn(async () => []),
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    onNavigate: vi.fn(() => () => {}),
    listNoteVersions,
    restoreNoteVersion,
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    onTasksChanged: vi.fn(() => () => {}),
    attachImage: vi.fn(),
    listImages: vi.fn(async () => []),
    listLinks: vi.fn(async () => []),
    createLink: vi.fn(),
    deleteLink: vi.fn(async () => true),
    onLinksChanged: vi.fn(() => () => {}),
    readChatSettings: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatApiKey: vi.fn(async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" })),
    clearChatApiKey: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatModel: vi.fn(async (model: string) => ({ apiKeyMask: null, model })),
  };
  return { listNoteVersions, restoreNoteVersion };
};

const clickRestore = async (index = 0): Promise<void> => {
  const buttons = screen.getAllByRole("button", { name: "このバージョンに戻す" });
  const button = buttons[index];
  if (button === undefined) throw new Error(`no restore button at index ${index}`);
  await act(async () => {
    button.click();
  });
};

const stubConfirm = (result: boolean): ReturnType<typeof vi.fn> => {
  const confirmMock = vi.fn(() => result);
  vi.stubGlobal("confirm", confirmMock);
  return confirmMock;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("NoteVersionHistory", () => {
  it("マウント時にノートの編集履歴を取得して一覧表示する", async () => {
    const { listNoteVersions } = mockHanamask({
      listNoteVersions: async () => [
        makeVersion({ id: "version-2", title: "2番目", createdAt: "2026-08-03T09:30:00.000Z" }),
        makeVersion({ id: "version-1", title: "1番目", createdAt: "2026-08-03T09:00:00.000Z" }),
      ],
    });

    render(<NoteVersionHistory noteId="note-1" onRestored={vi.fn()} onRestoringChange={vi.fn()} />);

    expect(await screen.findByText("2番目")).toBeTruthy();
    expect(screen.getByText("1番目")).toBeTruthy();
    expect(screen.getByText("2026-08-03T09:30:00.000Z")).toBeTruthy();
    expect(screen.getByText("2026-08-03T09:00:00.000Z")).toBeTruthy();
    expect(listNoteVersions).toHaveBeenCalledWith("note-1");
  });

  it("履歴が0件のときは空状態メッセージを表示する", async () => {
    mockHanamask({ listNoteVersions: async () => [] });

    render(<NoteVersionHistory noteId="note-1" onRestored={vi.fn()} onRestoringChange={vi.fn()} />);

    expect(await screen.findByText("編集履歴はありません")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: "このバージョンに戻す" })).toHaveLength(0);
  });

  it("履歴の取得に失敗したらエラーメッセージを表示する", async () => {
    mockHanamask({
      listNoteVersions: async () => {
        throw new Error("history boom");
      },
    });

    render(<NoteVersionHistory noteId="note-1" onRestored={vi.fn()} onRestoringChange={vi.fn()} />);

    expect((await screen.findByRole("alert")).textContent).toContain("history boom");
  });

  it("復元ボタンで確認しOKならrestoreNoteVersionを呼びonRestoredを発火する", async () => {
    const restored = makeNote({ title: "旧タイトル", body: "旧本文" });
    const { restoreNoteVersion } = mockHanamask({
      listNoteVersions: async () => [makeVersion()],
      restoreNoteVersion: async () => restored,
    });
    const confirmMock = stubConfirm(true);
    const onRestored = vi.fn();

    render(<NoteVersionHistory noteId="note-1" onRestored={onRestored} onRestoringChange={vi.fn()} />);
    await screen.findByText("旧タイトル");
    await clickRestore();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(restoreNoteVersion).toHaveBeenCalledWith("version-1");
    await waitFor(() => {
      expect(onRestored).toHaveBeenCalledWith(restored);
    });
  });

  it("復元に成功したら履歴を取得し直す", async () => {
    let versions = [makeVersion({ id: "version-1", title: "旧タイトル" })];
    const { listNoteVersions } = mockHanamask({
      listNoteVersions: async () => versions,
      restoreNoteVersion: async () => {
        // 復元操作自体も新しいバージョンとして履歴に積まれる。
        versions = [makeVersion({ id: "version-2", title: "復元前タイトル" }), ...versions];
        return makeNote();
      },
    });
    stubConfirm(true);

    render(<NoteVersionHistory noteId="note-1" onRestored={vi.fn()} onRestoringChange={vi.fn()} />);
    await screen.findByText("旧タイトル");
    await clickRestore();

    expect(await screen.findByText("復元前タイトル")).toBeTruthy();
    await waitFor(() => {
      expect(listNoteVersions).toHaveBeenCalledTimes(2);
    });
  });

  it("確認をキャンセルしたら復元しない", async () => {
    const { restoreNoteVersion } = mockHanamask({
      listNoteVersions: async () => [makeVersion()],
    });
    stubConfirm(false);
    const onRestored = vi.fn();

    render(<NoteVersionHistory noteId="note-1" onRestored={onRestored} onRestoringChange={vi.fn()} />);
    await screen.findByText("旧タイトル");
    await clickRestore();

    expect(restoreNoteVersion).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("復元に失敗したらエラーメッセージを表示しonRestoredを呼ばない", async () => {
    mockHanamask({
      listNoteVersions: async () => [makeVersion()],
      restoreNoteVersion: async () => {
        throw new Error("restore boom");
      },
    });
    stubConfirm(true);
    const onRestored = vi.fn();

    render(<NoteVersionHistory noteId="note-1" onRestored={onRestored} onRestoringChange={vi.fn()} />);
    await screen.findByText("旧タイトル");
    await clickRestore();

    expect((await screen.findByRole("alert")).textContent).toContain("restore boom");
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("復元対象のバージョンが存在しない場合はエラーメッセージを表示する", async () => {
    mockHanamask({
      listNoteVersions: async () => [makeVersion()],
      restoreNoteVersion: async () => null,
    });
    stubConfirm(true);
    const onRestored = vi.fn();

    render(<NoteVersionHistory noteId="note-1" onRestored={onRestored} onRestoringChange={vi.fn()} />);
    await screen.findByText("旧タイトル");
    await clickRestore();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("復元の応答待ちの間はonRestoringChangeで復元中であることを親に通知する", async () => {
    let resolveRestore: ((note: Note) => void) | undefined;
    mockHanamask({
      listNoteVersions: async () => [makeVersion()],
      restoreNoteVersion: () =>
        new Promise<Note | null>((resolve) => {
          resolveRestore = resolve;
        }),
    });
    stubConfirm(true);
    const onRestoringChange = vi.fn();

    render(
      <NoteVersionHistory noteId="note-1" onRestored={vi.fn()} onRestoringChange={onRestoringChange} />,
    );
    await screen.findByText("旧タイトル");
    await clickRestore();

    expect(onRestoringChange.mock.calls).toEqual([[true]]);

    await act(async () => {
      resolveRestore?.(makeNote());
    });

    expect(onRestoringChange.mock.calls).toEqual([[true], [false]]);
  });

  it("復元の応答待ちの間は他のバージョンの復元ボタンも押せない", async () => {
    let resolveRestore: ((note: Note) => void) | undefined;
    const { restoreNoteVersion } = mockHanamask({
      listNoteVersions: async () => [
        makeVersion({ id: "version-2", title: "2番目" }),
        makeVersion({ id: "version-1", title: "1番目" }),
      ],
      restoreNoteVersion: () =>
        new Promise<Note | null>((resolve) => {
          resolveRestore = resolve;
        }),
    });
    stubConfirm(true);
    const onRestoringChange = vi.fn();

    render(
      <NoteVersionHistory noteId="note-1" onRestored={vi.fn()} onRestoringChange={onRestoringChange} />,
    );
    await screen.findByText("2番目");
    await clickRestore(0);

    const buttons = screen.getAllByRole("button", { name: "このバージョンに戻す" });
    expect(buttons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);

    await clickRestore(1);

    expect(restoreNoteVersion).toHaveBeenCalledTimes(1);
    expect(onRestoringChange.mock.calls).toEqual([[true]]);

    await act(async () => {
      resolveRestore?.(makeNote());
    });

    expect(onRestoringChange.mock.calls).toEqual([[true], [false]]);
    const afterButtons = screen.getAllByRole("button", { name: "このバージョンに戻す" });
    expect(afterButtons.every((button) => (button as HTMLButtonElement).disabled)).toBe(false);
  });

  it("復元の応答待ち中にアンマウントされたらonRestoredを呼ばない", async () => {
    let resolveRestore: ((note: Note) => void) | undefined;
    const { listNoteVersions } = mockHanamask({
      listNoteVersions: async () => [makeVersion()],
      restoreNoteVersion: () =>
        new Promise<Note | null>((resolve) => {
          resolveRestore = resolve;
        }),
    });
    stubConfirm(true);
    const onRestored = vi.fn();

    const { unmount } = render(
      <NoteVersionHistory noteId="note-1" onRestored={onRestored} onRestoringChange={vi.fn()} />,
    );
    await screen.findByText("旧タイトル");
    await clickRestore();
    unmount();

    await act(async () => {
      resolveRestore?.(makeNote());
    });

    expect(onRestored).not.toHaveBeenCalled();
    // アンマウント後のsetVersionsになるため履歴の取り直しも行わない。
    expect(listNoteVersions).toHaveBeenCalledTimes(1);
  });

  it("noteIdが変わったら履歴を取得し直す", async () => {
    const { listNoteVersions } = mockHanamask({
      listNoteVersions: async (noteId: string) => [
        makeVersion({ noteId, title: noteId === "note-2" ? "別ノートの履歴" : "旧タイトル" }),
      ],
    });

    const { rerender } = render(<NoteVersionHistory noteId="note-1" onRestored={vi.fn()} onRestoringChange={vi.fn()} />);
    await screen.findByText("旧タイトル");

    rerender(<NoteVersionHistory noteId="note-2" onRestored={vi.fn()} onRestoringChange={vi.fn()} />);

    expect(await screen.findByText("別ノートの履歴")).toBeTruthy();
    expect(listNoteVersions).toHaveBeenLastCalledWith("note-2");
  });

  it("noteId切替時に古い取得結果が後から表示を上書きしない", async () => {
    let resolveSlow: ((versions: NoteVersion[]) => void) | undefined;
    const { listNoteVersions } = mockHanamask({
      listNoteVersions: async (noteId: string) => {
        if (noteId === "note-1") {
          return new Promise<NoteVersion[]>((resolve) => {
            resolveSlow = resolve;
          });
        }
        return [makeVersion({ noteId, id: "version-2", title: "新しいノートの履歴" })];
      },
    });

    const { rerender } = render(<NoteVersionHistory noteId="note-1" onRestored={vi.fn()} onRestoringChange={vi.fn()} />);
    rerender(<NoteVersionHistory noteId="note-2" onRestored={vi.fn()} onRestoringChange={vi.fn()} />);
    await screen.findByText("新しいノートの履歴");

    await act(async () => {
      resolveSlow?.([makeVersion({ title: "古いノートの履歴" })]);
    });

    expect(screen.queryByText("古いノートの履歴")).toBeNull();
    expect(screen.getByText("新しいノートの履歴")).toBeTruthy();
    expect(listNoteVersions).toHaveBeenCalledTimes(2);
  });
});
