import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCREENSHOT_DIR, callMcpTool, createNoteViaMcp, launchApp, reserveMcpPort } from "./helpers.js";

/*
 * 常駐の目的は「終了しないこと」ではなく「ウィンドウを閉じてもエージェントが書けること」。
 * MCPサーバーはmainプロセス内に立っているので、閉じたあとに実際にツールを呼んで確かめる。
 */
let E2E_MCP_PORT = 0;

describe("tray flow (window closed but MCP alive)", () => {
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

  it("keeps serving MCP after every window is closed, and shows the note when reopened", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-tray-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");

    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();
    await window.getByText("ノートはまだありません").waitFor();

    await window.close();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);

    // ここが受け入れ条件の本体。閉じた状態でエージェントが書けなければ常駐の意味が無い。
    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "閉じたまま書いたノート",
      body: "ウィンドウを閉じてもMCPサーバーが生きていることの確認",
      tags: ["tray"],
    });

    const listed = await callMcpTool(E2E_MCP_PORT, "search_notes", { query: "閉じたまま" });
    expect(JSON.stringify(listed.content)).toContain("閉じたまま書いたノート");

    // トレイの「開く」と同じ経路（open_app）でウィンドウが戻り、書かれた内容が見える。
    await callMcpTool(E2E_MCP_PORT, "open_app", {});
    const reopened = await app.firstWindow();
    await reopened.waitForLoadState();
    await reopened.getByText("閉じたまま書いたノート").waitFor();
    await reopened.screenshot({ path: join(SCREENSHOT_DIR, "tray-01-reopened.png") });
  });

  it("still shuts down cleanly when the app is asked to quit", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-tray-quit-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");

    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();
    await window.close();

    // 常駐で app.close() が返らなくなると、既存specの後片付けが全て止まる。
    await app.close();
    app = undefined;

    await expect(callMcpTool(E2E_MCP_PORT, "search_notes", { query: "" })).rejects.toThrow();
  });
});
