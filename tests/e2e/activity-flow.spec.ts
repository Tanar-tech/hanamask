import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCREENSHOT_DIR, createNoteViaMcp, launchApp, reserveMcpPort } from "./helpers.js";

/*
 * 状態表示の目的は「途絶えに気づけること」。エージェントが書いた瞬間に変わらなければ、
 * 利用者は古い表示を見て判断することになる。手動リロードなしで変わるところまで確認する。
 */
let E2E_MCP_PORT = 0;

describe("activity summary on home", () => {
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

  it("shows the empty state first, then updates without a manual reload", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-activity-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");

    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();

    // 1件も無いときに「0日間」「0件」と出さない。
    await window.getByText("まだ記録がありません").waitFor();
    const emptyText = await window.getByText("まだ記録がありません").textContent();
    expect(emptyText).not.toContain("0 件");
    expect(emptyText).not.toContain("0 日");
    await window.screenshot({ path: join(SCREENSHOT_DIR, "t47-01-empty.png") });

    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "状態表示の確認",
      body: "MCP経由で書いた直後に、ホームの状態表示が変わることを見る",
      tags: ["e2e"],
    });

    await window.getByText("今週 1 件", { exact: false }).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "t47-02-active.png") });
  });
});
