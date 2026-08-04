import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import { createImage, listImages } from "../../../src/main/db/images-repo";

describe("images-repo", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-image-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("生成したidで画像レコードを作成する", () => {
    const image = createImage({
      noteId: "note-1",
      filePath: "/data/images/a.png",
      mimeType: "image/png",
    });

    expect(image.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(image.noteId).toBe("note-1");
    expect(image.filePath).toBe("/data/images/a.png");
    expect(image.mimeType).toBe("image/png");
  });

  it("レンダラーがそのまま使えるfile:// URLを付けて返す", () => {
    const created = createImage({
      noteId: "note-1",
      filePath: join(tmpdir(), "images", "a b.png"),
      mimeType: "image/png",
    });

    expect(created.fileUrl).toBe(pathToFileURL(created.filePath).href);
    expect(created.fileUrl.startsWith("file:///")).toBe(true);
    expect(listImages("note-1")[0]?.fileUrl).toBe(created.fileUrl);
  });

  it("接続を張り直しても画像レコードが永続化されている", () => {
    const created = createImage({
      noteId: "note-1",
      filePath: "/data/images/a.png",
      mimeType: "image/png",
    });

    closeDb();
    openDb(dbFilePath);

    expect(listImages("note-1")).toEqual([created]);
  });

  it("listImagesは指定ノートの画像のみを返す", () => {
    const mine = createImage({
      noteId: "note-1",
      filePath: "/data/images/a.png",
      mimeType: "image/png",
    });
    createImage({
      noteId: "note-2",
      filePath: "/data/images/b.jpg",
      mimeType: "image/jpeg",
    });

    expect(listImages("note-1")).toEqual([mine]);
  });

  it("listImagesは同一ノートの画像を追加順に返す", () => {
    const first = createImage({
      noteId: "note-1",
      filePath: "/data/images/a.png",
      mimeType: "image/png",
    });
    const second = createImage({
      noteId: "note-1",
      filePath: "/data/images/b.webp",
      mimeType: "image/webp",
    });

    expect(listImages("note-1").map((image) => image.id)).toEqual([first.id, second.id]);
  });

  it("画像が1件も無いとき空配列を返す", () => {
    expect(listImages(randomUUID())).toEqual([]);
  });

  it("保存済みの行が壊れている場合は例外を投げる", () => {
    const created = createImage({
      noteId: "note-1",
      filePath: "/data/images/a.png",
      mimeType: "image/png",
    });
    // BLOB survives the column's TEXT affinity, so the row reads back as a non-string.
    getDb().prepare("UPDATE images SET file_path = x'00' WHERE id = ?").run(created.id);

    expect(() => listImages("note-1")).toThrow();
  });
});
