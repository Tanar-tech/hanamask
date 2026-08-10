import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication, type Page } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SCREENSHOT_DIR,
  callMcpTool,
  createNoteViaMcp,
  launchApp,
  openNoteDetail,
  openNoteList,
  reserveMcpPort,
} from "./helpers.js";

// ポートは実行時にOSから空きを取る（固定するとE2Eの同時実行で衝突する）。
let E2E_MCP_PORT = 0;

const RESTORE_LABEL = "このバージョンに戻す";

/*
 * 版の復元は、いま表示している本文を古い内容で上書きする。取り違えると
 * 利用者は書いたものを失う。復元そのものも履歴に残る（＝やり直せる）ことまで
 * 確かめないと、「戻したら戻せなくなった」という失い方を防げない。
 */
describe("note version history (restore an older version from the detail screen)", () => {
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
    workDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-history-"));
    dbFilePath = join(workDir, "hanamask.sqlite3");
    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    // 復元は確認を挟む。最初の描画より先に登録して、ダイアログとの競合を避ける。
    window.on("dialog", (dialog) => {
      void dialog.accept();
    });
    await window.waitForLoadState();
    return window;
  };

  it("古い版に戻すと本文が入れ替わり、戻す前の内容も履歴に残る", async () => {
    const window = await startApp();

    const noteId = await createNoteViaMcp(E2E_MCP_PORT, {
      title: "版のあるノート",
      body: "最初の本文",
      tags: [],
    });
    await callMcpTool(E2E_MCP_PORT, "update_note", { id: noteId, body: "書き換えた本文" });

    await openNoteList(window);
    await openNoteDetail(window, "版のあるノート");
    await window.getByText("書き換えた本文").waitFor();

    const history = window.getByRole("list").filter({ hasText: RESTORE_LABEL });
    /*
     * 復元すると同じ文字列が本文と履歴プレビューの両方に出る。本文はMarkdownの
     * 段落として <p> に、履歴プレビューは <span> に描画されるので、そこで区別する。
     */
    const noteBody = (text: string) => window.locator("p").filter({ hasText: text });
    // 更新は1回なので、履歴は「最初の本文」1件だけ。
    await expect.poll(() => history.getByRole("button", { name: RESTORE_LABEL }).count()).toBe(1);

    await history.getByRole("button", { name: RESTORE_LABEL }).first().click();

    // 本文が古い内容に入れ替わる。
    await noteBody("最初の本文").waitFor();
    await expect.poll(() => noteBody("書き換えた本文").count()).toBe(0);
    await window.screenshot({ path: join(SCREENSHOT_DIR, "history-01-restored.png") });

    /*
     * 復元も更新なので履歴に積まれる。ここが2件になっていなければ、
     * 「書き換えた本文」を取り戻す手段が無くなっている。
     */
    await expect.poll(() => history.getByRole("button", { name: RESTORE_LABEL }).count()).toBe(2);
    await history.getByText("書き換えた本文").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "history-02-undoable.png") });
  });

  it("履歴が無いノートには「編集履歴はありません」と出る", async () => {
    const window = await startApp();

    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "一度も更新していないノート",
      body: "そのまま",
      tags: [],
    });

    await openNoteList(window);
    await openNoteDetail(window, "一度も更新していないノート");

    await window.getByText("編集履歴はありません").waitFor();
  });
});
