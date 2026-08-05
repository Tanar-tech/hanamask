import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type CallToolResult = Awaited<ReturnType<Client["callTool"]>>;

// A fixed, non-default port that also differs from the ones note-flow.spec.ts (39299),
// task-flow.spec.ts (39298) and note-detail-flow.spec.ts (39297) use.
const E2E_MCP_PORT = 39296;
const SCREENSHOT_DIR = join(import.meta.dirname, ".artifacts");

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

describe("note trash and realtime reflection (UI delete/restore, MCP update while open)", () => {
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
    const tmpDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-trash-"));
    dbFilePath = join(tmpDir, "hanamask.sqlite3");
    app = await launchApp(dbFilePath);
    const window = await app.firstWindow();
    // NoteList guards deletion with window.confirm, which Playwright dismisses unless handled.
    // Registered before the first load so the handler can never lose a race with a dialog.
    window.on("dialog", (dialog) => {
      void dialog.accept();
    });
    await window.waitForLoadState();
    return window;
  };

  it("deletes a note from the list into the trash view and brings it back on restore", async () => {
    const window = await startApp();
    await window.getByText("ノートはまだありません").waitFor();

    await createNoteViaMcp({
      title: "ゴミ箱往復ノート",
      body: "UI操作での削除と復元を確認する",
      tags: [],
    });
    await noteListOf(window).getByRole("button", { name: "ゴミ箱往復ノート" }).waitFor();

    await noteListOf(window).getByRole("button", { name: "削除" }).click();
    await window.getByText("ノートはまだありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "trash-01-deleted-from-list.png") });

    await window.getByRole("button", { name: "ゴミ箱" }).click();
    await window.getByRole("heading", { name: "ゴミ箱" }).waitFor();
    await window.getByText("ゴミ箱往復ノート").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "trash-02-in-trash.png") });

    await window.getByRole("button", { name: "復元" }).click();
    await window.getByText("削除済みのノートはありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "trash-03-restored.png") });

    await window.getByRole("button", { name: "戻る" }).click();
    await noteListOf(window).getByRole("button", { name: "ゴミ箱往復ノート" }).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "trash-04-back-in-list.png") });
  });

  it("refreshes the open detail view when update_note changes title, body and tags", async () => {
    const window = await startApp();
    await window.getByText("ノートはまだありません").waitFor();

    const noteId = await createNoteViaMcp({
      title: "反映前タイトル",
      body: "反映前の本文",
      tags: ["before"],
    });
    await noteListOf(window).getByRole("button", { name: "反映前タイトル" }).waitFor();
    await openNoteDetail(window, "反映前タイトル");

    await callMcpTool("update_note", {
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
    await window.getByText("ノートはまだありません").waitFor();

    const noteId = await createNoteViaMcp({
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

    await callMcpTool("update_note", {
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
