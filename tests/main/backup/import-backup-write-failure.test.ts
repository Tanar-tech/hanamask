import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote, searchNotes } from "../../../src/main/db/notes-repo";
import { createBackupArchive } from "../../../src/main/backup/export-backup";
import { applyBackupArchive } from "../../../src/main/backup/import-backup";

const FAILING_IMAGE_NAME = "z-write-fails.png";
const SURVIVING_IMAGE_NAME = "existing.png";
const DESTINATION_NOTE_TITLE = "取り込み先にもとからあるノート";

// 画像の書き込みが途中で失敗する状況（ディスク不足・権限・アンチウイルス等）を作る。
// 実ファイル操作はそのまま通し、この1件だけを落とす。
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const writeFileSync = (...args: Parameters<typeof actual.writeFileSync>): void => {
    const [path] = args;
    if (typeof path === "string" && path.endsWith(FAILING_IMAGE_NAME)) {
      throw new Error("ENOSPC: no space left on device");
    }
    actual.writeFileSync(...args);
  };
  return { ...actual, default: { ...actual, writeFileSync }, writeFileSync };
});

interface Env {
  rootDirPath: string;
  dbFilePath: string;
  imagesDirPath: string;
  backupsDirPath: string;
}

const makeEnv = (label: string): Env => {
  const rootDirPath = mkdtempSync(join(tmpdir(), `hanamask-${label}-`));
  const imagesDirPath = join(rootDirPath, "images");
  mkdirSync(imagesDirPath);
  return {
    rootDirPath,
    dbFilePath: join(rootDirPath, "hanamask.sqlite3"),
    imagesDirPath,
    backupsDirPath: join(rootDirPath, "backups"),
  };
};

describe("画像の書き込みが途中で失敗する取り込み", () => {
  let source: Env;
  let destination: Env;

  beforeEach(() => {
    source = makeEnv("import-fail-source");
    destination = makeEnv("import-fail-destination");
  });

  afterEach(() => {
    closeDb();
    rmSync(source.rootDirPath, { recursive: true, force: true });
    rmSync(destination.rootDirPath, { recursive: true, force: true });
  });

  /* 書き込みに失敗する画像を含む書庫を作る。失敗させる名前は展開時にだけ効く。 */
  const buildSourceArchive = (): Buffer => {
    openDb(source.dbFilePath);
    createNote({ title: "移行元のノート", body: "本文", tags: [] });
    writeFileSync(join(source.imagesDirPath, "a-ok.png"), Buffer.from([1, 2]));
    // この名前の書き込みは落ちるので、別名で作ってから改名する。
    const stagedPath = join(source.imagesDirPath, "staged.png");
    writeFileSync(stagedPath, Buffer.from([3, 4]));
    renameSync(stagedPath, join(source.imagesDirPath, FAILING_IMAGE_NAME));
    const { archive } = createBackupArchive(source);
    closeDb();
    return archive;
  };

  it("展開に失敗しても既存の画像とDBがそのまま残る", () => {
    const archive = buildSourceArchive();
    openDb(destination.dbFilePath);
    createNote({ title: DESTINATION_NOTE_TITLE, body: "消えては困る", tags: [] });
    writeFileSync(join(destination.imagesDirPath, SURVIVING_IMAGE_NAME), Buffer.from([9, 9]));

    expect(() => applyBackupArchive(archive, destination)).toThrow();

    expect(existsSync(join(destination.imagesDirPath, SURVIVING_IMAGE_NAME))).toBe(true);
    expect(searchNotes("").map((note) => note.title)).toEqual([DESTINATION_NOTE_TITLE]);
  });

  it("失敗しても中途半端な作業用ディレクトリを残さない", () => {
    const archive = buildSourceArchive();
    openDb(destination.dbFilePath);
    writeFileSync(join(destination.imagesDirPath, SURVIVING_IMAGE_NAME), Buffer.from([9, 9]));

    expect(() => applyBackupArchive(archive, destination)).toThrow();

    const leftovers = readdirSync(destination.rootDirPath).filter((name) =>
      name.startsWith("images."),
    );
    expect(leftovers).toEqual([]);
  });
});
