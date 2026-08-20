import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote } from "../../../src/main/db/notes-repo";
import { createTask } from "../../../src/main/db/tasks-repo";
import { createNotebook } from "../../../src/main/db/notebooks-repo";
import { listLinks } from "../../../src/main/db/links-repo";
import {
  onLinksChanged,
  onNotesChanged,
  onTasksChanged,
} from "../../../src/main/mcp/change-emitter";
import { findLinkTool, linkTools } from "../../../src/main/mcp/tools";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const callTool = (name: string, args: unknown): CallToolResult => {
  const tool = findLinkTool(name);
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

const linkThroughTool = (args: Record<string, unknown>): string => {
  const payload = readJsonPayload(callTool("link_entities", args));
  if (typeof payload !== "object" || payload === null || !("link" in payload)) {
    throw new Error("link_entities payload has no link");
  }
  const { link } = payload;
  if (typeof link !== "object" || link === null || !("id" in link)) {
    throw new Error("link_entities payload link has no id");
  }
  const { id } = link;
  if (typeof id !== "string") throw new Error("link_entities returned a non-string id");
  return id;
};

describe("mcp link tools", () => {
  let dbFilePath: string;
  // リンクは両端の存在を確かめてから張られるので、実在するノート・タスクを用意する。
  let noteId: string;
  let taskId: string;
  let notebookId: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-link-mcp-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
    noteId = createNote({ title: "n1", body: "b1", tags: [] }).id;
    taskId = createTask({ title: "t1", status: "todo", dueDate: null }).id;
    notebookId = createNotebook({ title: "nb1", summary: "", tags: [] }).id;
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("3つのリンクツール定義を公開する", () => {
    expect(linkTools.map((tool) => tool.definition.name).sort()).toEqual([
      "link_entities",
      "list_links",
      "unlink_entities",
    ]);
    expect(findLinkTool("link_entities")?.definition.inputSchema.type).toBe("object");
    expect(
      Object.keys(findLinkTool("link_entities")?.definition.inputSchema.properties ?? {}).sort(),
    ).toEqual(["from_id", "from_type", "to_id", "to_type"]);
  });

  it("link_entitiesで作成したリンクが永続化される", () => {
    const id = linkThroughTool({
      from_type: "note",
      from_id: noteId,
      to_type: "task",
      to_id: taskId,
    });

    expect(listLinks("note", noteId)).toEqual([
      { id, fromType: "note", fromId: noteId, toType: "task", toId: taskId },
    ]);
  });

  it("不正なfrom_type/to_typeのlink_entitiesはエラーを返す", () => {
    const badFrom = callTool("link_entities", {
      from_type: "project",
      from_id: "a",
      to_type: "task",
      to_id: "b",
    });
    const badTo = callTool("link_entities", {
      from_type: "note",
      from_id: "a",
      to_type: "",
      to_id: "b",
    });

    expect(badFrom.isError).toBe(true);
    expect(badTo.isError).toBe(true);
    expect(listLinks("note", "a")).toEqual([]);
  });

  it("必須引数を欠いたlink_entitiesはエラーを返す", () => {
    expect(callTool("link_entities", { from_type: "note", from_id: "a" }).isError).toBe(true);
    expect(
      callTool("link_entities", { from_type: "note", from_id: 42, to_type: "task", to_id: "b" })
        .isError,
    ).toBe(true);
  });

  it("リンク作成はノート・タスクの変更通知を出さない", () => {
    const notesListener = vi.fn();
    const tasksListener = vi.fn();
    const unsubscribeNotes = onNotesChanged(notesListener);
    const unsubscribeTasks = onTasksChanged(tasksListener);

    linkThroughTool({ from_type: "note", from_id: noteId, to_type: "task", to_id: taskId });

    expect(notesListener).not.toHaveBeenCalled();
    expect(tasksListener).not.toHaveBeenCalled();

    unsubscribeNotes();
    unsubscribeTasks();
  });

  it("link_entitiesの成功時はリンクの変更通知を出す", () => {
    const linksListener = vi.fn();
    const unsubscribe = onLinksChanged(linksListener);

    linkThroughTool({ from_type: "note", from_id: noteId, to_type: "task", to_id: taskId });

    expect(linksListener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("link_entitiesの失敗時はリンクの変更通知を出さない", () => {
    const linksListener = vi.fn();
    const unsubscribe = onLinksChanged(linksListener);

    expect(callTool("link_entities", { from_type: "note", from_id: noteId }).isError).toBe(true);
    expect(linksListener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("unlink_entitiesの成功時はリンクの変更通知を出す", () => {
    const id = linkThroughTool({
      from_type: "note",
      from_id: noteId,
      to_type: "task",
      to_id: taskId,
    });
    const linksListener = vi.fn();
    const unsubscribe = onLinksChanged(linksListener);

    callTool("unlink_entities", { id });

    expect(linksListener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("存在しないリンクのunlink_entitiesはリンクの変更通知を出さない", () => {
    const linksListener = vi.fn();
    const unsubscribe = onLinksChanged(linksListener);

    expect(callTool("unlink_entities", { id: randomUUID() }).isError).toBe(true);
    expect(linksListener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("list_linksは変更通知を出さない", () => {
    const linksListener = vi.fn();
    const unsubscribe = onLinksChanged(linksListener);

    callTool("list_links", { entity_type: "note", entity_id: noteId });

    expect(linksListener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("list_linksはfrom側・to側どちらからでもリンクを返す", () => {
    const id = linkThroughTool({
      from_type: "note",
      from_id: noteId,
      to_type: "task",
      to_id: taskId,
    });
    const expected = {
      links: [{ id, fromType: "note", fromId: noteId, toType: "task", toId: taskId }],
    };

    expect(readJsonPayload(callTool("list_links", { entity_type: "note", entity_id: noteId })))
      .toEqual(expected);
    expect(readJsonPayload(callTool("list_links", { entity_type: "task", entity_id: taskId })))
      .toEqual(expected);
  });

  it("リンクが無いエンティティのlist_linksは空配列を返す", () => {
    const result = callTool("list_links", { entity_type: "note", entity_id: randomUUID() });

    expect(result.isError).toBeFalsy();
    expect(readJsonPayload(result)).toEqual({ links: [] });
  });

  it("不正なentity_typeのlist_linksはエラーを返す", () => {
    expect(callTool("list_links", { entity_type: "project", entity_id: "a" }).isError).toBe(true);
    expect(callTool("list_links", { entity_id: "a" }).isError).toBe(true);
  });

  it("unlink_entitiesはリンクを削除する", () => {
    const id = linkThroughTool({
      from_type: "note",
      from_id: noteId,
      to_type: "task",
      to_id: taskId,
    });

    const result = callTool("unlink_entities", { id });

    expect(result.isError).toBeFalsy();
    expect(readJsonPayload(result)).toEqual({ deleted: true });
    expect(listLinks("note", noteId)).toEqual([]);
  });

  it("存在しないリンクのunlink_entitiesはエラーを返す", () => {
    expect(callTool("unlink_entities", { id: randomUUID() }).isError).toBe(true);
    expect(callTool("unlink_entities", {}).isError).toBe(true);
  });

  it("link_entitiesはノート（束）を端点にできる", () => {
    const id = linkThroughTool({
      from_type: "notebook",
      from_id: notebookId,
      to_type: "task",
      to_id: taskId,
    });

    expect(listLinks("notebook", notebookId)).toEqual([
      { id, fromType: "notebook", fromId: notebookId, toType: "task", toId: taskId },
    ]);
  });

  it("list_linksはノート（束）のリンクを返す", () => {
    const id = linkThroughTool({
      from_type: "note",
      from_id: noteId,
      to_type: "notebook",
      to_id: notebookId,
    });

    expect(
      readJsonPayload(callTool("list_links", { entity_type: "notebook", entity_id: notebookId })),
    ).toEqual({
      links: [{ id, fromType: "note", fromId: noteId, toType: "notebook", toId: notebookId }],
    });
  });

  it("存在しないノート（束）idのlink_entitiesはエラーを返す", () => {
    const result = callTool("link_entities", {
      from_type: "notebook",
      from_id: randomUUID(),
      to_type: "task",
      to_id: taskId,
    });

    expect(result.isError).toBe(true);
    expect(listLinks("task", taskId)).toEqual([]);
  });

  it("DBクローズ後の呼び出しはクラッシュせずMCPエラーを返す", () => {
    closeDb();

    const result = callTool("list_links", { entity_type: "note", entity_id: noteId });

    expect(result.isError).toBe(true);
    const [firstContent] = result.content;
    expect(firstContent?.type).toBe("text");
  });
});
