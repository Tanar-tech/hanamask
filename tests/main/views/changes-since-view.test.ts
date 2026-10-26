import { describe, expect, it } from "vitest";
import { pickContentAtView } from "../../../src/main/views/changes-since-view";

const VIEWED_AT = "2026-10-25T10:00:00.000Z";

const version = (createdAt: string, body: string) => ({ createdAt, title: `t-${body}`, body });

describe("pickContentAtView", () => {
  it("returns null when there are no versions", () => {
    expect(pickContentAtView([], VIEWED_AT)).toBeNull();
  });

  it("returns null when every version was taken before the view", () => {
    const versions = [version("2026-10-25T09:00:00.000Z", "古い")];

    expect(pickContentAtView(versions, VIEWED_AT)).toBeNull();
  });

  it("treats a version taken exactly at the view time as already seen", () => {
    const versions = [version(VIEWED_AT, "同時")];

    expect(pickContentAtView(versions, VIEWED_AT)).toBeNull();
  });

  it("picks the earliest version taken after the view", () => {
    const versions = [
      version("2026-10-25T09:00:00.000Z", "見る前"),
      version("2026-10-25T11:00:00.000Z", "見た時点"),
      version("2026-10-25T12:00:00.000Z", "途中"),
    ];

    expect(pickContentAtView(versions, VIEWED_AT)).toEqual({ title: "t-見た時点", body: "見た時点" });
  });

  it("does not depend on the input order", () => {
    const versions = [
      version("2026-10-25T12:00:00.000Z", "途中"),
      version("2026-10-25T09:00:00.000Z", "見る前"),
      version("2026-10-25T11:00:00.000Z", "見た時点"),
    ];

    expect(pickContentAtView(versions, VIEWED_AT)).toEqual({ title: "t-見た時点", body: "見た時点" });
    expect(pickContentAtView([...versions].reverse(), VIEWED_AT)?.body).toBe("見た時点");
  });

  it("returns only the title and body", () => {
    const withId = { ...version("2026-10-25T11:00:00.000Z", "x"), id: "v1" };

    const picked = pickContentAtView([withId], VIEWED_AT);

    expect(picked).toEqual({ title: "t-x", body: "x" });
  });
});
