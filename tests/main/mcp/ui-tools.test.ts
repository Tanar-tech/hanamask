import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNotebook } from "../../../src/main/db/notebooks-repo";
import { findUiTool, uiTools } from "../../../src/main/mcp/tools/ui";
import { setUiNavigator } from "../../../src/main/ui/navigate";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const showWindow = vi.fn();
const navigate = vi.fn();

const callTool = (name: string, args: unknown): CallToolResult => {
  const tool = findUiTool(name);
  if (tool === undefined) throw new Error(`Tool not found: ${name}`);
  const result = tool.handler(args);
  // ここで扱うのは同期ハンドラだけ。非同期のツールは専用のテストで待って確かめる。
  if (result instanceof Promise) throw new Error(`Tool is asynchronous: ${name}`);
  return result;
};

const readJsonPayload = (result: CallToolResult): unknown => {
  const [firstContent] = result.content;
  if (firstContent === undefined || firstContent.type !== "text") {
    throw new Error(`Tool result has no text content: ${JSON.stringify(result)}`);
  }
  return JSON.parse(firstContent.text);
};

describe("mcp ui tools", () => {
  beforeEach(() => {
    showWindow.mockReset();
    navigate.mockReset();
    setUiNavigator({ showWindow, navigate });
  });

  it("5つのUI連携ツール定義を公開する", () => {
    expect(uiTools.map((tool) => tool.definition.name).sort()).toEqual([
      "open_app",
      "open_note",
      "open_notebook",
      "open_search",
      "open_task",
    ]);
    expect(findUiTool("open_app")?.definition.inputSchema.type).toBe("object");
  });

  it("open_appはウィンドウを表示・前面化し画面遷移はしない", () => {
    const result = callTool("open_app", {});

    expect(result.isError).toBeFalsy();
    expect(readJsonPayload(result)).toEqual({ opened: true });
    expect(showWindow).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("open_noteは指定ノートの詳細画面へ遷移させる", () => {
    const result = callTool("open_note", { id: "note-1" });

    expect(result.isError).toBeFalsy();
    expect(readJsonPayload(result)).toEqual({ opened: true });
    expect(navigate).toHaveBeenCalledWith({ kind: "note", id: "note-1" });
  });

  it("open_taskは指定タスクの詳細画面へ遷移させる", () => {
    callTool("open_task", { id: "task-1" });

    expect(navigate).toHaveBeenCalledWith({ kind: "task", id: "task-1" });
  });

  it("open_searchは検索結果画面へ遷移させる", () => {
    callTool("open_search", { query: "設計" });

    expect(navigate).toHaveBeenCalledWith({ kind: "search", query: "設計" });
  });

  it("open_searchは空文字のクエリも受け付ける", () => {
    const result = callTool("open_search", { query: "" });

    expect(result.isError).toBeFalsy();
    expect(navigate).toHaveBeenCalledWith({ kind: "search", query: "" });
  });

  it("open_noteはidが無ければエラー結果を返し遷移しない", () => {
    const result = callTool("open_note", {});

    expect(result.isError).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("open_taskはidが文字列でなければエラー結果を返す", () => {
    const result = callTool("open_task", { id: 42 });

    expect(result.isError).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("open_searchはqueryが無ければエラー結果を返す", () => {
    const result = callTool("open_search", {});

    expect(result.isError).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("引数がオブジェクトでなければエラー結果を返す", () => {
    expect(callTool("open_app", null).isError).toBe(true);
    expect(showWindow).not.toHaveBeenCalled();
  });

  describe("open_notebook", () => {
    let dbFilePath: string;

    beforeEach(() => {
      dbFilePath = join(tmpdir(), `hanamask-ui-tools-test-${randomUUID()}.sqlite3`);
      openDb(dbFilePath);
    });

    afterEach(() => {
      closeDb();
      rmSync(dbFilePath, { force: true });
    });

    it("指定ノートの画面へ遷移させる", () => {
      const notebook = createNotebook({ title: "案件A", summary: "概要", tags: [] });

      const result = callTool("open_notebook", { id: notebook.id });

      expect(result.isError).toBeFalsy();
      expect(readJsonPayload(result)).toEqual({ opened: true });
      expect(navigate).toHaveBeenCalledWith({ kind: "notebook", id: notebook.id });
    });

    it("存在しないノートはエラー結果を返し遷移しない", () => {
      const result = callTool("open_notebook", { id: "missing" });

      expect(result.isError).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
    });

    it("idが無ければエラー結果を返す", () => {
      expect(callTool("open_notebook", {}).isError).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it("ナビゲーターが未注入ならクラッシュせずエラー結果を返す", async () => {
    vi.resetModules();
    const freshTools = await import("../../../src/main/mcp/tools/ui");
    const openApp = freshTools.findUiTool("open_app");
    if (openApp === undefined) throw new Error("open_app tool not found");

    expect((await openApp.handler({})).isError).toBe(true);
  });
});
