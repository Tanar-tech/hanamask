import { describe, expect, it } from "vitest";
import { asRecord } from "../../src/main/records";

describe("asRecord", () => {
  it("オブジェクトは添字アクセスできる形にして返す", () => {
    expect(asRecord({ id: "note-1" })).toEqual({ id: "note-1" });
  });

  it("元のオブジェクトを共有しない", () => {
    const source = { id: "note-1" };
    const record = asRecord(source);
    expect(record).not.toBe(source);
  });

  it("null はオブジェクトでないものとして扱う", () => {
    expect(asRecord(null)).toBeNull();
  });

  it("オブジェクト以外は null を返す", () => {
    expect(asRecord("note")).toBeNull();
    expect(asRecord(3)).toBeNull();
    expect(asRecord(undefined)).toBeNull();
  });
});
