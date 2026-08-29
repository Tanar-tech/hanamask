import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeWindow {
  webContents: { send: ReturnType<typeof vi.fn> };
  loadFile: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
}

const openDb = vi.fn();
const ipcHandle = vi.fn();
const quit = vi.fn();
const appOn = vi.fn();
const requestSingleInstanceLock = vi.fn(() => true);
const startMcpServer = vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) }));
const openWindows: FakeWindow[] = [];

// Declared as a function expression because the module under test calls it with `new`.
const BrowserWindowMock = vi.fn(function createFakeWindow(): FakeWindow {
  const window: FakeWindow = {
    webContents: { send: vi.fn() },
    loadFile: vi.fn(() => Promise.resolve()),
    loadURL: vi.fn(() => Promise.resolve()),
    show: vi.fn(),
    focus: vi.fn(),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
  };
  openWindows.push(window);
  return window;
});

vi.mock("electron", () => ({
  Tray: class {
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    on = vi.fn();
    destroy = vi.fn();
  },
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  app: {
    whenReady: () => Promise.resolve(),
    on: appOn,
    quit,
    requestSingleInstanceLock,
    getPath: vi.fn(() => "/tmp/hanamask-userdata"),
  },
  BrowserWindow: Object.assign(BrowserWindowMock, { getAllWindows: () => openWindows }),
  ipcMain: { handle: ipcHandle },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
}));

vi.mock("../../src/main/db/db", () => ({ openDb, closeDb: vi.fn() }));
vi.mock("../../src/main/db/notes-repo", () => ({ searchNotes: vi.fn() }));
vi.mock("../../src/main/db/notebooks-repo", () => ({ listDeletedNotebooks: vi.fn(() => []), restoreNotebook: vi.fn(() => null) }));
vi.mock("../../src/main/db/tasks-repo", () => ({ listTasks: vi.fn() }));
vi.mock("../../src/main/db/purge", () => ({
  purgeSoftDeletedRecords: vi.fn(() => ({ notesPurged: 0, tasksPurged: 0 })),
}));
vi.mock("../../src/main/mcp/server", () => ({ startMcpServer }));
vi.mock("../../src/main/mcp/change-emitter", () => ({
  emitChatEntriesChanged: vi.fn(),
  onChatEntriesChanged: vi.fn(() => () => {}),
  onChatPresenceChanged: vi.fn(() => () => {}),
  emitNotesChanged: vi.fn(),
  onNotesChanged: vi.fn(() => () => {}),
  onNotebooksChanged: vi.fn(() => () => undefined),
  listDeletedNotebooks: vi.fn(async () => []),
  restoreNotebook: vi.fn(async () => true),
  emitTasksChanged: vi.fn(),
  onTasksChanged: vi.fn(() => () => {}),
  emitLinksChanged: vi.fn(),
  onLinksChanged: vi.fn(() => () => {}),
}));

const loadMain = async (): Promise<void> => {
  vi.resetModules();
  await import("../../src/main/index");
};

/*
 * AIチャットは動作しないため利用者から見えない状態にした（CHAT_ENABLED）。
 * 画面から消すだけでは「使えない」ことにならない。レンダラーへの経路が残っていれば
 * 呼び出せてしまうので、IPCそのものを登録していないことを確かめる。
 */
describe("AIチャットのIPCを登録しない", () => {
  beforeEach(() => {
    ipcHandle.mockClear();
    appOn.mockClear();
    BrowserWindowMock.mockClear();
    openWindows.length = 0;
  });

  // chat:list-entries 等はチャット欄（利用者とMCPエージェントの対話）用で、APIキーを使う
  // アプリ内蔵チャットとは別物。凍結対象は Anthropic API を呼ぶ側のチャネルだけ。
  it("Anthropic APIを呼ぶチャットのチャネルを1つも登録しない", async () => {
    await loadMain();

    const channels = ipcHandle.mock.calls.map((call) => String(call[0]));
    const frozen = channels.filter((channel) =>
      /^chat:(send|abort|read-settings|save-api-key|clear-api-key|save-model)$/.test(channel),
    );
    expect(frozen).toEqual([]);
  });

  it("チャット欄のチャネルは登録する", async () => {
    await loadMain();

    const channels = ipcHandle.mock.calls.map((call) => String(call[0]));
    expect(channels).toContain("chat:list-entries");
    expect(channels).toContain("chat:post-entry");
    expect(channels).toContain("chat:presence");
  });

  it("ノートやタスクのIPCは今までどおり登録する", async () => {
    await loadMain();

    const channels = ipcHandle.mock.calls.map((call) => String(call[0]));
    expect(channels).toContain("notes:list");
    expect(channels).toContain("tasks:list");
  });
});
