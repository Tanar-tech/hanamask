import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote } from "../../../src/main/db/notes-repo";
import { createCommentThread, listThreads } from "../../../src/main/db/comments-repo";
import { ensureViewBaseline, markViewed, readViewedAt } from "../../../src/main/db/views-repo";
import { createBackupArchive } from "../../../src/main/backup/export-backup";
import { applyBackupArchive } from "../../../src/main/backup/import-backup";

const BASELINE = new Date("2026-10-01T00:00:00.000Z");
const VIEWED = new Date("2026-10-02T00:00:00.000Z");
const LATER = new Date("2026-10-20T00:00:00.000Z");

const pathsUnder = (root: string, name: string) => {
  const imagesDirPath = join(root, `${name}-images`);
  mkdirSync(imagesDirPath);
  return {
    dbFilePath: join(root, `${name}.sqlite3`),
    imagesDirPath,
    backupsDirPath: join(root, `${name}-backups`),
  };
};

describe("既読とコメントを含む書庫の往復", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hanamask-review-roundtrip-"));
  });

  afterEach(() => {
    closeDb();
    rmSync(root, { recursive: true, force: true });
  });

  it("書き出して別の DB に取り込むと、コメント・既読・基準時刻が戻る", () => {
    const source = pathsUnder(root, "source");
    openDb(source.dbFilePath);
    ensureViewBaseline(BASELINE);
    const note = createNote({ title: "経過", body: "選んだ文字", tags: [] });
    markViewed("note", note.id, VIEWED);
    createCommentThread(
      { entityType: "note", entityId: note.id, body: "ここを直して", anchor: null },
      "user",
      VIEWED,
    );
    const { archive } = createBackupArchive(source);
    closeDb();

    const destination = pathsUnder(root, "destination");
    openDb(destination.dbFilePath);
    applyBackupArchive(archive, destination);
    closeDb();
    openDb(destination.dbFilePath);

    expect(listThreads({ entityId: note.id }).map((thread) => thread.messages[0]?.body)).toEqual([
      "ここを直して",
    ]);
    expect(readViewedAt("note", note.id)).toBe(VIEWED.toISOString());
    // 書庫の基準時刻が残り、取り込んだ時刻で上書きされない（最初の値が勝つ）。
    expect(ensureViewBaseline(LATER)).toBe(BASELINE.toISOString());
  });
});
