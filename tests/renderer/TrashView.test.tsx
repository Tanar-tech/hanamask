/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { TrashView } from "../../src/renderer/components/TrashView";
import type { AppSettings, DeletedNote, DeletedTask, Note, Task } from "../../src/shared/preload-api";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysAgo = (days: number): string => new Date(Date.now() - days * DAY_MS).toISOString();

const makeNote = (overrides: Partial<DeletedNote> = {}): DeletedNote => ({
  id: "note-1",
  title: "消したメモ",
  body: "消したメモの本文",
  tags: ["design"],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T10:00:00.000Z",
  deletedAt: isoDaysAgo(0),
  ...overrides,
});

const makeTask = (overrides: Partial<DeletedTask> = {}): DeletedTask => ({
  id: "task-1",
  title: "消したタスク",
  body: "消したタスクの本文",
  tags: [],
  status: "todo",
  dueDate: null,
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T10:00:00.000Z",
  deletedAt: isoDaysAgo(0),
  ...overrides,
});

interface TrashApiOverrides {
  listDeletedNotes?: () => Promise<DeletedNote[]>;
  restoreNote?: (id: string) => Promise<Note | null>;
  listDeletedTasks?: () => Promise<DeletedTask[]>;
  restoreTask?: (id: string) => Promise<Task | null>;
}

const mockHanamask = (overrides: TrashApiOverrides = {}) => {
  const listDeletedNotes = vi.fn(overrides.listDeletedNotes ?? (async () => [makeNote()]));
  const restoreNote = vi.fn(overrides.restoreNote ?? (async () => makeNote()));
  const listDeletedTasks = vi.fn(overrides.listDeletedTasks ?? (async () => []));
  const restoreTask = vi.fn(overrides.restoreTask ?? (async () => makeTask()));
  window.hanamask = {
    deleteTask: vi.fn(async () => {}),
    listDeletedTasks,
    restoreTask,
    listNotes: vi.fn(async () => []),
    searchNotes: vi.fn(async () => []),
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    onLinksChanged: vi.fn(() => () => {}),
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
    sendChatMessage: vi.fn(async () => []),
    abortChat: vi.fn(async () => {}),
    onChatEvent: vi.fn(() => () => {}),
    readActivity: vi.fn(async () => ({ lastRecordedAt: null, recentCount: 0 })),
    readMcpEndpoint: vi.fn(async () => ({ port: 39217, url: "http://127.0.0.1:39217/mcp" })),
    readAppSettings: vi.fn(async () => ({ closeToTray: true, openAtLogin: false })),
    saveAppSettings: vi.fn(async (settings: AppSettings) => settings),
    readChatSettings: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatApiKey: vi.fn(async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" })),
    clearChatApiKey: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatModel: vi.fn(async (model: string) => ({ apiKeyMask: null, model })),
    onNavigate: vi.fn(() => () => {}),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listDeletedNotes,
    restoreNote,
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    updateTask: vi.fn(async () => null),
    onTasksChanged: vi.fn(() => () => {}),
    attachImage: vi.fn(),
    listImages: vi.fn(async () => []),
    listLinks: vi.fn(async () => []),
    createLink: vi.fn(),
    deleteLink: vi.fn(async () => true),
    semanticSearch: vi.fn(async () => ({ notes: [], tasks: [] })),
    relatedNotes: vi.fn(async () => ({ notes: [] })),
    readEmbeddingStatus: vi.fn(async () => ({ state: "unavailable" as const, pending: 0 })),
    onEmbeddingStatusChanged: vi.fn(() => () => {}),
  };
  return { listDeletedNotes, restoreNote, listDeletedTasks, restoreTask };
};

const clickButton = async (name: string, index = 0): Promise<void> => {
  const buttons = await screen.findAllByRole("button", { name });
  const button = buttons[index];
  if (button === undefined) throw new Error(`no button named ${name} at index ${index}`);
  await act(async () => {
    button.click();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TrashView", () => {
  it("削除済みノートの一覧を表示する", async () => {
    mockHanamask({
      listDeletedNotes: async () => [
        makeNote(),
        makeNote({ id: "note-2", title: "別の消したメモ", body: "別の本文" }),
      ],
    });

    render(<TrashView onBack={vi.fn()} />);

    expect(await screen.findByText("消したメモ")).toBeTruthy();
    expect(screen.getByText("別の消したメモ")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "復元" })).toHaveLength(2);
  });

  it("一覧に何の一覧かが分かるラベルを付ける", async () => {
    mockHanamask();

    render(<TrashView onBack={vi.fn()} />);

    expect(await screen.findByRole("list", { name: "削除済みノート" })).toBeTruthy();
  });

  it("削除済みのノートもタスクも無いときは両方を指す空状態を表示する", async () => {
    mockHanamask({ listDeletedNotes: async () => [], listDeletedTasks: async () => [] });

    render(<TrashView onBack={vi.fn()} />);

    expect(await screen.findByText("削除済みのノート・タスクはありません")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "復元" })).toBeNull();
  });

  it("削除済みタスクの一覧を表示する", async () => {
    mockHanamask({
      listDeletedNotes: async () => [],
      listDeletedTasks: async () => [
        makeTask(),
        makeTask({ id: "task-2", title: "別の消したタスク", body: "別の本文" }),
      ],
    });

    render(<TrashView onBack={vi.fn()} />);

    expect(await screen.findByRole("list", { name: "削除済みタスク" })).toBeTruthy();
    expect(screen.getByText("消したタスク")).toBeTruthy();
    expect(screen.getByText("別の消したタスク")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "復元" })).toHaveLength(2);
  });

  it("ノートが無くてもタスクが残っていれば空状態を出さない", async () => {
    mockHanamask({ listDeletedNotes: async () => [], listDeletedTasks: async () => [makeTask()] });

    render(<TrashView onBack={vi.fn()} />);

    expect(await screen.findByText("消したタスク")).toBeTruthy();
    expect(screen.queryByText("削除済みのノート・タスクはありません")).toBeNull();
  });

  it("タスクの復元ボタンで restoreTask を呼び一覧を取り直す", async () => {
    const { listDeletedTasks, restoreTask } = mockHanamask({ listDeletedNotes: async () => [] });
    listDeletedTasks.mockImplementationOnce(async () => [makeTask()]);
    listDeletedTasks.mockImplementation(async () => []);

    render(<TrashView onBack={vi.fn()} />);
    await clickButton("復元");

    expect(restoreTask).toHaveBeenCalledWith("task-1");
    await waitFor(() => {
      expect(listDeletedTasks).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("削除済みのノート・タスクはありません")).toBeTruthy();
  });

  it("タスクの復元に失敗するとエラーを表示する", async () => {
    mockHanamask({
      listDeletedNotes: async () => [],
      listDeletedTasks: async () => [makeTask()],
      restoreTask: async () => {
        throw new Error("boom");
      },
    });

    render(<TrashView onBack={vi.fn()} />);
    await clickButton("復元");

    expect((await screen.findByRole("alert")).textContent).toContain("タスクの復元に失敗しました");
  });

  it("復元対象のタスクが見つからないときはエラーを表示する", async () => {
    mockHanamask({
      listDeletedNotes: async () => [],
      listDeletedTasks: async () => [makeTask()],
      restoreTask: async () => null,
    });

    render(<TrashView onBack={vi.fn()} />);
    await clickButton("復元");

    expect((await screen.findByRole("alert")).textContent).toContain(
      "対象のタスクが見つかりません",
    );
  });

  it("削除済みタスクの読み込みに失敗するとエラーを表示する", async () => {
    mockHanamask({
      listDeletedTasks: async () => {
        throw new Error("boom");
      },
    });

    render(<TrashView onBack={vi.fn()} />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "削除済みタスクの読み込みに失敗しました",
    );
  });

  it("削除済みタスクにも残り日数を表示する", async () => {
    mockHanamask({
      listDeletedNotes: async () => [],
      listDeletedTasks: async () => [makeTask({ deletedAt: isoDaysAgo(29) })],
    });

    render(<TrashView onBack={vi.fn()} />);

    expect(await screen.findByText("あと 1 日")).toBeTruthy();
  });

  it("復元ボタンで restoreNote を呼び一覧を取り直す", async () => {
    const { listDeletedNotes, restoreNote } = mockHanamask();
    listDeletedNotes.mockImplementationOnce(async () => [makeNote()]);
    listDeletedNotes.mockImplementation(async () => []);

    render(<TrashView onBack={vi.fn()} />);
    await clickButton("復元");

    expect(restoreNote).toHaveBeenCalledWith("note-1");
    await waitFor(() => {
      expect(listDeletedNotes).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("削除済みのノート・タスクはありません")).toBeTruthy();
  });

  it("復元の応答待ちの間は他のノートの復元ボタンも押せない", async () => {
    const { listDeletedNotes, restoreNote } = mockHanamask();
    listDeletedNotes.mockImplementation(async () => [
      makeNote(),
      makeNote({ id: "note-2", title: "もう一件" }),
    ]);
    let resolveRestore: ((note: Note) => void) | undefined;
    restoreNote.mockImplementationOnce(
      () =>
        new Promise<Note>((resolve) => {
          resolveRestore = resolve;
        }),
    );

    render(<TrashView onBack={vi.fn()} />);
    await clickButton("復元");

    const buttons = await screen.findAllByRole("button", { name: "復元" });
    expect(buttons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);

    await clickButton("復元", 1);
    expect(restoreNote).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRestore?.(makeNote());
    });
    await waitFor(() => {
      const reenabled = screen.getAllByRole("button", { name: "復元" });
      expect(reenabled.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
    });
  });

  it("復元では確認ダイアログを出さない", async () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    const { restoreNote } = mockHanamask();

    render(<TrashView onBack={vi.fn()} />);
    await clickButton("復元");

    expect(confirmMock).not.toHaveBeenCalled();
    expect(restoreNote).toHaveBeenCalledWith("note-1");
  });

  it("一覧取得に失敗するとエラーを表示する", async () => {
    mockHanamask({
      listDeletedNotes: async () => {
        throw new Error("boom");
      },
    });

    render(<TrashView onBack={vi.fn()} />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "削除済みノートの読み込みに失敗しました",
    );
  });

  it("復元に失敗するとエラーを表示する", async () => {
    mockHanamask({
      restoreNote: async () => {
        throw new Error("boom");
      },
    });

    render(<TrashView onBack={vi.fn()} />);
    await clickButton("復元");

    expect((await screen.findByRole("alert")).textContent).toContain("ノートの復元に失敗しました");
  });

  it("復元対象が見つからないときはエラーを表示する", async () => {
    mockHanamask({ restoreNote: async () => null });

    render(<TrashView onBack={vi.fn()} />);
    await clickButton("復元");

    expect((await screen.findByRole("alert")).textContent).toContain(
      "対象のノートが見つかりません",
    );
  });

  it("戻るボタンで onBack を呼ぶ", async () => {
    mockHanamask();
    const onBack = vi.fn();

    render(<TrashView onBack={onBack} />);
    await clickButton("戻る");

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("アンマウント後に届いた取得結果で状態を更新しない", async () => {
    let resolveList: ((notes: DeletedNote[]) => void) | undefined;
    mockHanamask({
      listDeletedNotes: () =>
        new Promise<DeletedNote[]>((resolve) => {
          resolveList = resolve;
        }),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = render(<TrashView onBack={vi.fn()} />);
    unmount();
    await act(async () => {
      resolveList?.([makeNote()]);
    });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("消したメモ")).toBeNull();
  });
  it("削除直後は猶予いっぱいの残り日数を表示する", async () => {
    mockHanamask({ listDeletedNotes: async () => [makeNote({ deletedAt: isoDaysAgo(0) })] });

    render(<TrashView onBack={vi.fn()} />);

    expect(await screen.findByText("あと 30 日")).toBeTruthy();
  });

  it("29日経過したノートはあと1日と表示する", async () => {
    mockHanamask({ listDeletedNotes: async () => [makeNote({ deletedAt: isoDaysAgo(29) })] });

    render(<TrashView onBack={vi.fn()} />);

    expect(await screen.findByText("あと 1 日")).toBeTruthy();
  });

  it("猶予を過ぎたノートでも負の日数は出さない", async () => {
    mockHanamask({ listDeletedNotes: async () => [makeNote({ deletedAt: isoDaysAgo(31) })] });

    render(<TrashView onBack={vi.fn()} />);

    expect(await screen.findByText("あと 0 日")).toBeTruthy();
  });

  it("期限が近いノートだけ色で区別する", async () => {
    mockHanamask({
      listDeletedNotes: async () => [
        makeNote({ id: "note-1", title: "まだ余裕", deletedAt: isoDaysAgo(1) }),
        makeNote({ id: "note-2", title: "もうすぐ消える", deletedAt: isoDaysAgo(28) }),
      ],
    });

    render(<TrashView onBack={vi.fn()} />);

    const soon = await screen.findByText("あと 2 日");
    const later = screen.getByText("あと 29 日");
    expect(soon.className).toContain("text-crit");
    expect(later.className).not.toContain("text-crit");
  });
});
