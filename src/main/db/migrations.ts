import type Database from "better-sqlite3";

type DatabaseHandle = Database.Database;

interface Migration {
  readonly name: string;
  readonly isApplied: (db: DatabaseHandle) => boolean;
  readonly apply: (db: DatabaseHandle) => void;
}

const isColumnRow = (value: unknown): value is { name: string } => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return typeof row.name === "string";
};

const hasColumn = (db: DatabaseHandle, table: string, column: string): boolean => {
  const rows: unknown[] = db.prepare("SELECT name FROM pragma_table_info(?)").all(table);
  return rows.some((row) => isColumnRow(row) && row.name === column);
};

// Each migration decides for itself whether it already ran, rather than a global user_version
// counter: schema.sql creates fresh databases fully up to date, so a version counter would
// have to be bumped in two places and would re-run ALTERs on databases that never needed them.
const MIGRATIONS: readonly Migration[] = [
  {
    name: "add tasks.body",
    isApplied: (db) => hasColumn(db, "tasks", "body"),
    // SQLite requires a DEFAULT when adding a NOT NULL column to a table that may hold rows.
    apply: (db) => db.exec("ALTER TABLE tasks ADD COLUMN body TEXT NOT NULL DEFAULT ''"),
  },
];

export const applyMigrations = (db: DatabaseHandle): void => {
  MIGRATIONS.forEach((migration) => {
    if (migration.isApplied(db)) return;
    try {
      migration.apply(db);
    } catch (error) {
      throw new Error(`Migration "${migration.name}" failed: ${String(error)}`);
    }
  });
};
