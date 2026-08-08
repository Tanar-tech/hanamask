import { describe, expect, it } from "vitest";
import { readZip, writeZip } from "../../../src/main/backup/zip";

const entry = (path: string, text: string) => ({ path, data: Buffer.from(text, "utf-8") });

describe("zip", () => {
  it("書いたものをそのまま読み戻せる", () => {
    const entries = [entry("a.txt", "ひとつめ"), entry("dir/b.txt", "ふたつめ")];

    const back = readZip(writeZip(entries));

    expect(back.map((e) => e.path)).toEqual(["a.txt", "dir/b.txt"]);
    expect(back[0]?.data.toString("utf-8")).toBe("ひとつめ");
    expect(back[1]?.data.toString("utf-8")).toBe("ふたつめ");
  });

  it("日本語のファイル名でも化けない", () => {
    expect(readZip(writeZip([entry("画像/写真.png", "中身")]))[0]?.path).toBe("画像/写真.png");
  });

  it("圧縮が効く内容でも元に戻る", () => {
    const repeated = "あ".repeat(10000);
    const zipped = writeZip([entry("big.txt", repeated)]);

    expect(zipped.length).toBeLessThan(Buffer.byteLength(repeated, "utf-8") / 2);
    expect(readZip(zipped)[0]?.data.toString("utf-8")).toBe(repeated);
  });

  it("バイナリをそのまま往復できる", () => {
    const bytes = Buffer.from([0, 1, 2, 255, 254, 0, 128]);

    const back = readZip(writeZip([{ path: "b.bin", data: bytes }]));

    expect(Buffer.compare(back[0]?.data ?? Buffer.alloc(0), bytes)).toBe(0);
  });

  it("空の書庫も往復できる", () => {
    expect(readZip(writeZip([]))).toEqual([]);
  });

  it("空ファイルを含んでも往復できる", () => {
    expect(readZip(writeZip([{ path: "empty.txt", data: Buffer.alloc(0) }]))[0]?.data.length).toBe(
      0,
    );
  });

  /*
   * 取り込むファイルは利用者が持ってくる。`../` を含む名前で書庫の外へ書かせる
   * 古典的な攻撃（zip slip）を、読み取りの時点で弾けることを固定する。
   */
  it("書庫の外を指すパスを弾く", () => {
    expect(() => readZip(writeZip([entry("../../etc/passwd", "危険")]))).toThrow(/書庫の外/);
  });

  it("絶対パスを弾く", () => {
    expect(() => readZip(writeZip([entry("/etc/passwd", "危険")]))).toThrow(/書庫の外/);
  });

  it("Windowsのドライブ付きパスを弾く", () => {
    expect(() => readZip(writeZip([entry("C:/Windows/x", "危険")]))).toThrow(/書庫の外/);
  });

  it("中身が壊れていたら気づく", () => {
    const zipped = writeZip([entry("a.txt", "元の中身を長めにしておく".repeat(20))]);
    const target = 40;
    zipped[target] = (zipped[target] ?? 0) ^ 0xff;

    expect(() => readZip(zipped)).toThrow();
  });

  it("ZIPでないものを渡されたら断る", () => {
    expect(() => readZip(Buffer.from("これはZIPではありません"))).toThrow(/読めません/);
  });
});
