import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// A fixed, non-default port that also differs from the one note-flow.spec.ts uses, so the
// two specs cannot collide even if they are ever run in parallel.
const E2E_MCP_PORT = 39298;
const SCREENSHOT_DIR = join(import.meta.dirname, ".artifacts");
const TASK_TITLE = "E2Eテストタスク";

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

const callMcpTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
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
    return result.content;
  } finally {
    await client.close();
  }
};

const readSingleText = (content: unknown): string => {
  if (!Array.isArray(content) || content.length !== 1) {
    throw new Error(`Expected a single content block, got: ${JSON.stringify(content)}`);
  }
  const [block] = content;
  if (typeof block !== "object" || block === null || !("text" in block)) {
    throw new Error(`Content block has no text: ${JSON.stringify(block)}`);
  }
  const { text } = block;
  if (typeof text !== "string") {
    throw new Error(`Content block text is not a string: ${JSON.stringify(text)}`);
  }
  return text;
};

const readTaskId = (content: unknown): string => {
  const payload: unknown = JSON.parse(readSingleText(content));
  if (typeof payload !== "object" || payload === null || !("task" in payload)) {
    throw new Error(`Response has no task: ${JSON.stringify(payload)}`);
  }
  const { task } = payload;
  if (typeof task !== "object" || task === null || !("id" in task) || typeof task.id !== "string") {
    throw new Error(`Task has no string id: ${JSON.stringify(task)}`);
  }
  return task.id;
};

describe("task flow (Electron app + MCP server + renderer)", () => {
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

  it("reflects task creation, deletion and restoration made via MCP in the open window", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-task-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");

    app = await launchApp(dbFilePath);
    const window = await app.firstWindow();
    await window.waitForLoadState();

    await window.getByText("タスクはまだありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "task-01-empty.png") });

    const taskId = readTaskId(
      await callMcpTool("create_task", { title: TASK_TITLE, status: "todo" }),
    );
    expect(taskId).not.toBe("");

    // No manual reload: the main process forwards the MCP-triggered change over IPC.
    await window.getByText(TASK_TITLE).waitFor();
    await window.getByText("未着手").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "task-02-created.png") });

    await callMcpTool("delete_task", { id: taskId, confirm: true });
    await window.getByText(TASK_TITLE).waitFor({ state: "detached" });
    await window.getByText("タスクはまだありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "task-03-deleted.png") });

    await callMcpTool("restore_task", { id: taskId });
    await window.getByText(TASK_TITLE).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "task-04-restored.png") });
  });
});
