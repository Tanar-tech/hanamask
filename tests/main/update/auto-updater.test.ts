import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUpdater } from "electron-updater";
import {
  CHECK_INTERVAL_MS,
  INITIAL_CHECK_DELAY_MS,
  createAutoUpdate,
  type AutoUpdateDeps,
  type UpdateCheckResult,
  type Updater,
  type UpdaterListeners,
} from "../../../src/main/update/auto-updater";
import { UPDATE_ERROR_MESSAGE } from "../../../src/main/update/update-state";
import type { UpdateStatus } from "../../../src/shared/preload-api";

// 本物の autoUpdater を結線側でそのまま渡せることを型で保証する。
type RealUpdaterFitsInterface = AppUpdater extends Updater ? true : false;
const realUpdaterFitsInterface: RealUpdaterFitsInterface = true;

const NOW_ISO = "2026-10-25T03:00:00.000Z";

const createFakeUpdater = () => {
  const listeners: Partial<UpdaterListeners> = {};
  const updater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: null,
    on: vi.fn(
      <E extends keyof UpdaterListeners>(
        event: E,
        listener: UpdaterListeners[E],
      ) => {
        listeners[event] = listener;
      },
    ),
    checkForUpdates: vi.fn(async (): Promise<UpdateCheckResult | null> => null),
    quitAndInstall: vi.fn(),
  } satisfies Updater;
  return { updater, listeners };
};

const setup = (overrides: Partial<AutoUpdateDeps> = {}) => {
  const { updater, listeners } = createFakeUpdater();
  const enabled = { value: true };
  const onStatusChanged = vi.fn<(status: UpdateStatus) => void>();
  const onDownloaded = vi.fn<(version: string) => void>();
  const loadUpdater = vi.fn(() => updater);
  const autoUpdate = createAutoUpdate({
    loadUpdater,
    readCurrentVersion: () => "1.1.0",
    isSupported: true,
    isEnabled: () => enabled.value,
    onStatusChanged,
    onDownloaded,
    now: () => new Date(NOW_ISO),
    ...overrides,
  });
  return {
    autoUpdate,
    updater,
    loadUpdater,
    listeners,
    enabled,
    onStatusChanged,
    onDownloaded,
  };
};

const emitDownloaded = (
  listeners: Partial<UpdaterListeners>,
  version: string,
) => {
  listeners["update-downloaded"]?.({ version });
};

describe("auto update", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("本物の AppUpdater が最小インターフェースに代入できる", () => {
    expect(realUpdaterFitsInterface).toBe(true);
  });

  it("確認の間隔は初回10秒・以降6時間", () => {
    expect(INITIAL_CHECK_DELAY_MS).toBe(10_000);
    expect(CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("updater の生成は最初に使うときの1回だけ", async () => {
    const { autoUpdate, updater, loadUpdater } = setup();
    expect(loadUpdater).not.toHaveBeenCalled();
    autoUpdate.start();
    await autoUpdate.checkNow();
    await autoUpdate.checkNow();
    expect(loadUpdater).toHaveBeenCalledTimes(1);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  describe("unsupported", () => {
    it("start しても updater に何も触れず確認もしない", async () => {
      const { autoUpdate, updater, loadUpdater } = setup({ isSupported: false });
      autoUpdate.start();
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
      expect(loadUpdater).not.toHaveBeenCalled();
      expect(updater.on).not.toHaveBeenCalled();
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
      expect(updater.autoDownload).toBe(false);
    });

    it("checkNow は確認せず unsupported の状態を返す", async () => {
      const { autoUpdate, updater } = setup({ isSupported: false });
      const status = await autoUpdate.checkNow();
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
      expect(status).toEqual({
        currentVersion: "1.1.0",
        state: { kind: "unsupported" },
      });
    });

    it("install は何もしない", () => {
      const { autoUpdate, updater } = setup({
        isSupported: false,
      });
      autoUpdate.install();
      expect(updater.quitAndInstall).not.toHaveBeenCalled();
    });
  });

  describe("start", () => {
    it("自動ダウンロードと終了時の適用を有効にする", () => {
      const { autoUpdate, updater } = setup();
      autoUpdate.start();
      expect(updater.autoDownload).toBe(true);
      expect(updater.autoInstallOnAppQuit).toBe(true);
    });

    it("初回は10秒後、以降6時間ごとに確認する", async () => {
      const { autoUpdate, updater } = setup();
      autoUpdate.start();
      await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS - 1);
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(3);
    });

    it("設定オフなら自動では確認しない", async () => {
      const { autoUpdate, updater, enabled } = setup();
      enabled.value = false;
      autoUpdate.start();
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
    });

    it("設定オフでも checkNow は確認する", async () => {
      const { autoUpdate, updater, enabled } = setup();
      enabled.value = false;
      autoUpdate.start();
      await autoUpdate.checkNow();
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it("start 前でも checkNow でイベントを受け取れる", async () => {
      const { autoUpdate, listeners } = setup();
      await autoUpdate.checkNow();
      listeners["checking-for-update"]?.();
      expect(autoUpdate.status().state).toEqual({ kind: "checking" });
    });
  });

  describe("refreshSchedule", () => {
    it("オフにすると定期確認が止まり、オンに戻すと再開する", async () => {
      const { autoUpdate, updater, enabled } = setup();
      autoUpdate.start();
      await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);

      enabled.value = false;
      autoUpdate.refreshSchedule();
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);

      enabled.value = true;
      autoUpdate.refreshSchedule();
      await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(3);
    });

    it("何度呼んでもタイマーが重複しない", async () => {
      const { autoUpdate, updater } = setup();
      autoUpdate.start();
      autoUpdate.refreshSchedule();
      autoUpdate.refreshSchedule();
      await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it("有効のまま呼んでも、予約済みの確認を先送りしない", async () => {
      const { autoUpdate, updater } = setup();
      autoUpdate.start();
      await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS / 2);
      autoUpdate.refreshSchedule();
      await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS / 2);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS / 2);
      autoUpdate.refreshSchedule();
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS / 2);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    });

    it("start 前は何も予約しない", async () => {
      const { autoUpdate, updater } = setup();
      autoUpdate.refreshSchedule();
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
    });
  });

  describe("ダウンロードの失敗", () => {
    it("ダウンロードの Promise の reject を未処理のまま残さず、ログに出す", async () => {
      const { autoUpdate, updater } = setup();
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      updater.checkForUpdates.mockResolvedValueOnce({
        downloadPromise: Promise.reject(new Error("network down")),
      });
      await autoUpdate.checkNow();
      // unhandledRejection はマイクロタスクの後に出るので、本物の setImmediate で1周待つ。
      vi.useRealTimers();
      await new Promise((resolve) => setImmediate(resolve));
      vi.useFakeTimers();
      process.off("unhandledRejection", unhandled);
      expect(unhandled).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("network down"));
      consoleError.mockRestore();
    });
  });

  describe("stop", () => {
    it("以降の定期確認をしない", async () => {
      const { autoUpdate, updater } = setup();
      autoUpdate.start();
      autoUpdate.stop();
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
    });
  });

  describe("状態の通知", () => {
    it("イベントごとに状態を更新して通知する", () => {
      const { autoUpdate, listeners, onStatusChanged } = setup();
      autoUpdate.start();
      listeners["checking-for-update"]?.();
      listeners["update-available"]?.({ version: "1.2.0" });
      listeners["download-progress"]?.({ percent: 55.5 });
      expect(onStatusChanged).toHaveBeenLastCalledWith({
        currentVersion: "1.1.0",
        state: { kind: "downloading", version: "1.2.0", percent: 55 },
      });
    });

    it("最新なら最終確認時刻つきの idle になる", () => {
      const { autoUpdate, listeners } = setup();
      autoUpdate.start();
      listeners["update-not-available"]?.();
      expect(autoUpdate.status()).toEqual({
        currentVersion: "1.1.0",
        state: { kind: "idle", lastCheckedAt: NOW_ISO },
      });
    });

    it("ダウンロード完了で onDownloaded に版を渡す", () => {
      const { autoUpdate, listeners, onDownloaded } = setup();
      autoUpdate.start();
      emitDownloaded(listeners, "1.2.0");
      expect(onDownloaded).toHaveBeenCalledWith("1.2.0");
      expect(autoUpdate.status().state).toEqual({
        kind: "downloaded",
        version: "1.2.0",
      });
    });

    it("error イベントは固定文言の error にし、詳細はログへ出す", () => {
      const { autoUpdate, listeners } = setup();
      autoUpdate.start();
      listeners.error?.(new Error("net::ERR_INTERNET_DISCONNECTED"));
      expect(autoUpdate.status().state).toEqual({
        kind: "error",
        message: UPDATE_ERROR_MESSAGE,
      });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("確認の失敗", () => {
    it("checkNow の reject を外へ投げず error にする", async () => {
      const { autoUpdate, updater } = setup();
      updater.checkForUpdates.mockRejectedValueOnce(new Error("offline"));
      const status = await autoUpdate.checkNow();
      expect(status.state).toEqual({
        kind: "error",
        message: UPDATE_ERROR_MESSAGE,
      });
      expect(console.error).toHaveBeenCalled();
    });

    it("定期確認の reject でも例外にならず、次の確認は続く", async () => {
      const { autoUpdate, updater } = setup();
      updater.checkForUpdates.mockRejectedValueOnce(new Error("offline"));
      autoUpdate.start();
      await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS);
      expect(autoUpdate.status().state).toEqual({
        kind: "error",
        message: UPDATE_ERROR_MESSAGE,
      });
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    });
  });

  describe("downloaded 以降", () => {
    it("定期確認をしない", async () => {
      const { autoUpdate, updater, listeners } = setup();
      autoUpdate.start();
      await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS);
      emitDownloaded(listeners, "1.2.0");
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3);
      expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it("refreshSchedule で予約し直さない", async () => {
      const { autoUpdate, updater, listeners } = setup();
      autoUpdate.start();
      emitDownloaded(listeners, "1.2.0");
      autoUpdate.refreshSchedule();
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
    });
  });

  describe("install", () => {
    it("downloaded なら quitAndInstall(true, true) を呼ぶ", () => {
      const { autoUpdate, updater, listeners } = setup();
      autoUpdate.start();
      emitDownloaded(listeners, "1.2.0");
      autoUpdate.install();
      expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
    });

    it("downloaded でなければ何もしない", () => {
      const { autoUpdate, updater, listeners } = setup();
      autoUpdate.start();
      autoUpdate.install();
      listeners["update-available"]?.({ version: "1.2.0" });
      autoUpdate.install();
      expect(updater.quitAndInstall).not.toHaveBeenCalled();
    });
  });

  it("status は現在の版と状態を返す", () => {
    const { autoUpdate } = setup();
    expect(autoUpdate.status()).toEqual({
      currentVersion: "1.1.0",
      state: { kind: "idle", lastCheckedAt: null },
    });
  });
});
