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

const LINK_LIST_LABEL = "リンク一覧";

/*
 * リンクはノート同士・ノートとタスクの関係そのもの。本文と違って
 * 「どこかに書いてある」形では残らないので、失われると復元の手掛かりがない。
 * UIから張った関係が保存され、解除が確認を伴うことを画面で確かめる。
 */
describe("entity links (create and remove relations from the detail screen)", () => {
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
    workDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-links-"));
    dbFilePath = join(workDir, "hanamask.sqlite3");
    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    // 解除は確認を挟む。最初の描画より先に登録して、ダイアログとの競合を避ける。
    window.on("dialog", (dialog) => {
      void dialog.accept();
    });
    await window.waitForLoadState();
    return window;
  };

  it("ノート同士をUIから結び、解除できる", async () => {
    const window = await startApp();

    const targetId = await createNoteViaMcp(E2E_MCP_PORT, {
      title: "リンク先ノート",
      body: "結ばれる側",
      tags: [],
    });
    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "リンク元ノート",
      body: "結ぶ側",
      tags: [],
    });

    await openNoteList(window);
    await openNoteDetail(window, "リンク元ノート");
    await window.getByText("リンクはありません").waitFor();

    await window.getByLabel("リンク先の種別").selectOption("note");
    await window.getByLabel("リンク先のID").fill(targetId);
    await window.getByRole("button", { name: "リンクする" }).click();

    const links = window.getByRole("list", { name: LINK_LIST_LABEL });
    await links.getByText(targetId).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "links-01-created.png") });

    /*
     * 画面に出ただけでは保存されたと言えない。MCP から読み直して、
     * 両端のどちらから見ても関係が残っていることを確かめる。
     */
    const stored = await callMcpTool(E2E_MCP_PORT, "list_links", {
      entity_type: "note",
      entity_id: targetId,
    });
    expect(JSON.stringify(stored.content)).toContain(targetId);

    await links.getByRole("button", { name: "解除" }).click();
    await window.getByText("リンクはありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "links-02-removed.png") });
  });

  it("存在しないIDへのリンクは断られ、リンクは増えない", async () => {
    const window = await startApp();

    await createNoteViaMcp(E2E_MCP_PORT, { title: "単独ノート", body: "本文", tags: [] });
    await openNoteList(window);
    await openNoteDetail(window, "単独ノート");
    await window.getByText("リンクはありません").waitFor();

    await window.getByLabel("リンク先の種別").selectOption("note");
    await window.getByLabel("リンク先のID").fill("00000000-0000-0000-0000-000000000000");
    await window.getByRole("button", { name: "リンクする" }).click();

    // 断られた理由が画面に出て、かつ関係は増えていない。
    await window.getByRole("alert").waitFor();
    await window.getByText("リンクはありません").waitFor();
  });
});
