import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppSettings } from "../../shared/preload-api.js";

/*
 * 常駐まわりの設定。APIキーと違い秘匿情報ではないので、chat-settings.ts のような
 * 暗号化はせず素のJSONで持つ。読めない・壊れている場合は既定値で続行する（設定ファイルの
 * せいでアプリが起動しなくなる方が困る）。
 *
 * openAtLogin の既定は false。利用者の同意なくOSのログイン項目を書き換えないため、
 * ここを true にしてはいけない。
 */
const DEFAULTS: AppSettings = { closeToTray: true, openAtLogin: false };

let settingsFilePath = "";

export const setAppSettingsPath = (filePath: string): void => {
  settingsFilePath = filePath;
};

const requirePath = (): string => {
  if (settingsFilePath === "") {
    throw new Error("app settings path is not configured");
  }
  return settingsFilePath;
};

const booleanOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

export const readAppSettings = (): AppSettings => {
  const path = requirePath();
  if (!existsSync(path)) return DEFAULTS;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
    const { closeToTray, openAtLogin } = parsed as Record<string, unknown>;
    return {
      closeToTray: booleanOr(closeToTray, DEFAULTS.closeToTray),
      openAtLogin: booleanOr(openAtLogin, DEFAULTS.openAtLogin),
    };
  } catch {
    return DEFAULTS;
  }
};

export const saveAppSettings = (settings: AppSettings): AppSettings => {
  const path = requirePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2), "utf-8");
  return settings;
};
