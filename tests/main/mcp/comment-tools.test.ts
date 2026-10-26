import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote, softDeleteNote } from "../../../src/main/db/notes-repo";
import { createTask } from "../../../src/main/db/tasks-repo";
import {
  createCommentThread,
  deleteThread,
  getThread,
  setThreadStatus,
} from "../../../src/main/db/comments-repo";
import { onCommentsChanged } from "../../../src/main/mcp/change-emitter";
import { commentTools } from "../../../src/main/mcp/tools/comments";

const callTool = (name: string, args: unknown): CallToolResult => {
  const tool = commentTools.find((candidate) => candidate.definition.name === name);
  if (tool === undefined) throw new Error(`Tool not found: ${name}`);
  const result = tool.handler(args);
  if (result instanceof Promise) throw new Error(`Tool is asynchronous: ${name}`);
  return result;
};

const readText = (result: CallToolResult): string => {
  const [firstContent] = result.content;
  if (firstContent === undefined || firstContent.type !== "text") {
    throw new Error(`Tool result has no text content: ${JSON.stringify(result)}`);
  }
  return firstContent.text;
};

const readJson = (result: CallToolResult): unknown => JSON.parse(readText(result));

const ANCHOR = { quote: "選んだ文字", prefix: "前の", suffix: "後の" };
const PAST = new Date("2026-10-25T00:00:00.000Z");

describe("mcp comment tools", () => {
  let dbFilePath: string;
  let noteId: string;
  let taskId: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-comment-mcp-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
    noteId = createNote({ title: "ページ1", body: "前の選んだ文字後の", tags: [] }).id;
    taskId = createTask({ title: "タスク1", status: "todo", dueDate: null }).id;
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  const commentOnNote = (body = "直してください") =>
    createCommentThread({ entityType: "note", entityId: noteId, body, anchor: ANCHOR }, "user", PAST);

  it("3つのツールを公開し、引数の宣言を持つ", () => {
    const schemaKeys = (name: string): string[] =>
      Object.keys(
        commentTools.find((tool) => tool.definition.name === name)?.definition.inputSchema
          .properties ?? {},
      ).sort();

    expect(commentTools.map((tool) => tool.definition.name)).toEqual([
      "list_comments",
      "reply_comment",
      "resolve_comment",
    ]);
    expect(schemaKeys("list_comments")).toEqual(["entity_id", "entity_type", "status"]);
    expect(schemaKeys("reply_comment")).toEqual(["body", "comment_id"]);
    expect(schemaKeys("resolve_comment")).toEqual(["body", "comment_id"]);
  });

  it("説明でエージェントに作業前の確認と直し方を伝える", () => {
    const description =
      commentTools.find((tool) => tool.definition.name === "list_comments")?.definition
        .description ?? "";
    expect(description).toMatch(/before/i);
    expect(description).toContain("update_page");
    expect(description).toContain("replace_page_section");
    expect(description).toContain("update_task");
  });

  describe("list_comments", () => {
    it("既定では未解決だけを、記録のタイトル・引用・返信付きで返す", () => {
      const open = commentOnNote();
      const resolved = commentOnNote("済み");
      setThreadStatus(resolved.id, "resolved", PAST);

      const payload = readJson(callTool("list_comments", {}));

      expect(payload).toEqual({
        comments: [
          {
            ...getThread(open.id),
            entityTitle: "ページ1",
          },
        ],
      });
      expect(JSON.stringify(payload)).toContain('"quote":"選んだ文字"');
    });

    it("status=all・resolved と記録で絞れる", () => {
      const onNote = commentOnNote();
      const onTask = createCommentThread(
        { entityType: "task", entityId: taskId, body: "t", anchor: null },
        "user",
        PAST,
      );
      setThreadStatus(onTask.id, "resolved", PAST);

      const ids = (args: Record<string, unknown>): unknown => {
        const payload = readJson(callTool("list_comments", args));
        if (typeof payload !== "object" || payload === null || !("comments" in payload)) {
          throw new Error("list_comments payload has no comments");
        }
        const { comments } = payload;
        if (!Array.isArray(comments)) throw new Error("comments is not an array");
        return comments.map((comment: { id: unknown }) => comment.id);
      };

      expect(ids({ status: "all" })).toEqual([onNote.id, onTask.id]);
      expect(ids({ status: "resolved" })).toEqual([onTask.id]);
      expect(ids({ status: "all", entity_type: "note" })).toEqual([onNote.id]);
      expect(ids({ status: "all", entity_type: "task", entity_id: taskId })).toEqual([onTask.id]);
    });

    it("ゴミ箱の記録のコメントもタイトル付きで返す", () => {
      const thread = commentOnNote();
      softDeleteNote(noteId);

      expect(readJson(callTool("list_comments", {}))).toEqual({
        comments: [{ ...getThread(thread.id), entityTitle: "ページ1" }],
      });
    });

    it("不正な status・entity_type はエラー結果で返す", () => {
      const badStatus = callTool("list_comments", { status: "closed" });
      expect(badStatus.isError).toBe(true);
      expect(readText(badStatus)).toMatch(/status/i);

      const badType = callTool("list_comments", { entity_type: "notebook" });
      expect(badType.isError).toBe(true);
      expect(readText(badType)).toMatch(/entity type/i);
    });

    it("引数がオブジェクトでなければエラー結果", () => {
      expect(callTool("list_comments", null).isError).toBe(true);
    });
  });

  describe("reply_comment", () => {
    it("agent として返信し、本文を含まない変更通知を出す", () => {
      const thread = commentOnNote();
      const listener = vi.fn();
      const unsubscribe = onCommentsChanged(listener);

      const result = callTool("reply_comment", { comment_id: thread.id, body: "直しました" });
      unsubscribe();

      expect(result.isError).toBeUndefined();
      expect(readJson(result)).toEqual({ comment: getThread(thread.id) });
      expect(getThread(thread.id)?.messages.at(-1)).toMatchObject({
        author: "agent",
        body: "直しました",
      });
      expect(getThread(thread.id)?.status).toBe("open");
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        entityType: "note",
        entityId: noteId,
        threadId: thread.id,
        action: "replied",
        by: "agent",
      });
    });

    it("存在しない・削除済みのスレッドはエラー結果で、通知しない", () => {
      const thread = commentOnNote();
      deleteThread(thread.id, PAST);
      const listener = vi.fn();
      const unsubscribe = onCommentsChanged(listener);

      const missing = callTool("reply_comment", { comment_id: "missing", body: "x" });
      const deleted = callTool("reply_comment", { comment_id: thread.id, body: "x" });
      unsubscribe();

      expect(missing.isError).toBe(true);
      expect(readText(missing)).toBe("Comment thread not found: missing");
      expect(deleted.isError).toBe(true);
      expect(listener).not.toHaveBeenCalled();
    });

    it("body が無い・空ならエラー結果", () => {
      const thread = commentOnNote();
      expect(callTool("reply_comment", { comment_id: thread.id }).isError).toBe(true);
      expect(callTool("reply_comment", { comment_id: thread.id, body: "  " }).isError).toBe(true);
      expect(getThread(thread.id)?.messages).toHaveLength(1);
    });
  });

  describe("resolve_comment", () => {
    it("解決済みにして resolved を通知する", () => {
      const thread = commentOnNote();
      const listener = vi.fn();
      const unsubscribe = onCommentsChanged(listener);

      const result = callTool("resolve_comment", { comment_id: thread.id });
      unsubscribe();

      const resolved = getThread(thread.id);
      expect(resolved?.status).toBe("resolved");
      expect(resolved?.resolvedAt).not.toBeNull();
      expect(resolved?.messages).toHaveLength(1);
      expect(readJson(result)).toEqual({ comment: resolved });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        entityType: "note",
        entityId: noteId,
        threadId: thread.id,
        action: "resolved",
        by: "agent",
      });
    });

    it("body を渡すと agent の返信を添えてから解決する", () => {
      const thread = createCommentThread(
        { entityType: "task", entityId: taskId, body: "t", anchor: null },
        "user",
        PAST,
      );

      callTool("resolve_comment", { comment_id: thread.id, body: "対応しました" });

      const resolved = getThread(thread.id);
      expect(resolved?.status).toBe("resolved");
      expect(resolved?.messages.map((message) => [message.author, message.body])).toEqual([
        ["user", "t"],
        ["agent", "対応しました"],
      ]);
    });

    it("存在しないスレッドはエラー結果で、通知しない", () => {
      const listener = vi.fn();
      const unsubscribe = onCommentsChanged(listener);
      const result = callTool("resolve_comment", { comment_id: "missing", body: "x" });
      unsubscribe();

      expect(result.isError).toBe(true);
      expect(readText(result)).toBe("Comment thread not found: missing");
      expect(listener).not.toHaveBeenCalled();
    });

    it("body が文字列でなければ、何も書かずにエラー結果", () => {
      const thread = commentOnNote();
      const result = callTool("resolve_comment", { comment_id: thread.id, body: 1 });

      expect(result.isError).toBe(true);
      expect(getThread(thread.id)?.status).toBe("open");
    });
  });
});
