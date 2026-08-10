import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication, type Page } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SCREENSHOT_DIR,
  callMcpTool,
  launchApp,
  openTaskList,
  reserveMcpPort,
} from "./helpers.js";

// ポートは実行時にOSから空きを取る（固定するとE2Eの同時実行で衝突する）。
let E2E_MCP_PORT = 0;

/*
 * カンバンの移動は HTML5 の drag and drop で、Playwright の dragTo が送る
 * マウス操作では発火しない。dataTransfer を持つイベントを画面側で組み立てて
 * 送る。実装が dataTransfer にidを載せて受け渡す形なので、この経路で
 * ハンドラの結線（列をまたぐとステータスが変わる）を確かめられる。
 */
const dragTaskToColumn = async (window: Page, title: string, columnLabel: string): Promise<void> => {
  await window.evaluate(
    ({ taskTitle, column }) => {
      const card = [...document.querySelectorAll("li[draggable='true']")].find((element) =>
        element.textContent?.includes(taskTitle),
      );
      const heading = [...document.querySelectorAll("h3")].find(
        (element) => element.textContent?.trim() === column,
      );
      const target = heading?.closest("section");
      if (card === undefined || target === null || target === undefined) {
        throw new Error(`drag source or target not found: ${taskTitle} → ${column}`);
      }
      const dataTransfer = new DataTransfer();
      card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
    },
    { taskTitle: title, column: columnLabel },
  );
};

const statusOfTaskViaMcp = async (mcpPort: number, title: string): Promise<string> => {
  const listed = await callMcpTool(mcpPort, "list_tasks", {});
  const text = JSON.stringify(listed.content);
  const match = new RegExp(`\\{[^{}]*"title":"${title}"[^{}]*\\}`).exec(text.replace(/\\"/g, '"'));
  if (match === null) throw new Error(`task not found in list_tasks: ${title}`);
  const status = /"status":"([a-z_]+)"/.exec(match[0]);
  if (status === null) throw new Error(`status not found for ${title}: ${match[0]}`);
  return status[1] ?? "";
};

describe("kanban flow (move a task between columns by dragging)", () => {
  let dbFilePath: string;
  let workDir: string;
  let app: ElectronApplication | undefined;

  beforeAll(async () => {
    E2E_MCP_PORT = await reserveMcpPort();
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (workDir !== undefined) rmSync(workDir, { recursive: true, force: true });
  });

  const startApp = async (): Promise<Page> => {
    workDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-kanban-"));
    dbFilePath = join(workDir, "hanamask.sqlite3");
    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();
    await openTaskList(window);
    return window;
  };

  it("別の列へ運ぶとステータスが変わり、保存される", async () => {
    const window = await startApp();

    await callMcpTool(E2E_MCP_PORT, "create_task", { title: "運ばれるタスク", status: "todo" });
    await window.getByRole("heading", { name: "未着手" }).waitFor();
    await window.getByText("運ばれるタスク").first().waitFor();

    await dragTaskToColumn(window, "運ばれるタスク", "進行中");

    // 画面が変わっただけでなく、保存されていること。
    await expect
      .poll(() => statusOfTaskViaMcp(E2E_MCP_PORT, "運ばれるタスク"), { timeout: 10_000 })
      .toBe("in_progress");
    await window.screenshot({ path: join(SCREENSHOT_DIR, "kanban-01-moved.png") });
  });

  it("同じ列へ落としてもステータスは変わらない", async () => {
    const window = await startApp();

    await callMcpTool(E2E_MCP_PORT, "create_task", { title: "動かないタスク", status: "todo" });
    await window.getByText("動かないタスク").first().waitFor();

    await dragTaskToColumn(window, "動かないタスク", "未着手");

    // 変わらないことの確認なので、少し待ってから読む。
    await window.waitForTimeout(1_000);
    expect(await statusOfTaskViaMcp(E2E_MCP_PORT, "動かないタスク")).toBe("todo");
  });
});
