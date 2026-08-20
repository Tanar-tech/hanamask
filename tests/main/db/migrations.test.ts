import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import { MIGRATIONS } from "../../../src/main/db/migrations";

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

const tableExists = (table: string): boolean => {
  const rows: unknown[] = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(table);
  return rows.length > 0;
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

  it("tags列を持たない既存DBを開くとtasks.tagsが追加される", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);

    expect(columnNames("tasks")).toContain("tags");
  });

  it("tags列の追加で既存のタスク行が失われず、tagsは空配列になる", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);
    const row: unknown = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(LEGACY_TASK_ID);

    // ノートと同じくJSONの文字列として持つ。空配列の既定値なら、既存行もそのまま読める。
    expect(row).toMatchObject({ id: LEGACY_TASK_ID, title: "旧タスク", tags: "[]" });
  });

  it("embeddingsテーブルを持たない既存DBを開くと作られる", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);

    expect(tableExists("embeddings")).toBe(true);
  });

  it("embeddingsテーブルの追加で既存のタスク行が失われない", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);
    const row: unknown = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(LEGACY_TASK_ID);

    expect(row).toMatchObject({ id: LEGACY_TASK_ID, title: "旧タスク" });
  });

  it("新規DBでもembeddingsテーブルが存在する", () => {
    openDb(dbFilePath);

    expect(tableExists("embeddings")).toBe(true);
  });

  it("同じDBを二度開いてもマイグレーションは失敗しない", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);
    closeDb();

    expect(() => openDb(dbFilePath)).not.toThrow();
    expect(columnNames("tasks")).toContain("body");
    expect(tableExists("embeddings")).toBe(true);
  });

  it("新規DBでもtasks.bodyが存在する", () => {
    openDb(dbFilePath);

    expect(columnNames("tasks")).toContain("body");
  });

  /*
   * 二重起動すると、2つのプロセスが「未適用」と判定したあとで両方が適用を実行する。
   * 後発の apply は既に適用済みのDBに当たるので、ここで例外になると後発の起動が丸ごと失敗する。
   */
  it("適用済みのDBに対してapplyを実行しても失敗しない", () => {
    openDb(dbFilePath);
    const db = getDb();

    MIGRATIONS.forEach((migration) => {
      expect(() => {
        migration.apply(db);
      }, migration.name).not.toThrow();
    });
  });

  /* 既定値の0だと、他プロセスがDBを掴んでいる一瞬に当たっただけで起動が失敗する。 */
  it("ロック競合を待てるようbusy_timeoutを設定する", () => {
    openDb(dbFilePath);

    expect(getDb().pragma("busy_timeout", { simple: true })).toBeGreaterThan(0);
  });
});
