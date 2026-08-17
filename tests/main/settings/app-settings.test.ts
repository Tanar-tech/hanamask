import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readAppSettings,
  saveAppSettings,
  setAppSettingsPath,
} from "../../../src/main/settings/app-settings.js";

let directory = "";
let settingsPath = "";

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "hanamask-app-settings-"));
  settingsPath = join(directory, "app-settings.json");
  setAppSettingsPath(settingsPath);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("readAppSettings", () => {
  it("設定ファイルが無ければ既定値を返す", () => {
    expect(readAppSettings()).toEqual({ closeToTray: true, openAtLogin: false });
  });

  it("自動起動の既定値はオフ", () => {
    // 利用者の同意なくログイン項目を書き換えないため、ここは必ずオフで始まる。
    expect(readAppSettings().openAtLogin).toBe(false);
  });

  it("保存した内容を読み戻せる", () => {
    saveAppSettings({ closeToTray: false, openAtLogin: true });

    expect(readAppSettings()).toEqual({ closeToTray: false, openAtLogin: true });
  });

  it("壊れた設定ファイルでも既定値で続行する", () => {
    writeFileSync(settingsPath, "{ これはJSONではない", "utf-8");

    expect(readAppSettings()).toEqual({ closeToTray: true, openAtLogin: false });
  });

  it("値の型が違う項目は既定値で補う", () => {
    writeFileSync(settingsPath, JSON.stringify({ closeToTray: "yes", openAtLogin: 1 }), "utf-8");

    expect(readAppSettings()).toEqual({ closeToTray: true, openAtLogin: false });
  });

  it("片方だけ保存された設定ファイルでも、もう片方は既定値になる", () => {
    writeFileSync(settingsPath, JSON.stringify({ openAtLogin: true }), "utf-8");

    expect(readAppSettings()).toEqual({ closeToTray: true, openAtLogin: true });
  });
});

describe("saveAppSettings", () => {
  it("保存先のディレクトリが無くても作る", () => {
    const nested = join(directory, "deep", "app-settings.json");
    setAppSettingsPath(nested);

    saveAppSettings({ closeToTray: true, openAtLogin: true });

    expect(readAppSettings().openAtLogin).toBe(true);
  });

  it("保存した設定を返す", () => {
    expect(saveAppSettings({ closeToTray: false, openAtLogin: true })).toEqual({
      closeToTray: false,
      openAtLogin: true,
    });
  });
});

describe("setAppSettingsPath", () => {
  it("場所を設定していないと読み書きできない", () => {
    setAppSettingsPath("");

    expect(() => readAppSettings()).toThrow();
    expect(() => {
      saveAppSettings({ closeToTray: true, openAtLogin: false });
    }).toThrow();
  });
});
