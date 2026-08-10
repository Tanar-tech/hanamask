import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import {
  createTask,
  getTask,
  listDeletedTasks,
  listTasks,
  restoreTask,
  softDeleteTask,
  toTaskStatus,
  updateTask,
} from "../../../src/main/db/tasks-repo";

describe("tasks-repo", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-task-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("生成したidとISO形式のタイムスタンプでタスクを作成する", () => {
    const task = createTask({ title: "設計する", status: "todo", dueDate: "2026-08-10" });

    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(task.title).toBe("設計する");
    expect(task.status).toBe("todo");
    expect(task.dueDate).toBe("2026-08-10");
    expect(new Date(task.createdAt).toISOString()).toBe(task.createdAt);
    expect(task.updatedAt).toBe(task.createdAt);
  });

  it("期限がnullのタスクを作成できる", () => {
    const task = createTask({ title: "期限なし", status: "todo", dueDate: null });

    expect(task.dueDate).toBeNull();
    expect(getTask(task.id)).toEqual(task);
  });

  it("本文を指定して作成すると、getTaskで同じ本文が取得できる", () => {
    const created = createTask({
      title: "本文つき",
      status: "todo",
      dueDate: null,
      body: "# 見出し\n\n本文です",
    });

    expect(created.body).toBe("# 見出し\n\n本文です");
    expect(getTask(created.id)?.body).toBe("# 見出し\n\n本文です");
  });

  it("本文を指定せずに作成すると本文は空文字になる", () => {
    const created = createTask({ title: "本文なし", status: "todo", dueDate: null });

    expect(created.body).toBe("");
    expect(getTask(created.id)?.body).toBe("");
  });

  it("listTasksの結果にも本文が含まれる", () => {
    createTask({ title: "一覧", status: "todo", dueDate: null, body: "抜粋のもと" });

    expect(listTasks().map((task) => task.body)).toEqual(["抜粋のもと"]);
  });

  it("updateTaskで本文を更新でき、指定しなければ元の本文が残る", () => {
    const created = createTask({ title: "編集", status: "todo", dueDate: null, body: "旧本文" });

    const updated = updateTask(created.id, { body: "新本文" });
    expect(updated?.body).toBe("新本文");
    expect(getTask(created.id)?.body).toBe("新本文");

    const statusOnly = updateTask(created.id, { status: "done" });
    expect(statusOnly?.body).toBe("新本文");
  });

  it("作成したタスクをgetTaskで取得できる", () => {
    const created = createTask({ title: "取得", status: "in_progress", dueDate: null });

    expect(getTask(created.id)).toEqual(created);
  });

  it("存在しないidに対してnullを返す", () => {
    expect(getTask(randomUUID())).toBeNull();
  });

  it("接続を張り直してもタスクが永続化されている", () => {
    const created = createTask({ title: "永続", status: "done", dueDate: null });

    closeDb();
    openDb(dbFilePath);

    expect(getTask(created.id)).toEqual(created);
  });

  it("toTaskStatusは3値のみ受け付け、それ以外は例外を投げる", () => {
    expect(toTaskStatus("todo")).toBe("todo");
    expect(toTaskStatus("in_progress")).toBe("in_progress");
    expect(toTaskStatus("done")).toBe("done");
    expect(() => toTaskStatus("archived")).toThrow();
    expect(() => toTaskStatus("")).toThrow();
    expect(() => toTaskStatus(42)).toThrow();
    expect(() => toTaskStatus(null)).toThrow();
  });

  it("保存済みの不正なstatus値を読み出すと例外を投げる", () => {
    const created = createTask({ title: "壊れた行", status: "todo", dueDate: null });
    getDb().prepare("UPDATE tasks SET status = ? WHERE id = ?").run("broken", created.id);

    expect(() => getTask(created.id)).toThrow();
  });

  it("listTasksは作成済みのタスクを全件返す", () => {
    createTask({ title: "one", status: "todo", dueDate: null });
    createTask({ title: "two", status: "done", dueDate: null });

    expect(listTasks()).toHaveLength(2);
  });

  it("タスクが1件も無いとき空配列を返す", () => {
    expect(listTasks()).toEqual([]);
  });

  it("updateTaskは指定したフィールドのみ更新する", () => {
    const created = createTask({ title: "旧題", status: "todo", dueDate: "2026-08-10" });

    const updated = updateTask(created.id, { status: "in_progress" });

    expect(updated?.title).toBe("旧題");
    expect(updated?.status).toBe("in_progress");
    expect(updated?.dueDate).toBe("2026-08-10");
    expect(getTask(created.id)).toEqual(updated);
  });

  it("updateTaskで期限をnullに戻せる", () => {
    const created = createTask({ title: "期限あり", status: "todo", dueDate: "2026-08-10" });

    const updated = updateTask(created.id, { dueDate: null });

    expect(updated?.dueDate).toBeNull();
  });

  it("存在しないタスクのupdateTaskはnullを返す", () => {
    expect(updateTask(randomUUID(), { title: "x" })).toBeNull();
  });

  it("ソフトデリートしたタスクはlistTasksのデフォルト結果から除外される", () => {
    const created = createTask({ title: "消す", status: "todo", dueDate: null });
    createTask({ title: "残す", status: "todo", dueDate: null });

    expect(softDeleteTask(created.id)).toBe(true);

    expect(listTasks().map((task) => task.title)).toEqual(["残す"]);
    expect(listTasks(true).map((task) => task.title).sort()).toEqual(["残す", "消す"]);
  });

  it("既に削除済み・存在しないタスクのソフトデリートはfalseを返す", () => {
    const created = createTask({ title: "二重削除", status: "todo", dueDate: null });
    softDeleteTask(created.id);

    expect(softDeleteTask(created.id)).toBe(false);
    expect(softDeleteTask(randomUUID())).toBe(false);
  });

  it("復元したタスクは再びlistTasksに現れる", () => {
    const created = createTask({ title: "復元", status: "todo", dueDate: null });
    softDeleteTask(created.id);

    const restored = restoreTask(created.id);

    expect(restored?.id).toBe(created.id);
    expect(listTasks().map((task) => task.id)).toEqual([created.id]);
  });

  it("削除されていない・存在しないタスクの復元はnullを返す", () => {
    const created = createTask({ title: "未削除", status: "todo", dueDate: null });

    expect(restoreTask(created.id)).toBeNull();
    expect(restoreTask(randomUUID())).toBeNull();
  });

  it("listDeletedTasksは削除済みタスクだけをdeletedAt付きで返す", () => {
    const deleted = createTask({ title: "消したタスク", status: "todo", dueDate: null });
    createTask({ title: "生きているタスク", status: "todo", dueDate: null });
    softDeleteTask(deleted.id);

    const rows = listDeletedTasks();

    expect(rows.map((task) => task.title)).toEqual(["消したタスク"]);
    expect(new Date(rows[0]?.deletedAt ?? "").toISOString()).toBe(rows[0]?.deletedAt);
  });

  it("listDeletedTasksは新しく削除したものから順に返す", () => {
    const first = createTask({ title: "先に消す", status: "todo", dueDate: null });
    const second = createTask({ title: "後で消す", status: "todo", dueDate: null });
    softDeleteTask(first.id);
    softDeleteTask(second.id);

    expect(listDeletedTasks().map((task) => task.title)).toEqual(["後で消す", "先に消す"]);
  });

  it("復元したタスクはlistDeletedTasksから消える", () => {
    const created = createTask({ title: "戻す", status: "todo", dueDate: null });
    softDeleteTask(created.id);
    restoreTask(created.id);

    expect(listDeletedTasks()).toEqual([]);
  });
});
