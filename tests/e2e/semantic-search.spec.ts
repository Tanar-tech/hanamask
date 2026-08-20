import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication } from "playwright";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  callMcpTool,
  createNoteViaMcp,
  launchApp,
  openNoteDetail,
  openNoteList,
  reserveMcpPort,
  SCREENSHOT_DIR,
  type CallToolResult,
} from "./helpers.js";

// ポートは実行時にOSから空きを取る（固定するとE2Eの同時実行で衝突する）。
let E2E_MCP_PORT = 0;

const MANIFEST_FILE_NAME = "embedding.json";
const GGUF_EXTENSION = ".gguf";
const INDEX_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1000;

const NEAR_TITLE = "WSLからWindowsのMCPサーバーへ接続する手順";
const FAR_TITLE = "今日の昼食はカレー";
const QUERY = "Windows側への接続でハマった話";
const SEARCH_FIELD_LABEL = "ノートとタスクを検索";
const SEMANTIC_LIST_LABEL = "意味が近い記録";
const RELATED_LIST_LABEL = "関連するノート";
const LOADING_MESSAGE = "準備中です";

const modelsDirPath = (): string =>
  process.env.HANAMASK_MODELS_DIR ?? join(import.meta.dirname, "../../resources/models");

// モデルはインストーラー同梱物で、リポジトリには入っていない。取得していない環境では飛ばす。
const hasEmbeddingModel = (): boolean => {
  const dir = modelsDirPath();
  if (!existsSync(join(dir, MANIFEST_FILE_NAME))) return false;
  return readdirSync(dir).some((name) => name.endsWith(GGUF_EXTENSION));
};

const readPayload = (result: CallToolResult): Record<string, unknown> => {
  if (!("content" in result) || !Array.isArray(result.content)) {
    throw new Error("tool result has no content array");
  }
  const [first] = result.content;
  if (first === undefined || first.type !== "text") throw new Error("tool result has no text");
  const parsed: unknown = JSON.parse(first.text);
  if (typeof parsed !== "object" || parsed === null) throw new Error("payload is not an object");
  return { ...parsed };
};

const titlesOf = (payload: Record<string, unknown>): string[] => {
  const { notes } = payload;
  if (!Array.isArray(notes)) throw new Error("payload has no notes array");
  return notes.map((note: unknown) => {
    if (typeof note !== "object" || note === null || !("title" in note)) {
      throw new Error("note has no title");
    }
    const { title } = note;
    return typeof title === "string" ? title : "";
  });
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/*
 * 索引はノート作成の数秒後に裏で付く。付くまでは結果が空なので、
 * 「近い方が先に返る」を確かめる前に索引が揃うまで待つ。
 */
const waitForIndexedTitles = async (expectedCount: number): Promise<string[]> => {
  const deadline = Date.now() + INDEX_TIMEOUT_MS;
  let titles: string[] = [];
  while (Date.now() < deadline) {
    titles = titlesOf(readPayload(await callMcpTool(E2E_MCP_PORT, "semantic_search_notes", {
      query: QUERY,
    })));
    if (titles.length >= expectedCount) return titles;
    await sleep(POLL_INTERVAL_MS);
  }
  return titles;
};

describe.skipIf(!hasEmbeddingModel())("semantic search (find notes by meaning)", () => {
  let workDir: string;
  let app: ElectronApplication | undefined;

  beforeAll(async () => {
    E2E_MCP_PORT = await reserveMcpPort();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (workDir !== undefined) rmSync(workDir, { recursive: true, force: true });
  });

  it("言葉が一致しなくても、意味の近いノートが先に返る", async () => {
    workDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-semantic-"));
    app = await launchApp(join(workDir, "hanamask.sqlite3"), E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();

    await createNoteViaMcp(E2E_MCP_PORT, {
      title: NEAR_TITLE,
      body: "WSL2から見たWindows側のホストアドレスと、ファイアウォールの穴あけについて",
      tags: [],
    });
    await createNoteViaMcp(E2E_MCP_PORT, {
      title: FAR_TITLE,
      body: "近所の店で食べた。辛口を選んだが甘かった。",
      tags: [],
    });

    // モデルの読み込み中（起動直後の数秒）に詳細を開くと「準備中です」が出る。
    // 間に合うかは環境次第なので、見えたときだけ撮る（受け入れ条件の確認は下の2枚）。
    await openNoteList(window);
    await openNoteDetail(window, NEAR_TITLE);
    if (await window.getByText(LOADING_MESSAGE).isVisible()) {
      await window.screenshot({ path: join(SCREENSHOT_DIR, "semantic-03-loading.png") });
    }

    const titles = await waitForIndexedTitles(2);

    expect(titles).toContain(NEAR_TITLE);
    expect(titles[0]).toBe(NEAR_TITLE);

    // 画面側: 検索結果の「意味が近い記録」欄に近いノートが出る
    await window.getByRole("button", { name: "戻る" }).click();
    await window.getByRole("button", { name: "ホーム", exact: true }).click();
    await window.getByLabel(SEARCH_FIELD_LABEL).fill(QUERY);
    await window.getByRole("button", { name: "検索", exact: true }).click();
    const semanticList = window.getByRole("list", { name: SEMANTIC_LIST_LABEL });
    await semanticList.getByText(NEAR_TITLE).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "semantic-01-search-results.png") });

    // 画面側: ノート詳細の「関連するノート」欄に、自分以外の近いノートが出る
    await window.getByRole("button", { name: "戻る" }).click();
    await openNoteList(window);
    await openNoteDetail(window, NEAR_TITLE);
    const relatedList = window.getByRole("list", { name: RELATED_LIST_LABEL });
    await relatedList.getByText(FAR_TITLE).waitFor();
    await expect.poll(() => relatedList.getByText(NEAR_TITLE).count()).toBe(0);
    await window.screenshot({ path: join(SCREENSHOT_DIR, "semantic-02-note-detail-related.png") });
  });
});
