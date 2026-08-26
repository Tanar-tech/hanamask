import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SCREENSHOT_DIR,
  callMcpTool,
  launchApp,
  openNoteList,
  reserveMcpPort,
  type CallToolResult,
} from "./helpers.js";

let E2E_MCP_PORT = 0;

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

const idOf = (payload: Record<string, unknown>, key: string): string => {
  const entity = payload[key];
  if (typeof entity !== "object" || entity === null || !("id" in entity)) {
    throw new Error(`payload has no ${key}.id`);
  }
  const { id } = entity;
  if (typeof id !== "string") throw new Error(`${key}.id is not a string`);
  return id;
};

describe("pin flow (ピン留めのナビ・詳細画面反映)", () => {
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

  it("ピン留めがナビ最上部とノートのMain Viewに反映され、解除で消える", async () => {
    workDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-pin-"));
    app = await launchApp(join(workDir, "hanamask.sqlite3"), E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();

    const notebook = readPayload(
      await callMcpTool(E2E_MCP_PORT, "create_notebook", {
        title: "ローカルLLM組み込み",
        summary: "推論エンジンと埋め込みモデルをアプリに同梱する案件",
        tags: [],
      }),
    );
    const notebookId = idOf(notebook, "notebook");
    await callMcpTool(E2E_MCP_PORT, "create_page", {
      title: "モデル選定の比較",
      body: "Ruri v3 70m を採用。",
      tags: [],
      notebook_id: notebookId,
    });
    await callMcpTool(E2E_MCP_PORT, "create_page", {
      title: "今日の昼食はカレー",
      body: "近所の店で食べた。",
      tags: [],
    });

    await openNoteList(window);
    const nav = window.getByRole("list", { name: "ノート・ページ" });
    await nav.getByRole("button", { name: "今日の昼食はカレー", exact: true }).waitFor();

    // ピンが無い間はセクション自体が出ない。
    const pinnedList = window.getByRole("list", { name: "ピン留め" });
    expect(await pinnedList.count()).toBe(0);

    // ナビ行のトグルで無所属ページをピン留めする。
    await window.getByRole("button", { name: "今日の昼食はカレーをピン留め" }).click();
    await pinnedList.getByRole("button", { name: "今日の昼食はカレー", exact: true }).waitFor();

    // ノートは Main View ヘッダーのボタンでピン留めする。
    await nav.getByRole("button", { name: "ローカルLLM組み込み（ページ1件）" }).click();
    const main = window.getByRole("main");
    await main.getByRole("heading", { name: "ローカルLLM組み込み" }).waitFor();
    await main.getByRole("button", { name: "ピン留め", exact: true }).click();
    await pinnedList
      .getByRole("button", { name: "ローカルLLM組み込み（ページ1件）", exact: true })
      .waitFor();

    // 所属ページをページ詳細のボタンでピン留めすると、Main View の欄が置き換わる。
    const subPane = window.getByRole("list", { name: "ローカルLLM組み込み のページ" });
    await subPane.getByRole("button", { name: /モデル選定の比較/ }).click();
    await main.getByRole("heading", { name: "モデル選定の比較" }).waitFor();
    await main.getByRole("button", { name: "ピン留め", exact: true }).click();
    await main.getByRole("button", { name: "ピン留め解除", exact: true }).waitFor();

    await nav.getByRole("button", { name: "ローカルLLM組み込み（ページ1件）" }).click();
    await main.getByRole("heading", { name: "ピン留めしたページ" }).waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "t60-01-pinned.png") });

    // ピン順（留めた順）で並ぶ: 無所属ページ → ノート → 所属ページ。
    const pinnedTitles = await pinnedList.getByRole("button").allTextContents();
    expect(pinnedTitles[0]).toContain("今日の昼食はカレー");
    expect(pinnedTitles.some((title) => title.includes("ローカルLLM組み込み"))).toBe(true);
    expect(pinnedTitles.some((title) => title.includes("モデル選定の比較"))).toBe(true);

    // ノートのピンを解除するとセクションから消え、ページのピンは残る。
    await main.getByRole("button", { name: "ピン留め解除", exact: true }).click();
    await expect
      .poll(() =>
        pinnedList
          .getByRole("button", { name: "ローカルLLM組み込み（ページ1件）", exact: true })
          .count(),
      )
      .toBe(0);
    await pinnedList.getByRole("button", { name: "今日の昼食はカレー", exact: true }).waitFor();
  });
});
