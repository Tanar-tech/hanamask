import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CHANGE_NOTIFICATION_WINDOW_MS } from "../../src/main/notify/change-notifier";
import type { EntityChange } from "../../src/main/mcp/change-emitter";

interface FakeWindow {
  webContents: {
    send: ReturnType<typeof vi.fn>;
    isLoading: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
  };
  loadFile: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  isFocused: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
}

interface FakeNotification {
  show: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}

const ipcHandle = vi.fn();
const openDb = vi.fn();
const startMcpServer = vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) }));
const notesChangedListeners: Array<(change?: EntityChange) => void> = [];
const tasksChangedListeners: Array<(change?: EntityChange) => void> = [];
const openWindows: FakeWindow[] = [];
const createdNotifications: FakeNotification[] = [];
const isNotificationSupported = vi.fn(() => true);

// Declared as a function expression because the module under test calls it with `new`.
const BrowserWindowMock = vi.fn(function createFakeWindow(): FakeWindow {
  const window: FakeWindow = {
    webContents: { send: vi.fn(), isLoading: vi.fn(() => false), once: vi.fn() },
    loadFile: vi.fn(() => Promise.resolve()),
    loadURL: vi.fn(() => Promise.resolve()),
    show: vi.fn(),
    focus: vi.fn(),
    isFocused: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
  };
  openWindows.push(window);
  return window;
});

const NotificationMock = vi.fn(function createFakeNotification(): FakeNotification {
  const notification: FakeNotification = { show: vi.fn(), on: vi.fn() };
  createdNotifications.push(notification);
  return notification;
});

vi.mock("electron", () => ({
  app: {
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
    quit: vi.fn(),
    getPath: vi.fn(() => "/tmp/hanamask-userdata"),
  },
  BrowserWindow: Object.assign(BrowserWindowMock, {
    getAllWindows: () => openWindows,
  }),
  Notification: Object.assign(NotificationMock, {
    isSupported: () => isNotificationSupported(),
  }),
  ipcMain: { handle: ipcHandle },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
}));

vi.mock("../../src/main/db/db", () => ({ openDb, closeDb: vi.fn() }));
vi.mock("../../src/main/db/notes-repo", () => ({ searchNotes: vi.fn(), softDeleteNote: vi.fn() }));
vi.mock("../../src/main/db/tasks-repo", () => ({ listTasks: vi.fn(), updateTask: vi.fn() }));
vi.mock("../../src/main/db/purge", () => ({ purgeSoftDeletedRecords: vi.fn() }));
vi.mock("../../src/main/mcp/server", () => ({ startMcpServer }));
vi.mock("../../src/main/mcp/change-emitter", () => ({
  emitNotesChanged: vi.fn(),
  onNotesChanged: (listener: (change?: EntityChange) => void) => {
    notesChangedListeners.push(listener);
    return () => {};
  },
  emitTasksChanged: vi.fn(),
  onTasksChanged: (listener: (change?: EntityChange) => void) => {
    tasksChangedListeners.push(listener);
    return () => {};
  },
  emitLinksChanged: vi.fn(),
  onLinksChanged: vi.fn(() => () => {}),
}));

const emitNoteChange = (change: EntityChange): void => {
  if (notesChangedListeners.length === 0) {
    throw new Error("no notes-changed listener was registered");
  }
  notesChangedListeners.forEach((listener) => {
    listener(change);
  });
};

const emitTaskChange = (change: EntityChange): void => {
  if (tasksChangedListeners.length === 0) {
    throw new Error("no tasks-changed listener was registered");
  }
  tasksChangedListeners.forEach((listener) => {
    listener(change);
  });
};

const firstWindow = (): FakeWindow => {
  const window = openWindows[0];
  if (window === undefined) throw new Error("no window was created");
  return window;
};

const noteChange = (overrides: Partial<EntityChange> = {}): EntityChange => ({
  entity: "note",
  action: "created",
  id: "note-1",
  title: "設計メモ",
  ...overrides,
});

describe("main process change notifications", () => {
  beforeAll(async () => {
    // The module starts the app as an import side effect.
    await import("../../src/main/index");
    await vi.waitFor(() => {
      expect(openWindows.length).toBe(1);
    });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    createdNotifications.length = 0;
    NotificationMock.mockClear();
    isNotificationSupported.mockReturnValue(true);
    firstWindow().isFocused.mockReturnValue(false);
    firstWindow().webContents.send.mockClear();
    firstWindow().show.mockClear();
    firstWindow().focus.mockClear();
  });

  afterEach(() => {
    // 残った集約タイマーが次のテストへ漏れないよう、実時間へ戻す前に流し切る。
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    createdNotifications.length = 0;
    NotificationMock.mockClear();
  });

  it("ウィンドウにフォーカスがある間の変更ではOS通知を出さない", () => {
    firstWindow().isFocused.mockReturnValue(true);

    emitNoteChange(noteChange());
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS * 2);

    expect(NotificationMock).not.toHaveBeenCalled();
  });

  it("フォーカスが無い間の変更ではOS通知を出す", () => {
    emitNoteChange(noteChange());
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    expect(NotificationMock).toHaveBeenCalledTimes(1);
    expect(NotificationMock).toHaveBeenCalledWith({
      title: "ノートを作成しました",
      body: "設計メモ",
    });
    expect(createdNotifications[0]?.show).toHaveBeenCalledTimes(1);
  });

  it("変更の通知はレンダラーへの再読み込み要求と両立する", () => {
    emitNoteChange(noteChange());
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    expect(firstWindow().webContents.send).toHaveBeenCalledWith("notes:changed");
    expect(NotificationMock).toHaveBeenCalledTimes(1);
  });

  it("連続した変更はまとめて1通のOS通知にする", () => {
    emitNoteChange(noteChange({ id: "note-1", title: "1つ目" }));
    emitNoteChange(noteChange({ id: "note-2", title: "2つ目" }));
    emitTaskChange({ entity: "task", action: "created", id: "task-1", title: "3つ目" });
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    expect(NotificationMock).toHaveBeenCalledTimes(1);
    expect(NotificationMock).toHaveBeenCalledWith({
      title: "3件の変更",
      body: "1つ目、2つ目、3つ目",
    });
  });

  it("OS通知をクリックすると該当ノートを開く", () => {
    emitNoteChange(noteChange({ action: "updated", id: "note-7" }));
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    const [event, listener] = createdNotifications[0]?.on.mock.calls[0] ?? [];
    expect(event).toBe("click");
    if (typeof listener !== "function") throw new Error("click listener was not registered");
    listener();

    expect(firstWindow().focus).toHaveBeenCalledTimes(1);
    expect(firstWindow().webContents.send).toHaveBeenCalledWith("ui:navigate", {
      kind: "note",
      id: "note-7",
    });
  });

  it("OS通知に対応していない環境では通知を組み立てない", () => {
    isNotificationSupported.mockReturnValue(false);

    emitNoteChange(noteChange());
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    expect(NotificationMock).not.toHaveBeenCalled();
  });
});
