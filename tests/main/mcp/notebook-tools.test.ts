import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import { createNote } from "../../../src/main/db/notes-repo";
import { getNotebook } from "../../../src/main/db/notebooks-repo";
import { onNotebooksChanged, type EntityChange } from "../../../src/main/mcp/change-emitter";
import { findNotebookTool, notebookTools } from "../../../src/main/mcp/tools/notebooks";

const callTool = async (name: string, args: unknown): Promise<CallToolResult> => {
  const tool = findNotebookTool(name);
  if (tool === undefined) throw new Error(`Tool not found: ${name}`);
  return tool.handler(args);
};

const readJsonPayload = (result: CallToolResult): Record<string, unknown> => {
  const [firstContent] = result.content;
  if (firstContent === undefined || firstContent.type !== "text") {
    throw new Error(`Tool result has no text content: ${JSON.stringify(result)}`);
  }
  const payload: unknown = JSON.parse(firstContent.text);
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Tool payload is not an object");
  }
  return { ...payload };
};

const readField = (result: CallToolResult, key: string): unknown => readJsonPayload(result)[key];

const readNotebookField = (result: CallToolResult, key: string): unknown => {
  const notebook = readField(result, "notebook");
  if (typeof notebook !== "object" || notebook === null) {
    throw new Error(`payload notebook is not an object: ${JSON.stringify(notebook)}`);
  }
  return { ...notebook }[key];
};

const readNotebookId = (result: CallToolResult): string => {
  const id = readNotebookField(result, "id");
  if (typeof id !== "string") throw new Error("notebook id is not a string");
  return id;
};

const readList = (result: CallToolResult, key: string): unknown[] => {
  const value = readField(result, key);
  if (!Array.isArray(value)) throw new Error(`payload ${key} is not an array`);
  return value;
};

const readTitles = (items: unknown[]): string[] =>
  items.map((item) => {
    if (typeof item !== "object" || item === null || !("title" in item)) {
      throw new Error("list item has no title");
    }
    const { title } = item;
    if (typeof title !== "string") throw new Error("list item title is not a string");
    return title;
  });

const createNotebookViaTool = async (title: string, summary = "概要"): Promise<string> =>
  readNotebookId(await callTool("create_notebook", { title, summary }));

const readNotebookIdOfNote = (noteId: string): unknown => {
  const row: unknown = getDb().prepare("SELECT notebook_id FROM notes WHERE id = ?").get(noteId);
  if (typeof row !== "object" || row === null) throw new Error(`Note row missing: ${noteId}`);
  const fields: Record<string, unknown> = { ...row };
  return fields.notebook_id;
};

const putNoteInNotebook = (title: string, notebookId: string): string => {
  const note = createNote({ title, body: "本文", tags: [] });
  getDb().prepare("UPDATE notes SET notebook_id = ? WHERE id = ?").run(notebookId, note.id);
  return note.id;
};

describe("notebook MCPツール", () => {
  let dbFilePath: string;
  let changes: (EntityChange | undefined)[];
  let stopListening: () => void;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-notebook-tools-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
    changes = [];
    stopListening = onNotebooksChanged((change) => {
      changes.push(change);
    });
  });

  afterEach(() => {
    stopListening();
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("6本のツールを公開している", () => {
    expect(notebookTools.map((tool) => tool.definition.name)).toEqual([
      "create_notebook",
      "get_notebook",
      "list_notebooks",
      "update_notebook",
      "delete_notebook",
      "restore_notebook",
    ]);
  });

  it("create_notebook がノート（束）を作り、作成イベントを飛ばす", async () => {
    const result = await callTool("create_notebook", {
      title: "研究",
      summary: "調べたことの束",
      tags: ["t57"],
    });

    const id = readNotebookId(result);
    expect(readNotebookField(result, "summary")).toBe("調べたことの束");
    expect(readNotebookField(result, "tags")).toEqual(["t57"]);
    expect(getNotebook(id)?.title).toBe("研究");
    expect(changes).toEqual([{ entity: "notebook", action: "created", id, title: "研究" }]);
  });

  it("create_notebook はタイトルが文字列でなければ拒否する", async () => {
    const result = await callTool("create_notebook", { title: 1, summary: "x" });

    expect(result.isError).toBe(true);
    expect(changes).toEqual([]);
  });

  it("get_notebook が束と所属ページ一覧を返す", async () => {
    const notebookId = await createNotebookViaTool("研究");
    putNoteInNotebook("所属ページ", notebookId);
    createNote({ title: "無所属ページ", body: "", tags: [] });

    const result = await callTool("get_notebook", { id: notebookId });

    expect(readNotebookField(result, "id")).toBe(notebookId);
    expect(readTitles(readList(result, "notes"))).toEqual(["所属ページ"]);
  });

  it("get_notebook は所属ページの削除済みを除外する", async () => {
    const notebookId = await createNotebookViaTool("研究");
    const deletedNoteId = putNoteInNotebook("消したページ", notebookId);
    putNoteInNotebook("残るページ", notebookId);
    getDb()
      .prepare("UPDATE notes SET deleted_at = ? WHERE id = ?")
      .run(new Date().toISOString(), deletedNoteId);

    const result = await callTool("get_notebook", { id: notebookId });

    expect(readTitles(readList(result, "notes"))).toEqual(["残るページ"]);
  });

  it("get_notebook は存在しないidに null を返し、イベントを飛ばさない", async () => {
    const result = await callTool("get_notebook", { id: randomUUID() });

    expect(readField(result, "notebook")).toBeNull();
    expect(readList(result, "notes")).toEqual([]);
    expect(changes).toEqual([]);
  });

  it("list_notebooks が削除済みを除外し、イベントを飛ばさない", async () => {
    const keptId = await createNotebookViaTool("残る束");
    const deletedId = await createNotebookViaTool("消す束");
    changes = [];
    await callTool("delete_notebook", { id: deletedId, confirm: true });
    changes = [];

    const result = await callTool("list_notebooks", {});

    expect(readList(result, "notebooks").map((item) => readTitles([item])[0])).toEqual(["残る束"]);
    expect(getNotebook(keptId)?.title).toBe("残る束");
    expect(changes).toEqual([]);
  });

  it("update_notebook が省略した項目を据え置き、更新イベントを飛ばす", async () => {
    const id = await createNotebookViaTool("旧題", "旧概要");
    changes = [];

    const result = await callTool("update_notebook", { id, title: "新題" });

    expect(readNotebookField(result, "title")).toBe("新題");
    expect(readNotebookField(result, "summary")).toBe("旧概要");
    expect(changes).toEqual([{ entity: "notebook", action: "updated", id, title: "新題" }]);
  });

  it("update_notebook は存在しないidを拒否する", async () => {
    const result = await callTool("update_notebook", { id: randomUUID(), title: "x" });

    expect(result.isError).toBe(true);
    expect(changes).toEqual([]);
  });

  it("update_notebook は削除済みの束を拒否する", async () => {
    const id = await createNotebookViaTool("消す束");
    await callTool("delete_notebook", { id, confirm: true });
    changes = [];

    const result = await callTool("update_notebook", { id, title: "x" });

    expect(result.isError).toBe(true);
    expect(getNotebook(id)?.title).toBe("消す束");
    expect(changes).toEqual([]);
  });

  it("delete_notebook は confirm が無ければ削除しない", async () => {
    const id = await createNotebookViaTool("守られる束");
    changes = [];

    const result = await callTool("delete_notebook", { id });

    expect(result.isError).toBe(true);
    expect(readList(await callTool("list_notebooks", {}), "notebooks")).toHaveLength(1);
    expect(changes).toEqual([]);
  });

  it("delete_notebook はソフトデリートし、所属ページを消さない", async () => {
    const id = await createNotebookViaTool("消す束");
    const noteId = putNoteInNotebook("所属ページ", id);
    changes = [];

    await callTool("delete_notebook", { id, confirm: true });

    expect(readList(await callTool("list_notebooks", {}), "notebooks")).toEqual([]);
    expect(readField(await callTool("get_notebook", { id }), "notebook")).toBeNull();
    expect(getNotebook(id)?.title).toBe("消す束");
    expect(readNotebookIdOfNote(noteId)).toBe(id);
    expect(changes).toEqual([{ entity: "notebook", action: "deleted", id, title: "消す束" }]);
  });

  it("delete_notebook は削除済み・存在しないidを拒否する", async () => {
    const id = await createNotebookViaTool("消す束");
    await callTool("delete_notebook", { id, confirm: true });
    changes = [];

    const again = await callTool("delete_notebook", { id, confirm: true });
    const unknown = await callTool("delete_notebook", { id: randomUUID(), confirm: true });

    expect(again.isError).toBe(true);
    expect(unknown.isError).toBe(true);
    expect(changes).toEqual([]);
  });

  it("restore_notebook が束を一覧に戻し、更新イベントを飛ばす", async () => {
    const id = await createNotebookViaTool("戻る束");
    const noteId = putNoteInNotebook("所属ページ", id);
    await callTool("delete_notebook", { id, confirm: true });
    changes = [];

    const result = await callTool("restore_notebook", { id });

    expect(readNotebookField(result, "title")).toBe("戻る束");
    expect(readTitles(readList(await callTool("list_notebooks", {}), "notebooks"))).toEqual([
      "戻る束",
    ]);
    expect(readTitles(readList(await callTool("get_notebook", { id }), "notes"))).toEqual([
      "所属ページ",
    ]);
    expect(readNotebookIdOfNote(noteId)).toBe(id);
    expect(changes).toEqual([{ entity: "notebook", action: "updated", id, title: "戻る束" }]);
  });

  it("restore_notebook は削除されていない束を拒否する", async () => {
    const id = await createNotebookViaTool("生きている束");
    changes = [];

    const result = await callTool("restore_notebook", { id });

    expect(result.isError).toBe(true);
    expect(changes).toEqual([]);
  });

  it("引数がオブジェクトでなければエラー結果を返す", async () => {
    const result = await callTool("create_notebook", "title");

    expect(result.isError).toBe(true);
  });
});
