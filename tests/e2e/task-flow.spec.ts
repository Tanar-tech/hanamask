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

  /*
   * update_note がハンドラで body を落としていた回帰（#119）と同じ形の穴が
   * タスク側にも開きうる。本文が「実際に書き換わる」ことを画面で確かめる。
   */
  it("update_task で書き換えた本文が、開いている詳細画面に反映される", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-taskbody-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");
    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();
    await openTaskList(window);

    const taskId = readTaskId(
      await callMcpTool(E2E_MCP_PORT, "create_task", {
        title: "本文つきタスク",
        status: "todo",
        body: "## 反映前\n\n- 前の項目",
      }),
    );
    await taskListOf(window).getByRole("button", { name: "本文つきタスク" }).click();
    await window.getByRole("heading", { name: "本文つきタスク" }).waitFor();
    // Markdownとして描画されるので、記号ではなく見出し要素になっていること。
    await window.getByRole("heading", { name: "反映前" }).waitFor();

    await callMcpTool(E2E_MCP_PORT, "update_task", {
      id: taskId,
      body: "## 反映後\n\n- 後の項目",
    });

    // 手動リロードなしで本文が入れ替わる。
    await window.getByRole("heading", { name: "反映後" }).waitFor();
    await expect.poll(() => window.getByText("前の項目").count()).toBe(0);
    await window.screenshot({ path: join(SCREENSHOT_DIR, "task-05-body-updated.png") });
  });

  it("一覧から削除したタスクをゴミ箱から復元できる", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-tasktrash-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");
    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    // 削除は window.confirm で確認する。ハンドラは最初の描画より先に登録する。
    window.on("dialog", (dialog) => {
      void dialog.accept();
    });
    await window.waitForLoadState();
    await openTaskList(window);

    await callMcpTool(E2E_MCP_PORT, "create_task", { title: "ゴミ箱往復タスク", status: "todo" });
    await taskListOf(window).getByText("ゴミ箱往復タスク").waitFor();

    await taskListOf(window).getByRole("button", { name: "削除" }).click();
    await window.getByText("タスクはまだありません").waitFor();

    await window.getByRole("button", { name: "ゴミ箱" }).click();
    await window.getByRole("heading", { name: "ゴミ箱" }).waitFor();
    await window.getByText("ゴミ箱往復タスク").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "task-06-in-trash.png") });

    await window.getByRole("button", { name: "復元" }).click();
    await window.getByText("削除済みのページ・タスク・ノートはありません").waitFor();

    await window.getByRole("button", { name: "戻る" }).click();
    await openTaskList(window);
    await taskListOf(window).getByText("ゴミ箱往復タスク").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "task-07-restored.png") });
  });
});
