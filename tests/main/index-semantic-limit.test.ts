import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RelatedNotesResult, SemanticSearchResult } from "../../src/shared/preload-api";

const ipcHandle = vi.fn();
const searchSemanticEntities = vi.fn(
  async (): Promise<SemanticSearchResult> => ({ notes: [], tasks: [] }),
);
const findRelatedNotes = vi.fn((): RelatedNotesResult => ({ notes: [] }));

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
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: () => true,
    getPath: vi.fn(() => "/tmp/hanamask-userdata"),
  },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  // Declared as a function expression because the module under test calls it with `new`.
  BrowserWindow: Object.assign(
    vi.fn(function createFakeWindow() {
      return {
        webContents: { send: vi.fn() },
        loadFile: vi.fn(() => Promise.resolve()),
        loadURL: vi.fn(() => Promise.resolve()),
      };
    }),
    { getAllWindows: () => [] },
  ),
  ipcMain: { handle: ipcHandle },
}));

vi.mock("../../src/main/db/db", () => ({ openDb: vi.fn(), closeDb: vi.fn() }));
vi.mock("../../src/main/db/purge", () => ({ purgeSoftDeletedRecords: vi.fn() }));
vi.mock("../../src/main/mcp/server", () => ({
  startMcpServer: vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) })),
}));
vi.mock("../../src/main/llm/llama-embedding-provider", () => ({
  loadEmbeddingProvider: vi.fn(async () => ({ state: "unavailable", reason: "テスト" })),
}));
vi.mock("../../src/main/llm/semantic-search-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/main/llm/semantic-search-service")>()),
  searchSemanticEntities,
  findRelatedNotes,
}));

const findHandler = (channel: string): ((...args: unknown[]) => unknown) => {
  const registration = ipcHandle.mock.calls.find((call) => call[0] === channel);
  if (registration === undefined) throw new Error(`${channel} handler was not registered`);
  return registration[1];
};

describe("意味検索の件数指定", () => {
  beforeAll(async () => {
    // The module starts the app as an import side effect.
    await import("../../src/main/index");
    await vi.waitFor(() => {
      expect(ipcHandle).toHaveBeenCalledWith("embedding:search", expect.any(Function));
    });
  });

  beforeEach(() => {
    searchSemanticEntities.mockClear();
    findRelatedNotes.mockClear();
  });

  it("上限を超える件数は丸める", async () => {
    await findHandler("embedding:search")(undefined, "MCPの接続", 101);

    expect(searchSemanticEntities).toHaveBeenCalledWith("MCPの接続", 100);
  });

  it("件数を省略すると既定の10件になる", async () => {
    await findHandler("embedding:search")(undefined, "MCPの接続", undefined);

    expect(searchSemanticEntities).toHaveBeenCalledWith("MCPの接続", 10);
  });

  it("整数でない件数は受け付けない", () => {
    expect(() => findHandler("embedding:search")(undefined, "MCPの接続", 1.5)).toThrow();
    expect(() => findHandler("embedding:search")(undefined, "MCPの接続", 0)).toThrow();
    expect(() => findHandler("embedding:search")(undefined, "MCPの接続", "10")).toThrow();
    expect(searchSemanticEntities).not.toHaveBeenCalled();
  });

  it("関連ノートも上限で丸め、省略時は詳細画面の既定5件になる", () => {
    findHandler("embedding:related-notes")(undefined, "note-1", 101);
    findHandler("embedding:related-notes")(undefined, "note-1", undefined);

    expect(findRelatedNotes).toHaveBeenNthCalledWith(1, "note-1", 100);
    expect(findRelatedNotes).toHaveBeenNthCalledWith(2, "note-1", 5);
  });
});
