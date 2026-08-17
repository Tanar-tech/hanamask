import { describe, expect, it, vi } from "vitest";

type HeadersReceivedListener = (
  details: { responseHeaders?: Record<string, string[]> },
  callback: (response: { responseHeaders?: Record<string, string[]> }) => void,
) => void;

const onHeadersReceived = vi.fn<(listener: HeadersReceivedListener) => void>();

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
  session: { defaultSession: { webRequest: { onHeadersReceived } } },
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
  ipcMain: { handle: vi.fn() },
}));

vi.mock("../../src/main/db/db", () => ({ openDb: vi.fn(), closeDb: vi.fn() }));
vi.mock("../../src/main/db/notes-repo", () => ({ searchNotes: vi.fn() }));
vi.mock("../../src/main/db/tasks-repo", () => ({ listTasks: vi.fn() }));
vi.mock("../../src/main/db/purge", () => ({
  purgeSoftDeletedRecords: vi.fn(() => ({ notesPurged: 0, tasksPurged: 0 })),
}));
vi.mock("../../src/main/mcp/server", () => ({
  startMcpServer: vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) })),
}));
vi.mock("../../src/main/mcp/change-emitter", () => ({
  emitNotesChanged: vi.fn(),
  onNotesChanged: vi.fn(() => () => {}),
  emitTasksChanged: vi.fn(),
  onTasksChanged: vi.fn(() => () => {}),
  emitLinksChanged: vi.fn(),
  onLinksChanged: vi.fn(() => () => {}),
}));

const importMain = () => import("../../src/main/index");

const parseDirectives = (policy: string): Map<string, string> =>
  new Map(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name ?? "", sources.join(" ")];
    }),
  );

const DEV_SERVER_URL = "http://localhost:5173";

describe("renderer Content-Security-Policy", () => {
  it("locks the packaged renderer down to its own bundle", async () => {
    const { buildContentSecurityPolicy } = await importMain();
    const directives = parseDirectives(buildContentSecurityPolicy(undefined));

    expect(directives.get("default-src")).toBe("'none'");
    expect(directives.get("script-src")).toBe("'self'");
    expect(directives.get("object-src")).toBe("'none'");
    expect(directives.get("base-uri")).toBe("'none'");
    expect(directives.get("frame-ancestors")).toBe("'none'");
  });

  it("never allows eval, and never allows inline script even in development", async () => {
    const { buildContentSecurityPolicy } = await importMain();

    const production = parseDirectives(buildContentSecurityPolicy(undefined));
    expect(production.get("script-src")).not.toContain("'unsafe-eval'");
    expect(production.get("script-src")).not.toContain("'unsafe-inline'");

    const development = parseDirectives(buildContentSecurityPolicy(DEV_SERVER_URL));
    expect(development.get("script-src")).not.toContain("'unsafe-eval'");
  });

  // mermaidが生成SVGに埋め込む<style>とstyle属性を通すための緩和。落とすと図が描画されない。
  it("allows the inline styles mermaid injects into its generated SVG", async () => {
    const { buildContentSecurityPolicy } = await importMain();
    const directives = parseDirectives(buildContentSecurityPolicy(undefined));

    expect(directives.get("style-src")).toContain("'unsafe-inline'");
  });

  it("allows attached images to load without opening the whole file system", async () => {
    const { buildContentSecurityPolicy } = await importMain();
    const production = parseDirectives(buildContentSecurityPolicy(undefined));

    // 本番は文書自体が file:// なので添付画像は 'self' で届く。裸の file: を許すと
    // ノート本文に紛れた <img src="file:///..."> で任意のローカルファイルを読ませうる。
    expect(production.get("img-src")).toBe("'self' data:");

    // 開発時だけは文書オリジンが dev server になり 'self' から外れるため必要。
    const development = parseDirectives(buildContentSecurityPolicy(DEV_SERVER_URL));
    expect(development.get("img-src")).toContain("file:");
  });

  it("keeps the Vite dev server relaxations out of the packaged policy", async () => {
    const { buildContentSecurityPolicy } = await importMain();

    const development = parseDirectives(buildContentSecurityPolicy(DEV_SERVER_URL));
    expect(development.get("script-src")).toContain("'unsafe-inline'");
    expect(development.get("script-src")).toContain(DEV_SERVER_URL);
    expect(development.get("connect-src")).toContain("ws://localhost:5173");

    const production = parseDirectives(buildContentSecurityPolicy(undefined));
    expect(production.get("script-src")).not.toContain("localhost");
    expect(production.get("connect-src")).not.toContain("ws:");
    expect(production.get("connect-src")).toBe("'self'");
    expect(production.get("img-src")).not.toContain("file:");
  });

  it("sets the header on every response the renderer receives", async () => {
    const { buildContentSecurityPolicy } = await importMain();
    await vi.waitFor(() => {
      expect(onHeadersReceived).toHaveBeenCalled();
    });

    const listener = onHeadersReceived.mock.calls[0]?.[0];
    if (listener === undefined) throw new Error("no onHeadersReceived listener was registered");
    const responses: Array<{ responseHeaders?: Record<string, string[]> }> = [];
    listener({ responseHeaders: { "content-type": ["text/html"] } }, (response) => {
      responses.push(response);
    });

    const [response] = responses;
    expect(response?.responseHeaders?.["content-type"]).toEqual(["text/html"]);
    expect(response?.responseHeaders?.["Content-Security-Policy"]).toEqual([
      buildContentSecurityPolicy(undefined),
    ]);
  });
});
