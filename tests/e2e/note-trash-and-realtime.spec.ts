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
  noteListOf,
  openNoteDetail,
  openNoteList,
  reserveMcpPort,
} from "./helpers.js";

// ポートは実行時にOSから空きを取る（固定するとE2Eの同時実行で衝突する）。
let E2E_MCP_PORT = 0;

describe("note trash and realtime reflection (UI delete/restore, MCP update while open)", () => {
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

  const startApp = async (): Promise<Page> => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-trash-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");
    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    // NoteList guards deletion with window.confirm, which Playwright dismisses unless handled.
    // Registered before the first load so the handler can never lose a race with a dialog.
    window.on("dialog", (dialog) => {
      void dialog.accept();
    });
    await window.waitForLoadState();
    // The app opens on the home screen; these tests operate on the note list itself.
    await openNoteList(window);
    return window;
  };

  it("deletes a note from the list into the trash view and brings it back on restore", async () => {
    const window = await startApp();
    await window.getByText("ページはまだありません").waitFor();

    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "ゴミ箱往復ノート",
      body: "UI操作での削除と復元を確認する",
      tags: [],
    });
    await noteListOf(window).getByRole("button", { name: "ゴミ箱往復ノート" }).waitFor();

    await noteListOf(window).getByRole("button", { name: "削除" }).click();
    await window.getByText("ページはまだありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "trash-01-deleted-from-list.png") });

    await window.getByRole("button", { name: "ゴミ箱" }).click();
    await window.getByRole("heading", { name: "ゴミ箱" }).waitFor();
    await window.getByText("ゴミ箱往復ノート").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "trash-02-in-trash.png") });

    await window.getByRole("button", { name: "復元" }).click();
    await window.getByText("削除済みのページ・タスク・ノートはありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "trash-03-restored.png") });

    await window.getByRole("button", { name: "戻る" }).click();
    await noteListOf(window).getByRole("button", { name: "ゴミ箱往復ノート" }).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "trash-04-back-in-list.png") });
  });

  it("refreshes the open detail view when update_note changes title, body and tags", async () => {
    const window = await startApp();
    await window.getByText("ページはまだありません").waitFor();

    const noteId = await createNoteViaMcp(E2E_MCP_PORT, {
      title: "反映前タイトル",
      body: "反映前の本文",
      tags: ["before"],
    });
    await noteListOf(window).getByRole("button", { name: "反映前タイトル" }).waitFor();
    await openNoteDetail(window, "反映前タイトル");

    await callMcpTool(E2E_MCP_PORT, "update_note", {
      id: noteId,
      title: "反映後タイトル",
      body: "反映後の本文",
      tags: ["after"],
    });

    // No manual reload and no navigation: the detail view re-fetches on the change notification.
    await window.getByRole("heading", { name: "反映後タイトル" }).waitFor();
    await window.getByText("反映後の本文").waitFor();
    await window.getByText("after", { exact: true }).waitFor();
    await expect.poll(() => window.getByText("反映前の本文").count()).toBe(0);
    await expect.poll(() => window.getByText("before", { exact: true }).count()).toBe(0);
    await window.screenshot({ path: join(SCREENSHOT_DIR, "trash-05-detail-updated.png") });
  });

  it("keeps the draft and shows a notice when update_note arrives while editing", async () => {
    const window = await startApp();
    await window.getByText("ページはまだありません").waitFor();

    const noteId = await createNoteViaMcp(E2E_MCP_PORT, {
      title: "編集中ノート",
      body: "編集中に外部更新されるノート",
      tags: ["before"],
    });
    await noteListOf(window).getByRole("button", { name: "編集中ノート" }).waitFor();
    await openNoteDetail(window, "編集中ノート");

    await window.getByRole("button", { name: "編集" }).click();
    await window.getByLabel("タイトル").fill("編集中のタイトル");
    await window.getByLabel("本文").fill("編集中の本文");
    await window.getByLabel("タグ").fill("draft");

    await callMcpTool(E2E_MCP_PORT, "update_note", {
      id: noteId,
      title: "外部更新タイトル",
      body: "外部更新の本文",
      tags: ["after"],
    });

    await window
      .getByRole("status")
      .filter({ hasText: "このノートは別の場所で更新されました" })
      .waitFor();
    await expect.poll(() => window.getByLabel("タイトル").inputValue()).toBe("編集中のタイトル");
    await expect.poll(() => window.getByLabel("本文").inputValue()).toBe("編集中の本文");
    await expect.poll(() => window.getByLabel("タグ").inputValue()).toBe("draft");
    await window.screenshot({ path: join(SCREENSHOT_DIR, "trash-06-external-update-notice.png") });

    // Discarding the draft is what pulls the external update into the view.
    await window.getByRole("button", { name: "破棄して最新を読み込む" }).click();
    await window.getByRole("heading", { name: "外部更新タイトル" }).waitFor();
    await window.getByText("外部更新の本文").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "trash-07-discarded.png") });
  });
});
