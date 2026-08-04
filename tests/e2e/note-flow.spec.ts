import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type CallToolResult = Awaited<ReturnType<Client["callTool"]>>;

// A fixed, non-default port keeps this test from colliding with an MCP server
// a developer may already have running via `npm run dev`.
const E2E_MCP_PORT = 39299;
const SCREENSHOT_DIR = join(import.meta.dirname, ".artifacts");

// VITE_DEV_SERVER_URL must not be forwarded: its presence tells src/main/index.ts to load
// the Vite dev server instead of the built dist/renderer/index.html this test relies on.
const buildLaunchEnv = (dbFilePath: string): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "VITE_DEV_SERVER_URL") env[key] = value;
  }
  env.HANAMASK_DB_PATH = dbFilePath;
  env.HANAMASK_MCP_PORT = String(E2E_MCP_PORT);
  return env;
};

const launchApp = (dbFilePath: string): Promise<ElectronApplication> =>
  electron.launch({ args: ["."], env: buildLaunchEnv(dbFilePath) });

const callMcpTool = async (name: string, args: Record<string, unknown>): Promise<CallToolResult> => {
  const client = new Client({ name: "hanamask-e2e", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${E2E_MCP_PORT}/mcp`),
  );
  await client.connect(transport);
  try {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError === true) {
      throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
    }
    return result;
  } finally {
    await client.close();
  }
};

const readNoteId = (result: CallToolResult): string => {
  if (!("content" in result) || !Array.isArray(result.content)) {
    throw new Error(`Tool result has no content array: ${JSON.stringify(result)}`);
  }
  const [firstContent] = result.content;
  if (firstContent === undefined || firstContent.type !== "text") {
    throw new Error(`Tool result has no text content: ${JSON.stringify(result)}`);
  }
  const payload: unknown = JSON.parse(firstContent.text);
  if (typeof payload !== "object" || payload === null || !("note" in payload)) {
    throw new Error("payload has no note");
  }
  const { note } = payload;
  if (typeof note !== "object" || note === null || !("id" in note)) {
    throw new Error("note has no id");
  }
  const { id } = note;
  if (typeof id !== "string") throw new Error("note id is not a string");
  return id;
};

const createNoteViaMcp = async (input: { title: string; body: string; tags: string[] }): Promise<string> =>
  readNoteId(await callMcpTool("create_note", input));

describe("note flow (Electron app + MCP server + renderer)", () => {
  let dbFilePath: string;
  let app: ElectronApplication | undefined;

  beforeAll(() => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (dbFilePath !== undefined) rmSync(dbFilePath, { force: true });
  });

  it("reflects a note created via MCP in the open window, and persists it across restarts", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");

    app = await launchApp(dbFilePath);
    const window = await app.firstWindow();
    await window.waitForLoadState();

    expect(await window.title()).toBe("hanamask");
    await window.getByText("ノートはまだありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "01-empty.png") });

    await createNoteViaMcp({
      title: "E2Eテストノート",
      body: "MCP経由で作成し、開いた画面に自動反映されることを確認する",
      tags: ["e2e"],
    });

    // No manual reload: the main process forwards the MCP-triggered change over IPC.
    await window.getByText("E2Eテストノート").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "02-note-created.png") });

    await app.close();
    app = undefined;

    app = await launchApp(dbFilePath);
    const restartedWindow = await app.firstWindow();
    await restartedWindow.waitForLoadState();
    await restartedWindow.getByText("E2Eテストノート").waitFor();
    await restartedWindow.screenshot({ path: join(SCREENSHOT_DIR, "03-persisted-after-restart.png") });
  });

  it("removes a note from the open window on delete_note and brings it back on restore_note", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");

    app = await launchApp(dbFilePath);
    const window = await app.firstWindow();
    await window.waitForLoadState();

    const id = await createNoteViaMcp({
      title: "削除復元テストノート",
      body: "delete_note/restore_noteの反映を確認する",
      tags: [],
    });
    await window.getByText("削除復元テストノート").waitFor();

    await callMcpTool("delete_note", { id, confirm: true });
    await expect
      .poll(() => window.getByText("削除復元テストノート").count())
      .toBe(0);
    await window.getByText("ノートはまだありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "04-note-deleted.png") });

    await callMcpTool("restore_note", { id });
    await window.getByText("削除復元テストノート").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "05-note-restored.png") });
  });
});
