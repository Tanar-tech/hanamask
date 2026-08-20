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

// A 1x1 transparent PNG, small enough to embed and still pass the MIME/magic-byte checks.
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("note detail flow (edit / mermaid / image attachment)", () => {
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
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-detail-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");
    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();
    // The app opens on the home screen; these tests operate on the note list itself.
    await openNoteList(window);
    return window;
  };

  it("saves title and body edits made in the detail view and reflects them in the list", async () => {
    const window = await startApp();
    await window.getByText("ページはまだありません").waitFor();

    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "編集前タイトル",
      body: "編集前の本文",
      tags: ["before"],
    });
    await noteListOf(window).getByRole("button", { name: "編集前タイトル" }).waitFor();

    await openNoteDetail(window, "編集前タイトル");
    await window.getByRole("button", { name: "編集" }).click();

    await window.getByLabel("タイトル").fill("編集後タイトル");
    await window.getByLabel("本文").fill("編集後の本文");
    await window.getByLabel("タグ").fill("after, e2e");
    await window.screenshot({ path: join(SCREENSHOT_DIR, "detail-01-editing.png") });

    await window.getByRole("button", { name: "保存" }).click();

    // Back in view mode: the edit form's inputs are gone and the new content is shown.
    await window.getByRole("heading", { name: "編集後タイトル" }).waitFor();
    await expect.poll(() => window.getByLabel("タイトル").count()).toBe(0);
    await window.getByText("編集後の本文").waitFor();
    await window.getByText("after", { exact: true }).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "detail-02-saved.png") });

    await window.getByRole("button", { name: "戻る" }).click();
    await noteListOf(window).getByRole("button", { name: "編集後タイトル" }).waitFor();
    await expect
      .poll(() => noteListOf(window).getByRole("button", { name: "編集前タイトル" }).count())
      .toBe(0);
    await window.screenshot({ path: join(SCREENSHOT_DIR, "detail-03-list-updated.png") });
  });

  it("renders a mermaid code fence as an SVG and shows an error instead of crashing on bad syntax", async () => {
    const window = await startApp();
    await window.getByText("ページはまだありません").waitFor();

    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "Mermaid正常ノート",
      body: "図の説明\n\n```mermaid\ngraph TD; A-->B;\n```",
      tags: [],
    });
    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "Mermaid異常ノート",
      body: "```mermaid\nthis is not a diagram (((\n```",
      tags: [],
    });
    await noteListOf(window).getByRole("button", { name: "Mermaid正常ノート" }).waitFor();

    await openNoteDetail(window, "Mermaid正常ノート");
    const diagram = window.locator("article figure svg");
    await diagram.waitFor();
    expect(await diagram.count()).toBe(1);
    await window.getByText("図の説明").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "detail-04-mermaid.png") });

    await window.getByRole("button", { name: "戻る" }).click();
    await openNoteDetail(window, "Mermaid異常ノート");
    await window.getByRole("alert").filter({ hasText: "図の描画に失敗しました" }).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "detail-05-mermaid-error.png") });

    // The window is still alive and usable after the failed render.
    await window.getByRole("button", { name: "戻る" }).click();
    await noteListOf(window).getByRole("button", { name: "Mermaid正常ノート" }).waitFor();
  });

  it("shows a preview for an image attached through the attach_image MCP tool", async () => {
    const window = await startApp();
    await window.getByText("ページはまだありません").waitFor();

    const noteId = await createNoteViaMcp(E2E_MCP_PORT, {
      title: "画像添付ノート",
      body: "MCP経由で添付した画像がプレビュー表示されることを確認する",
      tags: [],
    });
    await noteListOf(window).getByRole("button", { name: "画像添付ノート" }).waitFor();

    // attach_image emits no change notification, so attach before opening the detail view.
    await callMcpTool(E2E_MCP_PORT, "attach_image", {
      note_id: noteId,
      file_name: "pixel.png",
      data_base64: ONE_PIXEL_PNG_BASE64,
      mime_type: "image/png",
    });

    await openNoteDetail(window, "画像添付ノート");
    const preview = window.locator("article img");
    await preview.waitFor();
    expect(await preview.count()).toBe(1);
    expect(await preview.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
    await window.screenshot({ path: join(SCREENSHOT_DIR, "detail-06-image-attached.png") });
  });
});
