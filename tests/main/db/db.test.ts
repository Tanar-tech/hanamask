import { beforeEach, describe, expect, it, vi } from "vitest";

const close = vi.fn();
const exec = vi.fn();

vi.mock("better-sqlite3", () => ({
  default: vi.fn(function createFakeDatabase() {
    // Reports every migration as already applied so this suite stays focused on openDb:
    // the column names for the ALTER migrations, the DDL for the embeddings rebuild.
    const appliedEmbeddingsDdl =
      "CREATE TABLE embeddings (entity_type TEXT NOT NULL CHECK (entity_type IN ('note','task','notebook')))";
    return {
      close,
      exec,
      prepare: () => ({
        all: (): unknown[] => [
          { name: "body", sql: appliedEmbeddingsDdl },
          { name: "tags", sql: appliedEmbeddingsDdl },
          { name: "notebook_id", sql: appliedEmbeddingsDdl },
          { name: "entity_type", sql: appliedEmbeddingsDdl },
        ],
      }),
    };
  }),
}));

const DB_FILE_PATH = "/tmp/hanamask-db-test.sqlite3";

const importDb = async (): Promise<typeof import("../../../src/main/db/db")> => {
  vi.resetModules();
  return import("../../../src/main/db/db");
};

describe("openDb", () => {
  beforeEach(() => {
    close.mockReset();
    exec.mockReset();
  });

  it("keeps the connection available after the schema is applied", async () => {
    const { openDb, getDb, closeDb } = await importDb();

    const handle = openDb(DB_FILE_PATH);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(getDb()).toBe(handle);
    closeDb();
  });

  it("closes and clears the connection when applying the schema fails", async () => {
    const { openDb, getDb } = await importDb();
    exec.mockImplementation(() => {
      throw new Error("syntax error");
    });

    expect(() => openDb(DB_FILE_PATH)).toThrow(/Failed to apply schema/);

    expect(close).toHaveBeenCalledTimes(1);
    expect(() => getDb()).toThrow(/not open/);
  });
});
