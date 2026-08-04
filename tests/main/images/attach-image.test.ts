import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import { listImages } from "../../../src/main/db/images-repo";
import { attachImage, setImagesDirPath } from "../../../src/main/images/attach-image";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

describe("attachImage", () => {
  let dbFilePath: string;
  let imagesDirPath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-attach-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
    imagesDirPath = join(mkdtempSync(join(tmpdir(), "hanamask-images-")), "images");
    setImagesDirPath(imagesDirPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
    rmSync(dirname(imagesDirPath), { force: true, recursive: true });
  });

  it("画像ファイルを保存先ディレクトリに書き出しDBレコードを返す", () => {
    const dataBase64 = Buffer.from("fake-png-bytes").toString("base64");

    const image = attachImage({
      noteId: "note-1",
      fileName: "shot.png",
      dataBase64,
      mimeType: "image/png",
    });

    expect(dirname(image.filePath)).toBe(imagesDirPath);
    expect(extname(image.filePath)).toBe(".png");
    expect(readFileSync(image.filePath)).toEqual(Buffer.from(dataBase64, "base64"));
    expect(listImages("note-1")).toEqual([image]);
  });

  it("保存先ディレクトリが無ければ作成する", () => {
    expect(existsSync(imagesDirPath)).toBe(false);

    attachImage({
      noteId: "note-1",
      fileName: "shot.png",
      dataBase64: Buffer.from("x").toString("base64"),
      mimeType: "image/png",
    });

    expect(existsSync(imagesDirPath)).toBe(true);
  });

  it("同名ファイルを2回添付しても上書きしない", () => {
    const attach = (): string =>
      attachImage({
        noteId: "note-1",
        fileName: "shot.png",
        dataBase64: Buffer.from("x").toString("base64"),
        mimeType: "image/png",
      }).filePath;

    expect(attach()).not.toBe(attach());
  });

  it("拡張子の無いファイル名にはMIMEタイプから拡張子を補う", () => {
    const image = attachImage({
      noteId: "note-1",
      fileName: "clipboard",
      dataBase64: Buffer.from("x").toString("base64"),
      mimeType: "image/webp",
    });

    expect(extname(image.filePath)).toBe(".webp");
  });

  it("非対応のMIMEタイプを拒否しファイルもレコードも作らない", () => {
    expect(() =>
      attachImage({
        noteId: "note-1",
        fileName: "doc.pdf",
        dataBase64: Buffer.from("x").toString("base64"),
        mimeType: "application/pdf",
      }),
    ).toThrow(/application\/pdf/);
    expect(existsSync(imagesDirPath)).toBe(false);
    expect(listImages("note-1")).toEqual([]);
  });

  it("10MBを超える画像を拒否する", () => {
    expect(() =>
      attachImage({
        noteId: "note-1",
        fileName: "big.png",
        dataBase64: Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64"),
        mimeType: "image/png",
      }),
    ).toThrow();
    expect(listImages("note-1")).toEqual([]);
  });

  it("保存先ディレクトリが未設定なら例外を投げる", () => {
    setImagesDirPath("");

    expect(() =>
      attachImage({
        noteId: "note-1",
        fileName: "shot.png",
        dataBase64: Buffer.from("x").toString("base64"),
        mimeType: "image/png",
      }),
    ).toThrow();
  });
});
