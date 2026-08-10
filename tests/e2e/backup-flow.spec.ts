import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication, type Page } from "playwright";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SCREENSHOT_DIR,
  callMcpTool,
  createNoteViaMcp,
  launchApp,
  noteListOf,
  openNoteList,
  reserveMcpPort,
} from "./helpers.js";

// ポートは実行時にOSから空きを取る（固定するとE2Eの同時実行で衝突する）。
let E2E_MCP_PORT = 0;


const readFirstNoteId = (content: unknown): string => {
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error(`search_notes returned no content: ${JSON.stringify(content)}`);
  }
  const [block] = content;
  if (typeof block !== "object" || block === null || !("text" in block)) {
    throw new Error(`content block has no text: ${JSON.stringify(block)}`);
  }
  const { text } = block;
  if (typeof text !== "string") throw new Error("content text is not a string");
  const payload: unknown = JSON.parse(text);
  if (typeof payload !== "object" || payload === null || !("notes" in payload)) {
    throw new Error(`payload has no notes: ${text}`);
  }
  const { notes } = payload;
  if (!Array.isArray(notes) || notes.length === 0) throw new Error(`no note matched: ${text}`);
  const [note] = notes;
  if (typeof note !== "object" || note === null || !("id" in note) || typeof note.id !== "string") {
    throw new Error(`note has no string id: ${text}`);
  }
  return note.id;
};

/*
 * 書き出しと取り込みは、利用者がデータを失ったときの唯一の復旧経路であり、
 * 取り込みは既存のノート・タスク・画像を丸ごと置き換える。ここが壊れると
 * 「戻せると思っていたのに戻せない」という取り返しのつかない失敗になる。
 *
 * 経路はネイティブのファイルダイアログを通るが、Playwright は main プロセスで
 * 評価できるので、製品コードに試験用の抜け道を作らずに差し替えられる。
 */
describe("backup flow (export and import through the settings screen)", () => {
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
    workDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-backup-"));
    // 画像・バックアップ・設定はDBの隣に置かれるので、これで利用者のデータから隔離される。
    dbFilePath = join(workDir, "hanamask.sqlite3");
    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();
    return window;
  };

  const openSettings = async (window: Page): Promise<void> => {
    await window.getByRole("button", { name: "設定", exact: true }).click();
    await window.getByRole("heading", { name: "データの書き出しと取り込み" }).waitFor();
  };

  it("書き出した書庫から、消したノートを取り込みで戻せる", async () => {
    const window = await startApp();
    const archivePath = join(workDir, "backup.hanamask.zip");

    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "復旧できるノート",
      body: "書き出しと取り込みで往復させる",
      tags: ["backup"],
    });
    await openNoteList(window);
    await noteListOf(window).getByText("復旧できるノート").waitFor();

    // ネイティブの保存ダイアログを、確定した保存先を返すだけのものに差し替える。
    await app?.evaluate(async ({ dialog }, path: string) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, archivePath);

    await openSettings(window);
    await window.getByRole("button", { name: "書き出す" }).click();
    await window.getByText(/に書き出しました/).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "backup-01-exported.png") });

    expect(existsSync(archivePath)).toBe(true);
    expect(statSync(archivePath).size).toBeGreaterThan(0);

    // 書庫を作った後にノートを消す。取り込みで戻ることを確かめるため。
    const found = await callMcpTool(E2E_MCP_PORT, "search_notes", { query: "復旧できる" });
    await callMcpTool(E2E_MCP_PORT, "delete_note", {
      id: readFirstNoteId(found.content),
      confirm: true,
    });
    await openNoteList(window);
    await window.getByText("ノートはまだありません").waitFor();

    await app?.evaluate(async ({ dialog }, path: string) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, archivePath);

    await openSettings(window);
    // 取り込みは確認を挟む。Playwright は既定でダイアログを閉じるので受け入れておく。
    window.on("dialog", (confirmation) => {
      void confirmation.accept();
    });
    await window.getByRole("button", { name: "取り込む" }).click();
    await window.getByText(/取り込みました/).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "backup-02-imported.png") });

    // 退避先が画面に出ていること。誤って取り込んだときの戻り道になる。
    await window.getByText(/に退避しています/).waitFor();

    await openNoteList(window);
    await noteListOf(window).getByText("復旧できるノート").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "backup-03-restored.png") });
  });

  it("取り込みを取り消したら、今のデータは変わらない", async () => {
    const window = await startApp();

    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "消えてはいけないノート",
      body: "取り込みを取り消しても残る",
      tags: [],
    });
    await openNoteList(window);
    await noteListOf(window).getByText("消えてはいけないノート").waitFor();

    // 利用者がファイル選択をやめた場合。
    await app?.evaluate(async ({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });

    await openSettings(window);
    window.on("dialog", (confirmation) => {
      void confirmation.accept();
    });
    await window.getByRole("button", { name: "取り込む" }).click();

    await openNoteList(window);
    await noteListOf(window).getByText("消えてはいけないノート").waitFor();
  });
});
