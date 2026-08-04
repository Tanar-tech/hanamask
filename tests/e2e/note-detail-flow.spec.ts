import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type CallToolResult = Awaited<ReturnType<Client["callTool"]>>;

// A fixed, non-default port that also differs from the ones note-flow.spec.ts (39299) and
// task-flow.spec.ts (39298) use, so the specs cannot collide even if run in parallel.
const E2E_MCP_PORT = 39297;
const SCREENSHOT_DIR = join(import.meta.dirname, ".artifacts");

// A 1x1 transparent PNG, small enough to embed and still pass the MIME/magic-byte checks.
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// VITE_DEV_SERVER_URL must not be forwarded: its presence tells src/main/index.ts to load
// the Vite dev server instead of the built dist/renderer/index.html this test relies on.
const buildLaunchEnv = (dbFilePath: string): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "VITE_DEV_SERVER_URL") env[key] = value;
  }
  env.HANAMASK_DB_PATH = dbFilePath;
  env.HANAMASK_MCP_PORT = String(E2E_MCP_PORT);
  return env;
};

const launchApp = (dbFilePath: string): Promise<ElectronApplication> =>
  electron.launch({ args: ["."], env: buildLaunchEnv(dbFilePath) });

const callMcpTool = async (name: string, args: Record<string, unknown>): Promise<CallToolResult> => {
  const client = new Client({ name: "hanamask-e2e", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${E2E_MCP_PORT}/mcp`),
  );
  await client.connect(transport);
  try {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError === true) {
      throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
    }
    return result;
  } finally {
    await client.close();
  }
};

const readNoteId = (result: CallToolResult): string => {
  if (!("content" in result) || !Array.isArray(result.content)) {
    throw new Error(`Tool result has no content array: ${JSON.stringify(result)}`);
  }
  const [firstContent] = result.content;
  if (firstContent === undefined || firstContent.type !== "text") {
    throw new Error(`Tool result has no text content: ${JSON.stringify(result)}`);
  }
  const payload: unknown = JSON.parse(firstContent.text);
  if (typeof payload !== "object" || payload === null || !("note" in payload)) {
    throw new Error("payload has no note");
  }
  const { note } = payload;
  if (typeof note !== "object" || note === null || !("id" in note)) {
    throw new Error("note has no id");
  }
  const { id } = note;
  if (typeof id !== "string") throw new Error("note id is not a string");
  return id;
};

const createNoteViaMcp = async (input: {
  title: string;
  body: string;
  tags: string[];
}): Promise<string> => readNoteId(await callMcpTool("create_note", input));

// NoteList and TaskList both render their entries as a <ul> directly under <main>, so scope
// note locators to the first one to keep them unambiguous under Playwright's strict mode.
const noteListOf = (window: Page) => window.locator("main > ul").first();

const openNoteDetail = async (window: Page, title: string): Promise<void> => {
  await noteListOf(window).getByRole("button", { name: title }).click();
  await window.getByRole("heading", { name: title }).waitFor();
};

describe("note detail flow (edit / mermaid / image attachment)", () => {
  let dbFilePath: string;
  let app: ElectronApplication | undefined;

  beforeAll(() => {
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
    app = await launchApp(dbFilePath);
    const window = await app.firstWindow();
    await window.waitForLoadState();
    return window;
  };

  it("saves title and body edits made in the detail view and reflects them in the list", async () => {
    const window = await startApp();
    await window.getByText("ノートはまだありません").waitFor();

    await createNoteViaMcp({
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
    await window.getByText("ノートはまだありません").waitFor();

    await createNoteViaMcp({
      title: "Mermaid正常ノート",
      body: "図の説明\n\n```mermaid\ngraph TD; A-->B;\n```",
      tags: [],
    });
    await createNoteViaMcp({
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
    await window.getByText("ノートはまだありません").waitFor();

    const noteId = await createNoteViaMcp({
      title: "画像添付ノート",
      body: "MCP経由で添付した画像がプレビュー表示されることを確認する",
      tags: [],
    });
    await noteListOf(window).getByRole("button", { name: "画像添付ノート" }).waitFor();

    // attach_image emits no change notification, so attach before opening the detail view.
    await callMcpTool("attach_image", {
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
