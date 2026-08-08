import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";

const LEGACY_TASKS_TABLE = `
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const LEGACY_TASK_ID = "legacy-task-1";
const LEGACY_TIMESTAMP = "2026-08-01T00:00:00.000Z";

const createLegacyDbFile = (dbFilePath: string): void => {
  const legacy = new Database(dbFilePath);
  legacy.exec(LEGACY_TASKS_TABLE);
  legacy
    .prepare(
      "INSERT INTO tasks (id, title, status, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(LEGACY_TASK_ID, "旧タスク", "todo", "2026-08-10", LEGACY_TIMESTAMP, LEGACY_TIMESTAMP);
  legacy.close();
};

const columnNames = (table: string): string[] => {
  const rows: unknown[] = getDb().prepare("SELECT name FROM pragma_table_info(?)").all(table);
  return rows.map((row) => {
    if (typeof row !== "object" || row === null || !("name" in row)) {
      throw new Error("Unexpected pragma_table_info row shape");
    }
    return String(row.name);
  });
};

describe("migrations", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-migration-test-${randomUUID()}.sqlite3`);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("body列を持たない既存DBを開くとtasks.bodyが追加される", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);

    expect(columnNames("tasks")).toContain("body");
  });

  it("body列の追加で既存のタスク行が失われず、bodyは空文字になる", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);
    const row: unknown = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(LEGACY_TASK_ID);

    expect(row).toMatchObject({
      id: LEGACY_TASK_ID,
      title: "旧タスク",
      status: "todo",
      due_date: "2026-08-10",
      created_at: LEGACY_TIMESTAMP,
      body: "",
    });
  });

  it("同じDBを二度開いてもマイグレーションは失敗しない", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);
    closeDb();

    expect(() => openDb(dbFilePath)).not.toThrow();
    expect(columnNames("tasks")).toContain("body");
  });

  it("新規DBでもtasks.bodyが存在する", () => {
    openDb(dbFilePath);

    expect(columnNames("tasks")).toContain("body");
  });
});
