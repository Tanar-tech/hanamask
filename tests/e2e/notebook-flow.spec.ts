import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication } from "playwright";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callMcpTool, launchApp, reserveMcpPort, type CallToolResult } from "./helpers.js";

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

const modelsDirPath = (): string =>
  process.env.HANAMASK_MODELS_DIR ?? join(import.meta.dirname, "../../resources/models");

const hasEmbeddingModel = (): boolean => {
  const dir = modelsDirPath();
  if (!existsSync(join(dir, "embedding.json"))) return false;
  return readdirSync(dir).some((name) => name.endsWith(".gguf"));
};

const INDEX_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe("notebook flow (MCP tools for notebooks and pages)", () => {
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

  it("ノートを作り、ページを束ね、意味検索でノートが引ける", async () => {
    workDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-notebook-"));
    app = await launchApp(join(workDir, "hanamask.sqlite3"), E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();

    const notebook = readPayload(
      await callMcpTool(E2E_MCP_PORT, "create_notebook", {
        title: "ローカルLLM組み込み",
        summary: "推論エンジンと埋め込みモデルをアプリに同梱し、意味検索を提供する案件",
        tags: ["ローカルLLM"],
      }),
    );
    const notebookId = idOf(notebook, "notebook");

    const attached = readPayload(
      await callMcpTool(E2E_MCP_PORT, "create_page", {
        title: "モデル選定の比較",
        body: "Ruri v3 70m を採用。Apache-2.0 で日本語品質が高い。",
        tags: [],
        notebook_id: notebookId,
      }),
    );
    const attachedId = idOf(attached, "note");

    const loose = readPayload(
      await callMcpTool(E2E_MCP_PORT, "create_page", {
        title: "今日の昼食はカレー",
        body: "近所の店で食べた。",
        tags: [],
      }),
    );
    const looseId = idOf(loose, "note");

    // move_page: 無所属 → ノート
    readPayload(
      await callMcpTool(E2E_MCP_PORT, "move_page", { id: looseId, notebook_id: notebookId }),
    );
    let detail = readPayload(await callMcpTool(E2E_MCP_PORT, "get_notebook", { id: notebookId }));
    let notes = detail.notes;
    if (!Array.isArray(notes)) throw new Error("get_notebook returned no notes array");
    expect(notes).toHaveLength(2);

    // move_page: ノート → 無所属
    readPayload(await callMcpTool(E2E_MCP_PORT, "move_page", { id: looseId, notebook_id: null }));
    detail = readPayload(await callMcpTool(E2E_MCP_PORT, "get_notebook", { id: notebookId }));
    notes = detail.notes;
    if (!Array.isArray(notes)) throw new Error("get_notebook returned no notes array");
    expect(notes).toHaveLength(1);
    expect(idOf({ note: notes[0] }, "note")).toBe(attachedId);

  });

  it.skipIf(!hasEmbeddingModel())("意味検索でノート（束）が引ける", async () => {
    workDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-notebook-sem-"));
    app = await launchApp(join(workDir, "hanamask.sqlite3"), E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();

    readPayload(
      await callMcpTool(E2E_MCP_PORT, "create_notebook", {
        title: "ローカルLLM組み込み",
        summary: "推論エンジンと埋め込みモデルをアプリに同梱し、意味検索を提供する案件",
        tags: ["ローカルLLM"],
      }),
    );

    const deadline = Date.now() + INDEX_TIMEOUT_MS;
    let notebookTitles: string[] = [];
    while (Date.now() < deadline) {
      const found = readPayload(
        await callMcpTool(E2E_MCP_PORT, "semantic_search_notes", {
          query: "アプリに同梱するAIモデルの話",
        }),
      );
      const notebooks = found.notebooks;
      if (Array.isArray(notebooks)) {
        notebookTitles = notebooks.map((entry: unknown) => {
          if (typeof entry !== "object" || entry === null || !("title" in entry)) return "";
          const { title } = entry;
          return typeof title === "string" ? title : "";
        });
        if (notebookTitles.length > 0) break;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    expect(notebookTitles).toContain("ローカルLLM組み込み");
  });
});
