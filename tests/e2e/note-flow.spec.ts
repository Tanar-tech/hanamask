import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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

const createNoteViaMcp = async (input: { title: string; body: string; tags: string[] }): Promise<void> => {
  const client = new Client({ name: "hanamask-e2e", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${E2E_MCP_PORT}/mcp`),
  );
  await client.connect(transport);
  try {
    const result = await client.callTool({ name: "create_note", arguments: input });
    if (result.isError === true) {
      throw new Error(`create_note failed: ${JSON.stringify(result.content)}`);
    }
  } finally {
    await client.close();
  }
};

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
});
