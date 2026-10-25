import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import { closeDb, openDb } from "../../src/main/db/db";
import { createNote, updateNote } from "../../src/main/db/notes-repo";
import { ensureViewBaseline } from "../../src/main/db/views-repo";
import {
  onCommentsChanged,
  onViewsChanged,
  type CommentChange,
} from "../../src/main/mcp/change-emitter";
import { registerReviewIpc, type IpcRegistrar } from "../../src/main/review-ipc";

type Handler = Parameters<IpcRegistrar["handle"]>[1];

const PAST = new Date("2026-01-01T00:00:00.000Z");
const fakeEvent: IpcMainInvokeEvent = Object.create(null);

const registerAll = (): Map<string, Handler> => {
  const handlers = new Map<string, Handler>();
  registerReviewIpc({ handle: (channel, handler) => handlers.set(channel, handler) });
  return handlers;
};

const invoke = (handlers: Map<string, Handler>, channel: string, ...args: unknown[]): unknown => {
  const handler = handlers.get(channel);
  if (handler === undefined) throw new Error(`not registered: ${channel}`);
  return handler(fakeEvent, ...args);
};

const isThread = (value: unknown): value is { id: string; status: string } =>
  typeof value === "object" && value !== null && "id" in value && "status" in value;

const threadOf = (value: unknown): { id: string; status: string } => {
  if (!isThread(value)) throw new Error("not a thread");
  return value;
};

describe("レビューと既読の IPC", () => {
  let dbFilePath: string;
  let noteId: string;
  let handlers: Map<string, Handler>;
  const changes: (CommentChange | undefined)[] = [];
  let stopComments: () => void;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-review-ipc-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
    ensureViewBaseline(PAST);
    noteId = createNote({ title: "経過", body: "選んだ文字", tags: [] }).id;
    handlers = registerAll();
    changes.length = 0;
    stopComments = onCommentsChanged((change) => changes.push(change));
  });

  afterEach(() => {
    stopComments();
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("画面からのコメントは利用者の発言として作り、作成を通知する", () => {
    const thread = invoke(handlers, "comments:create", {
      entityType: "note",
      entityId: noteId,
      body: "ここを直して",
      anchor: { quote: "選んだ", prefix: "", suffix: "文字" },
    });
    expect(threadOf(thread).status).toBe("open");
    expect(changes).toEqual([
      { entityType: "note", entityId: noteId, threadId: threadOf(thread).id, action: "created", by: "user" },
    ]);
  });

  it("引用の形が崩れていれば作らない", () => {
    expect(() =>
      invoke(handlers, "comments:create", {
        entityType: "note",
        entityId: noteId,
        body: "x",
        anchor: { quote: 1, prefix: "", suffix: "" },
      }),
    ).toThrow();
    expect(() =>
      invoke(handlers, "comments:create", { entityType: "notebook", entityId: noteId, body: "x" }),
    ).toThrow();
  });

  it("解決と再開は通知の種類を分ける", () => {
    const { id } = threadOf(
      invoke(handlers, "comments:create", { entityType: "note", entityId: noteId, body: "a" }),
    );
    invoke(handlers, "comments:set-status", id, "resolved");
    invoke(handlers, "comments:set-status", id, "open");
    expect(changes.map((change) => change?.action)).toEqual(["created", "resolved", "reopened"]);
  });

  it("削除は対象の記録を通知に載せ、無いスレッドには false を返す", () => {
    const { id } = threadOf(
      invoke(handlers, "comments:create", { entityType: "note", entityId: noteId, body: "a" }),
    );
    expect(invoke(handlers, "comments:delete", id)).toBe(true);
    expect(changes.at(-1)).toMatchObject({ entityId: noteId, action: "deleted", by: "user" });
    expect(invoke(handlers, "comments:delete", id)).toBe(false);
  });

  it("既読にすると既読の変化を通知し、未読から外れる", () => {
    updateNote(noteId, { body: "変えた" });
    const viewsChanged = vi.fn();
    const stop = onViewsChanged(viewsChanged);
    expect(invoke(handlers, "views:list-unread")).toEqual([{ entityType: "note", id: noteId }]);
    invoke(handlers, "views:mark", "note", noteId);
    expect(invoke(handlers, "views:list-unread")).toEqual([]);
    expect(viewsChanged).toHaveBeenCalledTimes(1);
    stop();
  });

  it("差分を出せない種類は断る", () => {
    expect(() => invoke(handlers, "views:changes-since-view", "task", noteId)).toThrow();
  });
});
