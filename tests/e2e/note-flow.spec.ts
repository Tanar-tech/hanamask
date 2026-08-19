import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCREENSHOT_DIR, callMcpTool, createNoteViaMcp, launchApp, reserveMcpPort } from "./helpers.js";

// ポートは実行時にOSから空きを取る（固定するとE2Eの同時実行で衝突する）。
let E2E_MCP_PORT = 0;

describe("note flow (Electron app + MCP server + renderer)", () => {
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

  it("reflects a note created via MCP in the open window, and persists it across restarts", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");

    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();

    expect(await window.title()).toBe("hanamask");
    await window.getByText("ノートはまだありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "01-empty.png") });

    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "E2Eテストノート",
      body: "MCP経由で作成し、開いた画面に自動反映されることを確認する",
      tags: ["e2e"],
    });

    // No manual reload: the main process forwards the MCP-triggered change over IPC.
    await window.getByText("E2Eテストノート").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "02-note-created.png") });

    // 一時的な失敗（upload-artifact v7 の保存確認用。スクショを撮ったあとに落とす）。
    expect(true).toBe(false);

    await app.close();
    app = undefined;

    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const restartedWindow = await app.firstWindow();
    await restartedWindow.waitForLoadState();
    await restartedWindow.getByText("E2Eテストノート").waitFor();
    await restartedWindow.screenshot({ path: join(SCREENSHOT_DIR, "03-persisted-after-restart.png") });
  });

  it("removes a note from the open window on delete_note and brings it back on restore_note", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");

    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();

    const id = await createNoteViaMcp(E2E_MCP_PORT, {
      title: "削除復元テストノート",
      body: "delete_note/restore_noteの反映を確認する",
      tags: [],
    });
    await window.getByText("削除復元テストノート").waitFor();

    await callMcpTool(E2E_MCP_PORT, "delete_note", { id, confirm: true });
    await expect
      .poll(() => window.getByText("削除復元テストノート").count())
      .toBe(0);
    await window.getByText("ノートはまだありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "04-note-deleted.png") });

    await callMcpTool(E2E_MCP_PORT, "restore_note", { id });
    await window.getByText("削除復元テストノート").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "05-note-restored.png") });
  });
});
