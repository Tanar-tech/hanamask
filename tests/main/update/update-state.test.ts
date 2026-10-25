import { describe, expect, it } from "vitest";
import {
  UPDATE_ERROR_MESSAGE,
  initialUpdateState,
  nextUpdateState,
} from "../../../src/main/update/update-state";
import type { UpdateState } from "../../../src/shared/preload-api";

const NOW_ISO = "2026-10-25T03:00:00.000Z";

const idle: UpdateState = { kind: "idle", lastCheckedAt: null };
const checking: UpdateState = { kind: "checking" };
const downloading: UpdateState = {
  kind: "downloading",
  version: "1.2.0",
  percent: 10,
};
const downloaded: UpdateState = { kind: "downloaded", version: "1.2.0" };

describe("initialUpdateState", () => {
  it("対応していれば未確認の idle から始まる", () => {
    expect(initialUpdateState(true)).toEqual({
      kind: "idle",
      lastCheckedAt: null,
    });
  });

  it("対応していなければ unsupported", () => {
    expect(initialUpdateState(false)).toEqual({ kind: "unsupported" });
  });
});

describe("nextUpdateState", () => {
  it("checking-for-update で checking になる", () => {
    expect(
      nextUpdateState(idle, { type: "checking-for-update" }, NOW_ISO),
    ).toEqual(checking);
  });

  it("update-available でその版のダウンロード 0% になる", () => {
    expect(
      nextUpdateState(
        checking,
        { type: "update-available", version: "1.2.0" },
        NOW_ISO,
      ),
    ).toEqual({ kind: "downloading", version: "1.2.0", percent: 0 });
  });

  it("update-not-available で最終確認時刻つきの idle になる", () => {
    expect(
      nextUpdateState(checking, { type: "update-not-available" }, NOW_ISO),
    ).toEqual({
      kind: "idle",
      lastCheckedAt: NOW_ISO,
    });
  });

  it("download-progress で版を保ったまま進捗を整数に切り捨てて更新する", () => {
    expect(
      nextUpdateState(
        downloading,
        { type: "download-progress", percent: 42.7 },
        NOW_ISO,
      ),
    ).toEqual({ kind: "downloading", version: "1.2.0", percent: 42 });
  });

  it("版が分からない状態での download-progress は無視する", () => {
    expect(
      nextUpdateState(
        checking,
        { type: "download-progress", percent: 50 },
        NOW_ISO,
      ),
    ).toEqual(checking);
  });

  it("update-downloaded で downloaded になる", () => {
    expect(
      nextUpdateState(
        downloading,
        { type: "update-downloaded", version: "1.2.0" },
        NOW_ISO,
      ),
    ).toEqual(downloaded);
  });

  it("error で利用者向けの固定文言の error になる", () => {
    expect(nextUpdateState(checking, { type: "error" }, NOW_ISO)).toEqual({
      kind: "error",
      message: UPDATE_ERROR_MESSAGE,
    });
    expect(UPDATE_ERROR_MESSAGE).toBe("更新を確認できませんでした");
  });

  it("error の後でも再確認すれば checking に戻れる", () => {
    const failed = nextUpdateState(checking, { type: "error" }, NOW_ISO);
    expect(
      nextUpdateState(failed, { type: "checking-for-update" }, NOW_ISO),
    ).toEqual(checking);
  });

  it("downloaded はどのイベントでも崩れない", () => {
    expect(nextUpdateState(downloaded, { type: "error" }, NOW_ISO)).toEqual(
      downloaded,
    );
    expect(
      nextUpdateState(downloaded, { type: "update-not-available" }, NOW_ISO),
    ).toEqual(downloaded);
    expect(
      nextUpdateState(downloaded, { type: "checking-for-update" }, NOW_ISO),
    ).toEqual(downloaded);
  });

  it("unsupported はどのイベントでも変わらない", () => {
    const unsupported: UpdateState = { kind: "unsupported" };
    expect(
      nextUpdateState(unsupported, { type: "checking-for-update" }, NOW_ISO),
    ).toEqual(unsupported);
  });
});
