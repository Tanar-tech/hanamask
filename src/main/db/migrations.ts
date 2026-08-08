import type Database from "better-sqlite3";

type DatabaseHandle = Database.Database;

export interface Migration {
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

/*
 * 判定と適用の間に、別プロセスが同じ列を足していることがある（同じDBを2つのプロセスが
 * ほぼ同時に開いたとき）。その場合の "duplicate column name" は目的が既に達成された印なので、
 * 失敗として扱うと後発の起動が丸ごと立ち上がらなくなる。列の有無で見分けて握り潰す。
 */
const addColumnMigration = (table: string, column: string, definition: string): Migration => ({
  name: `add ${table}.${column}`,
  isApplied: (db) => hasColumn(db, table, column),
  apply: (db) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!hasColumn(db, table, column)) throw error;
    }
  },
});

// Each migration decides for itself whether it already ran, rather than a global user_version
// counter: schema.sql creates fresh databases fully up to date, so a version counter would
// have to be bumped in two places and would re-run ALTERs on databases that never needed them.
export const MIGRATIONS: readonly Migration[] = [
  // SQLite requires a DEFAULT when adding a NOT NULL column to a table that may hold rows.
  addColumnMigration("tasks", "body", "TEXT NOT NULL DEFAULT ''"),
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
