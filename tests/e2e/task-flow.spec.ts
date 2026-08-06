import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SCREENSHOT_DIR,
  type CallToolResult,
  callMcpTool,
  launchApp,
  openTaskList,
  taskListOf,
  reserveMcpPort,
} from "./helpers.js";

// ポートは実行時にOSから空きを取る（固定するとE2Eの同時実行で衝突する）。
let E2E_MCP_PORT = 0;
const TASK_TITLE = "E2Eテストタスク";

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

const readTaskId = (result: CallToolResult): string => {
  const payload: unknown = JSON.parse(readSingleText(result.content));
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

  beforeAll(async () => {
    E2E_MCP_PORT = await reserveMcpPort();
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

    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();

    // The app opens on the home screen; this test operates on the task list itself.
    await openTaskList(window);

    // TaskList and KanbanView both render every task's title, so scope to TaskList's
    // own <ul> by its accessible name to keep locators unambiguous.
    const taskList = taskListOf(window);

    await window.getByText("タスクはまだありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "task-01-empty.png") });

    const taskId = readTaskId(
      await callMcpTool(E2E_MCP_PORT, "create_task", { title: TASK_TITLE, status: "todo" }),
    );
    expect(taskId).not.toBe("");

    // No manual reload: the main process forwards the MCP-triggered change over IPC.
    await taskList.getByText(TASK_TITLE).waitFor();
    await taskList.getByText("未着手").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "task-02-created.png") });

    await callMcpTool(E2E_MCP_PORT, "delete_task", { id: taskId, confirm: true });
    await window.getByText("タスクはまだありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "task-03-deleted.png") });

    await callMcpTool(E2E_MCP_PORT, "restore_task", { id: taskId });
    await taskList.getByText(TASK_TITLE).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "task-04-restored.png") });
  });
});
