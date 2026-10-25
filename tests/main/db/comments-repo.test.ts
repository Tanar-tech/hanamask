import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import {
  createCommentThread,
  deleteCommentsForMissingEntities,
  deleteThread,
  getThread,
  listThreads,
  replyToThread,
  setThreadStatus,
} from "../../../src/main/db/comments-repo";
import { createNote, restoreNote, softDeleteNote } from "../../../src/main/db/notes-repo";
import { createTask, softDeleteTask } from "../../../src/main/db/tasks-repo";

const T0 = new Date("2026-10-25T00:00:00.000Z");
const T1 = new Date("2026-10-25T01:00:00.000Z");
const T2 = new Date("2026-10-25T02:00:00.000Z");
const T3 = new Date("2026-10-25T03:00:00.000Z");

const ANCHOR = { quote: "選んだ文字", prefix: "前の", suffix: "後の" };

describe("comments-repo", () => {
  let dbFilePath: string;
  let noteId: string;
  let taskId: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-comments-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
    noteId = createNote({ title: "n1", body: "前の選んだ文字後の", tags: [] }).id;
    taskId = createTask({ title: "t1", status: "todo", dueDate: null }).id;
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  const createOnNote = (body = "直してください", now = T0) =>
    createCommentThread({ entityType: "note", entityId: noteId, body, anchor: ANCHOR }, "user", now);

  describe("createCommentThread", () => {
    it("引用付きのスレッドを作り、本文を最初のメッセージとして返す", () => {
      const thread = createOnNote();

      expect(thread.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(thread).toMatchObject({
        entityType: "note",
        entityId: noteId,
        anchor: ANCHOR,
        status: "open",
        createdAt: T0.toISOString(),
        updatedAt: T0.toISOString(),
        resolvedAt: null,
      });
      expect(thread.messages).toHaveLength(1);
      expect(thread.messages[0]).toMatchObject({
        id: thread.id,
        author: "user",
        body: "直してください",
        createdAt: T0.toISOString(),
      });
    });

    it("範囲なしのスレッドは anchor が null になる", () => {
      const thread = createCommentThread(
        { entityType: "task", entityId: taskId, body: "全体へのコメント", anchor: null },
        "agent",
        T0,
      );

      expect(thread.anchor).toBeNull();
      expect(thread.entityType).toBe("task");
      expect(thread.messages[0]?.author).toBe("agent");
    });

    it("本文の前後の空白を除いて保存する", () => {
      expect(createOnNote("  本文  \n").messages[0]?.body).toBe("本文");
    });

    it("空白だけの本文は拒否する", () => {
      expect(() => createOnNote("   ")).toThrow(/body/i);
    });

    it("空の引用は拒否する", () => {
      expect(() =>
        createCommentThread(
          { entityType: "note", entityId: noteId, body: "x", anchor: { quote: "", prefix: "", suffix: "" } },
          "user",
          T0,
        ),
      ).toThrow(/quote/i);
    });

    it("存在しない記録には付けられない", () => {
      expect(() =>
        createCommentThread({ entityType: "note", entityId: "missing", body: "x", anchor: null }, "user", T0),
      ).toThrow("note not found: missing");
    });

    it("ゴミ箱の記録には付けられない", () => {
      softDeleteTask(taskId);
      expect(() =>
        createCommentThread({ entityType: "task", entityId: taskId, body: "x", anchor: null }, "user", T0),
      ).toThrow(`task not found: ${taskId}`);
    });

    it("種別と id の取り違え（タスクの id を note として渡す）も拒否する", () => {
      expect(() =>
        createCommentThread({ entityType: "note", entityId: taskId, body: "x", anchor: null }, "user", T0),
      ).toThrow(/not found/);
    });

    it("不正な種別は拒否する", () => {
      expect(() =>
        createCommentThread(
          { entityType: JSON.parse('"notebook"'), entityId: noteId, body: "x", anchor: null },
          "user",
          T0,
        ),
      ).toThrow(/entity type/i);
    });
  });

  describe("replyToThread", () => {
    it("返信を作成順に重ね、スレッドの更新日時を進める。状態は変えない", () => {
      const thread = createOnNote();
      setThreadStatus(thread.id, "resolved", T1);
      replyToThread(thread.id, "agent", "直しました", T2);
      const replied = replyToThread(thread.id, "user", " ありがとう ", T3);

      expect(replied.messages.map((message) => [message.author, message.body])).toEqual([
        ["user", "直してください"],
        ["agent", "直しました"],
        ["user", "ありがとう"],
      ]);
      expect(replied.updatedAt).toBe(T3.toISOString());
      expect(replied.createdAt).toBe(T0.toISOString());
      expect(replied.status).toBe("resolved");
    });

    it("同じ時刻の返信も追加した順に並ぶ", () => {
      const thread = createOnNote("root", T0);
      ["a", "b", "c"].forEach((body) => replyToThread(thread.id, "agent", body, T0));

      expect(getThread(thread.id)?.messages.map((message) => message.body)).toEqual([
        "root",
        "a",
        "b",
        "c",
      ]);
    });

    it("空の返信は拒否する", () => {
      const thread = createOnNote();
      expect(() => replyToThread(thread.id, "agent", " ", T1)).toThrow(/body/i);
    });

    it("存在しないスレッドへの返信はエラー", () => {
      expect(() => replyToThread("missing", "agent", "x", T1)).toThrow(
        "Comment thread not found: missing",
      );
    });

    it("返信の id をスレッド id として渡すとエラー", () => {
      const thread = createOnNote();
      const replyId = replyToThread(thread.id, "agent", "x", T1).messages[1]?.id ?? "";
      expect(() => replyToThread(replyId, "agent", "y", T2)).toThrow(/not found/);
    });

    it("削除済みスレッドへの返信はエラー", () => {
      const thread = createOnNote();
      deleteThread(thread.id, T1);
      expect(() => replyToThread(thread.id, "agent", "x", T2)).toThrow(/not found/);
    });
  });

  describe("setThreadStatus", () => {
    it("解決で resolvedAt を入れ、再開で消す", () => {
      const thread = createOnNote();

      const resolved = setThreadStatus(thread.id, "resolved", T1);
      expect(resolved).toMatchObject({
        status: "resolved",
        resolvedAt: T1.toISOString(),
        updatedAt: T1.toISOString(),
      });

      const reopened = setThreadStatus(thread.id, "open", T2);
      expect(reopened).toMatchObject({
        status: "open",
        resolvedAt: null,
        updatedAt: T2.toISOString(),
      });
    });

    it("不正な状態は拒否する", () => {
      const thread = createOnNote();
      expect(() => setThreadStatus(thread.id, JSON.parse('"closed"'), T1)).toThrow(/status/i);
    });

    it("存在しないスレッドはエラー", () => {
      expect(() => setThreadStatus("missing", "resolved", T1)).toThrow(
        "Comment thread not found: missing",
      );
    });
  });

  describe("deleteThread", () => {
    it("スレッドと返信をソフトデリートし、取得・一覧から消す", () => {
      const thread = createOnNote();
      replyToThread(thread.id, "agent", "x", T1);

      expect(deleteThread(thread.id, T2)).toBe(true);
      expect(getThread(thread.id)).toBeNull();
      expect(listThreads({ entityType: "note", entityId: noteId, status: "all" })).toEqual([]);

      const rows: unknown[] = getDb()
        .prepare("SELECT deleted_at FROM comments WHERE id = ? OR parent_id = ?")
        .all(thread.id, thread.id);
      expect(rows).toEqual([{ deleted_at: T2.toISOString() }, { deleted_at: T2.toISOString() }]);
    });

    it("存在しない・削除済みのスレッドは false", () => {
      const thread = createOnNote();
      deleteThread(thread.id, T1);
      expect(deleteThread(thread.id, T2)).toBe(false);
      expect(deleteThread("missing", T2)).toBe(false);
    });
  });

  describe("listThreads", () => {
    it("未解決を先に、それぞれ更新日時の新しい順に並べる", () => {
      const oldOpen = createOnNote("old open", T0);
      const resolvedNew = createOnNote("resolved", T0);
      const newOpen = createOnNote("new open", T1);
      setThreadStatus(resolvedNew.id, "resolved", T3);
      replyToThread(oldOpen.id, "agent", "bump", T2);

      expect(listThreads({ status: "all" }).map((thread) => thread.id)).toEqual([
        oldOpen.id,
        newOpen.id,
        resolvedNew.id,
      ]);
    });

    it("状態の既定は all で、open / resolved で絞れる", () => {
      const open = createOnNote("open", T0);
      const resolved = createOnNote("resolved", T0);
      setThreadStatus(resolved.id, "resolved", T1);

      expect(listThreads({}).map((thread) => thread.id).sort()).toEqual(
        [open.id, resolved.id].sort(),
      );
      expect(listThreads({ status: "open" }).map((thread) => thread.id)).toEqual([open.id]);
      expect(listThreads({ status: "resolved" }).map((thread) => thread.id)).toEqual([resolved.id]);
    });

    it("記録の種別と id で絞れる", () => {
      const onNote = createOnNote();
      const onTask = createCommentThread(
        { entityType: "task", entityId: taskId, body: "t", anchor: null },
        "user",
        T0,
      );

      expect(listThreads({ entityType: "note" }).map((thread) => thread.id)).toEqual([onNote.id]);
      expect(listThreads({ entityType: "task", entityId: taskId }).map((t) => t.id)).toEqual([
        onTask.id,
      ]);
      expect(listThreads({ entityId: noteId }).map((thread) => thread.id)).toEqual([onNote.id]);
    });

    it("返信も含めて返す", () => {
      const thread = createOnNote();
      replyToThread(thread.id, "agent", "reply", T1);

      expect(listThreads({})[0]?.messages.map((message) => message.body)).toEqual([
        "直してください",
        "reply",
      ]);
    });

    // ゴミ箱は復元できる状態なので、コメントは消さずに残す（REQUIREMENTS §4.12）。
    it("記録をゴミ箱に入れてもコメントは残り、復元でそのまま戻る", () => {
      const thread = createOnNote();
      softDeleteNote(noteId);

      expect(listThreads({ entityId: noteId }).map((t) => t.id)).toEqual([thread.id]);
      expect(getThread(thread.id)?.id).toBe(thread.id);

      restoreNote(noteId);
      expect(listThreads({ entityId: noteId }).map((t) => t.id)).toEqual([thread.id]);
    });
  });

  describe("deleteCommentsForMissingEntities", () => {
    it("記録の行が無くなったコメントだけを物理削除し、件数を返す", () => {
      const kept = createOnNote();
      const onTask = createCommentThread(
        { entityType: "task", entityId: taskId, body: "t", anchor: null },
        "user",
        T0,
      );
      replyToThread(onTask.id, "agent", "reply", T1);
      softDeleteNote(noteId);
      getDb().prepare("DELETE FROM tasks WHERE id = ?").run(taskId);

      expect(deleteCommentsForMissingEntities()).toBe(2);
      expect(getThread(kept.id)?.id).toBe(kept.id);
      expect(getThread(onTask.id)).toBeNull();
      expect(getDb().prepare("SELECT COUNT(*) AS n FROM comments").get()).toEqual({ n: 1 });
    });

    it("対象が無ければ 0", () => {
      createOnNote();
      expect(deleteCommentsForMissingEntities()).toBe(0);
    });
  });
});
