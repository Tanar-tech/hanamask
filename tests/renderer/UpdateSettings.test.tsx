/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { UpdateSettings } from "../../src/renderer/components/UpdateSettings";
import { stubHanamask } from "./hanamask-stub";
import type {
  AppSettings,
  HanamaskPreloadApi,
  UpdateState,
  UpdateStatus,
} from "../../src/shared/preload-api";

const AUTO_UPDATE_LABEL = "更新を自動で確認する";
const CHECK_NOW_LABEL = "今すぐ確認";
const INSTALL_LABEL = "再起動して更新";
const CURRENT_VERSION = "2.1.1";
const SETTINGS: AppSettings = {
  closeToTray: true,
  openAtLogin: true,
  autoUpdate: true,
};

const statusOf = (state: UpdateState): UpdateStatus => ({
  currentVersion: CURRENT_VERSION,
  state,
});

type StatusListener = (status: UpdateStatus) => void;

const stubUpdate = (
  state: UpdateState,
  overrides: Partial<HanamaskPreloadApi> = {},
): { emit: StatusListener; unsubscribe: () => void } => {
  const listeners: StatusListener[] = [];
  const unsubscribe = vi.fn();
  stubHanamask({
    readAppSettings: vi.fn(async () => SETTINGS),
    saveAppSettings: vi.fn(async (settings: AppSettings) => settings),
    readUpdateStatus: vi.fn(async () => statusOf(state)),
    checkForUpdates: vi.fn(async () => statusOf({ kind: "checking" })),
    installUpdate: vi.fn(async () => {}),
    onUpdateStatusChanged: vi.fn((callback: StatusListener) => {
      listeners.push(callback);
      return unsubscribe;
    }),
    ...overrides,
  });
  const emit: StatusListener = (status) => {
    listeners.forEach((listener) => {
      listener(status);
    });
  };
  return { emit, unsubscribe };
};

const findSwitch = (): Promise<HTMLInputElement> =>
  screen.findByRole<HTMLInputElement>("checkbox", { name: AUTO_UPDATE_LABEL });

const findButton = (name: string): Promise<HTMLButtonElement> =>
  screen.findByRole<HTMLButtonElement>("button", { name });

const click = async (element: HTMLElement): Promise<void> => {
  await act(async () => {
    element.click();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UpdateSettings", () => {
  it("現在のバージョンと自動確認の設定を映す", async () => {
    stubUpdate({ kind: "idle", lastCheckedAt: null });

    render(<UpdateSettings />);

    expect((await findSwitch()).checked).toBe(true);
    expect(
      await screen.findByText(`v${CURRENT_VERSION}`, { exact: false }),
    ).toBeTruthy();
  });

  it("チェックを外すと他の項目を保ったまま autoUpdate を false で保存する", async () => {
    const saveAppSettings = vi.fn(async (settings: AppSettings) => settings);
    stubUpdate({ kind: "idle", lastCheckedAt: null }, { saveAppSettings });

    render(<UpdateSettings />);
    await click(await findSwitch());

    expect(saveAppSettings).toHaveBeenCalledWith({
      ...SETTINGS,
      autoUpdate: false,
    });
    expect((await findSwitch()).checked).toBe(false);
  });

  it("「今すぐ確認」で確認を走らせ、返った状態を映す", async () => {
    const checkForUpdates = vi.fn(async () => statusOf({ kind: "checking" }));
    stubUpdate({ kind: "idle", lastCheckedAt: null }, { checkForUpdates });

    render(<UpdateSettings />);
    await click(await findButton(CHECK_NOW_LABEL));

    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("確認中…")).toBeTruthy();
  });

  it("ダウンロード中は版と進み具合を出す", async () => {
    stubUpdate({ kind: "downloading", version: "2.2.0", percent: 42 });

    render(<UpdateSettings />);

    expect(await screen.findByText("v2.2.0 をダウンロード中 42%")).toBeTruthy();
  });

  it("最新のときは最終確認の日時をローカル表示で出す", async () => {
    const lastCheckedAt = "2026-10-25T03:04:05.000Z";
    stubUpdate({ kind: "idle", lastCheckedAt });

    render(<UpdateSettings />);

    const local = new Date(lastCheckedAt).toLocaleString("ja-JP");
    expect(
      await screen.findByText(`最新です（最終確認: ${local}）`),
    ).toBeTruthy();
  });

  it("準備ができたら「再起動して更新」で入れ替える", async () => {
    const installUpdate = vi.fn(async () => {});
    stubUpdate({ kind: "downloaded", version: "2.2.0" }, { installUpdate });

    render(<UpdateSettings />);
    expect(
      await screen.findByText("準備ができました", { exact: false }),
    ).toBeTruthy();
    await click(await findButton(INSTALL_LABEL));

    expect(installUpdate).toHaveBeenCalledTimes(1);
  });

  it("失敗は理由を出す", async () => {
    stubUpdate({ kind: "error", message: "更新を確認できませんでした" });

    render(<UpdateSettings />);

    expect(await screen.findByText("更新を確認できませんでした")).toBeTruthy();
  });

  it("開発版ではその旨を出し、チェックとボタンを無効にする", async () => {
    stubUpdate({ kind: "unsupported" });

    render(<UpdateSettings />);

    expect(
      await screen.findByText("開発版のため自動更新は動きません"),
    ).toBeTruthy();
    expect((await findSwitch()).disabled).toBe(true);
    expect((await findButton(CHECK_NOW_LABEL)).disabled).toBe(true);
  });

  it("main からの状態の変化を映し、外したら購読をやめる", async () => {
    const { emit, unsubscribe } = stubUpdate({
      kind: "idle",
      lastCheckedAt: null,
    });

    const { unmount } = render(<UpdateSettings />);
    await findSwitch();
    act(() => {
      emit(statusOf({ kind: "downloading", version: "2.2.0", percent: 7 }));
    });

    expect(await screen.findByText("v2.2.0 をダウンロード中 7%")).toBeTruthy();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("保存に失敗したら理由を出す", async () => {
    stubUpdate(
      { kind: "idle", lastCheckedAt: null },
      {
        saveAppSettings: vi.fn(() =>
          Promise.reject(new Error("書き込めません")),
        ),
      },
    );

    render(<UpdateSettings />);
    await click(await findSwitch());

    expect(screen.getByRole("alert").textContent).toContain("書き込めません");
    expect((await findSwitch()).checked).toBe(true);
  });
});
