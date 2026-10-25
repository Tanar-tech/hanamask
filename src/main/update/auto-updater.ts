import type { UpdateState, UpdateStatus } from "../../shared/preload-api.js";
import {
  initialUpdateState,
  nextUpdateState,
  type UpdaterEvent,
} from "./update-state.js";

// 起動直後はウィンドウ表示やDBの準備と回線を取り合うので、少し落ち着いてから確認する。
export const INITIAL_CHECK_DELAY_MS = 10_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface UpdaterLogger {
  info(message?: unknown): void;
  warn(message?: unknown): void;
  error(message?: unknown): void;
}

export interface UpdaterListeners {
  "checking-for-update": () => void;
  "update-available": (info: { version: string }) => void;
  "update-not-available": () => void;
  "download-progress": (info: { percent: number }) => void;
  "update-downloaded": (info: { version: string }) => void;
  error: (error: Error) => void;
}

/** electron-updater の AppUpdater のうち使う部分だけ。本物の autoUpdater がそのまま代入できる。 */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  logger: UpdaterLogger | null;
  // 型引数で1本にまとめると、イベントが多い本物の on と互換にならないので1つずつ並べる。
  on(
    event: "checking-for-update",
    listener: UpdaterListeners["checking-for-update"],
  ): unknown;
  on(
    event: "update-available",
    listener: UpdaterListeners["update-available"],
  ): unknown;
  on(
    event: "update-not-available",
    listener: UpdaterListeners["update-not-available"],
  ): unknown;
  on(
    event: "download-progress",
    listener: UpdaterListeners["download-progress"],
  ): unknown;
  on(
    event: "update-downloaded",
    listener: UpdaterListeners["update-downloaded"],
  ): unknown;
  on(event: "error", listener: UpdaterListeners["error"]): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

type CancelTimer = () => void;

export interface UpdateTimers {
  after: (callback: () => void, delay_ms: number) => CancelTimer;
  every: (callback: () => void, interval_ms: number) => CancelTimer;
}

export const systemTimers: UpdateTimers = {
  after: (callback, delay_ms) => {
    const handle = setTimeout(callback, delay_ms);
    return () => clearTimeout(handle);
  },
  every: (callback, interval_ms) => {
    const handle = setInterval(callback, interval_ms);
    return () => clearInterval(handle);
  },
};

export interface AutoUpdateDeps {
  // electron-updater の autoUpdater は参照した時点で更新器を生成し Electron の app を読むため、関数で遅らせて渡す。
  loadUpdater: () => Updater;
  readCurrentVersion: () => string;
  isSupported: boolean;
  isEnabled: () => boolean;
  onStatusChanged: (status: UpdateStatus) => void;
  onDownloaded: (version: string) => void;
  prepareToQuit: () => void;
  now: () => Date;
  timers?: UpdateTimers;
}

export interface AutoUpdate {
  start: () => void;
  refreshSchedule: () => void;
  checkNow: () => Promise<UpdateStatus>;
  install: () => void;
  status: () => UpdateStatus;
  stop: () => void;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

const logUpdateError = (error: unknown): void => {
  console.error(`Failed to check for updates: ${describeError(error)}`);
};

export const createAutoUpdate = (deps: AutoUpdateDeps): AutoUpdate => {
  const timers = deps.timers ?? systemTimers;
  const scheduled: CancelTimer[] = [];
  let state: UpdateState = initialUpdateState(deps.isSupported);
  let started = false;
  let loaded: Updater | null = null;

  const status = (): UpdateStatus => ({
    currentVersion: deps.readCurrentVersion(),
    state,
  });

  const cancelSchedule = (): void => {
    scheduled.splice(0).forEach((cancel) => cancel());
  };

  const dispatch = (event: UpdaterEvent): void => {
    state = nextUpdateState(state, event, deps.now().toISOString());
    deps.onStatusChanged(status());
  };

  const handleDownloaded = (version: string): void => {
    dispatch({ type: "update-downloaded", version });
    cancelSchedule();
    deps.onDownloaded(version);
  };

  const listen = (updater: Updater): void => {
    updater.on("checking-for-update", () =>
      dispatch({ type: "checking-for-update" }),
    );
    updater.on("update-available", (info) =>
      dispatch({ type: "update-available", version: info.version }),
    );
    updater.on("update-not-available", () =>
      dispatch({ type: "update-not-available" }),
    );
    updater.on("download-progress", (info) =>
      dispatch({ type: "download-progress", percent: info.percent }),
    );
    updater.on("update-downloaded", (info) => handleDownloaded(info.version));
    updater.on("error", (error) => {
      logUpdateError(error);
      dispatch({ type: "error" });
    });
  };

  // unsupported のときは updater に一切触れないよう、生成・設定・リスナー登録は使う直前まで遅らせる。
  const useUpdater = (): Updater => {
    if (loaded !== null) return loaded;
    const updater = deps.loadUpdater();
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.logger = console;
    listen(updater);
    loaded = updater;
    return updater;
  };

  const runCheck = async (): Promise<void> => {
    try {
      await useUpdater().checkForUpdates();
    } catch (error) {
      logUpdateError(error);
      dispatch({ type: "error" });
    }
  };

  const runScheduledCheck = (): void => {
    if (state.kind === "downloaded" || !deps.isEnabled()) return;
    void runCheck();
  };

  const refreshSchedule = (): void => {
    cancelSchedule();
    if (!started || !deps.isEnabled() || state.kind === "downloaded") return;
    scheduled.push(
      timers.after(() => {
        runScheduledCheck();
        scheduled.push(timers.every(runScheduledCheck, CHECK_INTERVAL_MS));
      }, INITIAL_CHECK_DELAY_MS),
    );
  };

  const start = (): void => {
    if (!deps.isSupported) return;
    useUpdater();
    started = true;
    refreshSchedule();
  };

  const checkNow = async (): Promise<UpdateStatus> => {
    if (!deps.isSupported || state.kind === "downloaded") return status();
    await runCheck();
    return status();
  };

  const install = (): void => {
    if (state.kind !== "downloaded") return;
    deps.prepareToQuit();
    useUpdater().quitAndInstall(true, true);
  };

  const stop = (): void => {
    started = false;
    cancelSchedule();
  };

  return { start, refreshSchedule, checkNow, install, status, stop };
};
