import { describe, expect, it } from "vitest";
import { buildAnchor, locateAnchor } from "../../src/renderer/text-quote";

describe("buildAnchor", () => {
  it("選んだ範囲を引用にし、前後の文字を添える", () => {
    const text = "前の文。ここを選ぶ。後の文。";
    const start = text.indexOf("ここ");
    expect(buildAnchor(text, start, start + "ここを選ぶ".length)).toEqual({
      quote: "ここを選ぶ",
      prefix: "前の文。",
      suffix: "。後の文。",
    });
  });

  it("引用の前後の空白は削り、その分を前後の文字に回す", () => {
    const text = "abc  def  ghi";
    expect(buildAnchor(text, 3, 10)).toEqual({
      quote: "def",
      prefix: "abc  ",
      suffix: "  ghi",
    });
  });

  it("前後の文字は既定で32文字まで", () => {
    const text = `${"a".repeat(50)}X${"b".repeat(50)}`;
    const anchor = buildAnchor(text, 50, 51);
    expect(anchor?.prefix).toBe("a".repeat(32));
    expect(anchor?.suffix).toBe("b".repeat(32));
  });

  it("前後の文字数を指定できる", () => {
    const anchor = buildAnchor("0123456789", 5, 6, 2);
    expect(anchor).toEqual({ quote: "5", prefix: "34", suffix: "67" });
  });

  it("空白だけ・空の範囲は null", () => {
    expect(buildAnchor("a   b", 1, 4)).toBeNull();
    expect(buildAnchor("abc", 1, 1)).toBeNull();
  });

  it("範囲が逆順・本文の外にはみ出していても扱える", () => {
    expect(buildAnchor("abcdef", 4, 2)?.quote).toBe("cd");
    expect(buildAnchor("abc", -5, 99)?.quote).toBe("abc");
  });
});

describe("locateAnchor", () => {
  it("引用の位置を返す", () => {
    const text = "前の文。ここを選ぶ。後の文。";
    const start = text.indexOf("ここ");
    expect(locateAnchor(text, { quote: "ここを選ぶ", prefix: "", suffix: "" })).toEqual({
      start,
      end: start + 5,
    });
  });

  it("引用が無ければ null", () => {
    expect(locateAnchor("abc", { quote: "xyz", prefix: "", suffix: "" })).toBeNull();
    expect(locateAnchor("abc", { quote: "  ", prefix: "", suffix: "" })).toBeNull();
  });

  it("同じ文字列が複数あれば、前後の文字が合うほうを選ぶ", () => {
    const text = "りんごが好き。みかんとりんごが嫌い。";
    const second = text.lastIndexOf("りんご");
    expect(
      locateAnchor(text, {
        quote: "りんご",
        prefix: "みかんと",
        suffix: "が嫌い",
      }),
    ).toEqual({
      start: second,
      end: second + 3,
    });
  });

  it("前後の文字がどれにも合わなければ最初の出現", () => {
    const text = "xx A yy A zz";
    expect(locateAnchor(text, { quote: "A", prefix: "qq", suffix: "ww" })).toEqual({
      start: 3,
      end: 4,
    });
  });

  it("空白の違い（改行・連続空白）を無視して探し、元の本文の位置を返す", () => {
    const text = "head\n\nfoo   bar\nbaz tail";
    const start = text.indexOf("foo");
    const end = text.indexOf("baz") + 3;
    expect(
      locateAnchor(text, {
        quote: "foo bar\n\nbaz",
        prefix: "head ",
        suffix: " tail",
      }),
    ).toEqual({ start, end });
  });

  it("前後の文字の空白も正規化して比べる", () => {
    const text = "a\n\nB c B";
    expect(locateAnchor(text, { quote: "B", prefix: "c  ", suffix: "" })).toEqual({
      start: 7,
      end: 8,
    });
  });

  it("buildAnchor で作った目印で元の位置に戻れる", () => {
    const text = "同じ 同じ 同じ";
    const anchor = buildAnchor(text, 3, 5);
    expect(anchor).not.toBeNull();
    if (anchor !== null) expect(locateAnchor(text, anchor)).toEqual({ start: 3, end: 5 });
  });
});
