import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import type { DeletedTask, Task, TaskInput, TaskStatus } from "../../shared/preload-api.js";

interface TaskRow {
  id: string;
  title: string;
  body: string;
  status: string;
  due_date: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

const TASK_STATUSES: readonly string[] = ["todo", "in_progress", "done"];

const isTaskStatus = (value: unknown): value is TaskStatus =>
  typeof value === "string" && TASK_STATUSES.includes(value);

export const toTaskStatus = (value: unknown): TaskStatus => {
  if (!isTaskStatus(value)) {
    throw new Error(`Task status must be one of ${TASK_STATUSES.join(", ")}, got ${String(value)}`);
  }
  return value;
};

const isTaskRow = (value: unknown): value is TaskRow => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.body === "string" &&
    typeof row.status === "string" &&
    (row.due_date === null || typeof row.due_date === "string") &&
    (row.deleted_at === null || typeof row.deleted_at === "string") &&
    typeof row.created_at === "string" &&
    typeof row.updated_at === "string"
  );
};

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  body: row.body,
  status: toTaskStatus(row.status),
  dueDate: row.due_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createTask = (input: TaskInput): Task => {
  const timestamp = new Date().toISOString();
  const task: Task = {
    id: randomUUID(),
    title: input.title,
    body: input.body ?? "",
    status: toTaskStatus(input.status),
    dueDate: input.dueDate,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  getDb()
    .prepare(
      "INSERT INTO tasks (id, title, body, status, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      task.id,
      task.title,
      task.body,
      task.status,
      task.dueDate,
      task.createdAt,
      task.updatedAt,
    );
  return task;
};

export const getTask = (id: string): Task | null => {
  const row: unknown = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (row === undefined) return null;
  if (!isTaskRow(row)) {
    throw new Error(`Unexpected tasks row shape for id ${id}`);
  }
  return toTask(row);
};

export const listTasks = (includeDeleted = false): Task[] => {
  const where = includeDeleted ? "" : "WHERE deleted_at IS NULL";
  const rows: unknown[] = getDb()
    .prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC`)
    .all();
  return rows.map((row) => {
    if (!isTaskRow(row)) {
      throw new Error("Unexpected tasks row shape in list results");
    }
    return toTask(row);
  });
};

export const listDeletedTasks = (): DeletedTask[] => {
  const rows: unknown[] = getDb()
    .prepare(
      // 同じミリ秒に2件消えることがあるため、rowidで挿入順に倒して順序を確定させる。
      "SELECT * FROM tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, rowid DESC",
    )
    .all();
  return rows.map((row) => {
    if (!isTaskRow(row)) {
      throw new Error("Unexpected tasks row shape in deleted tasks");
    }
    if (row.deleted_at === null) {
      throw new Error("A deleted task came back without deleted_at");
    }
    return { ...toTask(row), deletedAt: row.deleted_at };
  });
};

export interface TaskUpdateInput {
  title?: string;
  body?: string;
  status?: TaskStatus;
  dueDate?: string | null;
}

export const updateTask = (id: string, input: TaskUpdateInput): Task | null => {
  const existing = getTask(id);
  if (existing === null) return null;

  const updatedAt = new Date().toISOString();
  const title = input.title ?? existing.title;
  const body = input.body ?? existing.body;
  const status = input.status === undefined ? existing.status : toTaskStatus(input.status);
  const dueDate = input.dueDate === undefined ? existing.dueDate : input.dueDate;

  getDb()
    .prepare(
      "UPDATE tasks SET title = ?, body = ?, status = ?, due_date = ?, updated_at = ? WHERE id = ?",
    )
    .run(title, body, status, dueDate, updatedAt, id);

  return { ...existing, title, body, status, dueDate, updatedAt };
};

export const softDeleteTask = (id: string): boolean => {
  const deletedAt = new Date().toISOString();
  const result = getDb()
    .prepare("UPDATE tasks SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(deletedAt, id);
  return result.changes > 0;
};

export const restoreTask = (id: string): Task | null => {
  const result = getDb()
    .prepare("UPDATE tasks SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL")
    .run(id);
  if (result.changes === 0) return null;
  return getTask(id);
};
