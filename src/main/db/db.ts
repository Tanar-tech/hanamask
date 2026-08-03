import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type DatabaseHandle = Database.Database;

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");

let connection: DatabaseHandle | null = null;

const applySchema = (db: DatabaseHandle): void => {
  try {
    db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Failed to apply schema from ${SCHEMA_PATH}: ${String(error)}`);
  }
};

export const openDb = (dbFilePath: string): DatabaseHandle => {
  closeDb();
  let db: DatabaseHandle;
  try {
    db = new Database(dbFilePath);
  } catch (error) {
    throw new Error(`Failed to open database at ${dbFilePath}: ${String(error)}`);
  }
  connection = db;
  try {
    applySchema(db);
  } catch (error) {
    // Leaving a half-initialized handle in place would let later getDb() calls hit a broken schema.
    closeDb();
    throw error;
  }
  return db;
};

export const getDb = (): DatabaseHandle => {
  if (connection === null) {
    throw new Error("Database is not open. Call openDb(dbFilePath) first.");
  }
  return connection;
};

export const closeDb = (): void => {
  connection?.close();
  connection = null;
};
