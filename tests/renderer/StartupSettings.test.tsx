/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { StartupSettings } from "../../src/renderer/components/StartupSettings";
import { stubHanamask } from "./hanamask-stub";
import type { AppSettings } from "../../src/shared/preload-api";

const OPEN_AT_LOGIN_LABEL = "パソコンの起動時に hanamask を開始する";
const QUIT_ON_CLOSE_LABEL = "ウィンドウを閉じたら終了する";

const RESIDENT: AppSettings = { closeToTray: true, openAtLogin: false };

const findSwitch = (name: string): Promise<HTMLInputElement> =>
  screen.findByRole<HTMLInputElement>("checkbox", { name });

const toggle = async (name: string): Promise<void> => {
  const box = await findSwitch(name);
  await act(async () => {
    box.click();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StartupSettings", () => {
  it("保存済みの設定をスイッチに映す", async () => {
    stubHanamask({
      readActivity: vi.fn(async () => ({ lastRecordedAt: null, recentCount: 0 })),
      readMcpEndpoint: vi.fn(async () => ({ port: 39217, url: "http://127.0.0.1:39217/mcp" })),
      readAppSettings: vi.fn(async () => ({ closeToTray: true, openAtLogin: true })),
    });

    render(<StartupSettings />);

    expect((await findSwitch(OPEN_AT_LOGIN_LABEL)).checked).toBe(true);
    expect((await findSwitch(QUIT_ON_CLOSE_LABEL)).checked).toBe(false);
  });

  /* 「閉じたら終了する」は closeToTray の反転。取り違えると常駐が黙って無効になる。 */
  it("closeToTray が false のとき「閉じたら終了する」がオンになる", async () => {
    stubHanamask({
      readAppSettings: vi.fn(async () => ({ closeToTray: false, openAtLogin: false })),
    });

    render(<StartupSettings />);

    expect((await findSwitch(QUIT_ON_CLOSE_LABEL)).checked).toBe(true);
  });

  it("自動起動を切り替えると保存する", async () => {
    const saveAppSettings = vi.fn(async (settings: AppSettings) => settings);
    stubHanamask({ readAppSettings: vi.fn(async () => RESIDENT), saveAppSettings });

    render(<StartupSettings />);
    await toggle(OPEN_AT_LOGIN_LABEL);

    expect(saveAppSettings).toHaveBeenCalledWith({ closeToTray: true, openAtLogin: true });
    expect((await findSwitch(OPEN_AT_LOGIN_LABEL)).checked).toBe(true);
  });

  it("「閉じたら終了する」をオンにすると closeToTray を false で保存する", async () => {
    const saveAppSettings = vi.fn(async (settings: AppSettings) => settings);
    stubHanamask({ readAppSettings: vi.fn(async () => RESIDENT), saveAppSettings });

    render(<StartupSettings />);
    await toggle(QUIT_ON_CLOSE_LABEL);

    expect(saveAppSettings).toHaveBeenCalledWith({ closeToTray: false, openAtLogin: false });
    expect((await findSwitch(QUIT_ON_CLOSE_LABEL)).checked).toBe(true);
  });

  it("保存の返り値をスイッチに映す", async () => {
    stubHanamask({
      readAppSettings: vi.fn(async () => RESIDENT),
      // main側が要求を通さず据え置いた場合、画面も据え置きに戻る必要がある。
      saveAppSettings: vi.fn(async () => RESIDENT),
    });

    render(<StartupSettings />);
    await toggle(OPEN_AT_LOGIN_LABEL);

    expect((await findSwitch(OPEN_AT_LOGIN_LABEL)).checked).toBe(false);
  });

  it("保存に失敗したら理由を出し、スイッチを戻す", async () => {
    stubHanamask({
      readAppSettings: vi.fn(async () => RESIDENT),
      saveAppSettings: vi.fn(() => Promise.reject(new Error("ログイン項目を書き換えられません"))),
    });

    render(<StartupSettings />);
    await toggle(OPEN_AT_LOGIN_LABEL);

    expect(screen.getByRole("alert").textContent).toContain("ログイン項目を書き換えられません");
    expect((await findSwitch(OPEN_AT_LOGIN_LABEL)).checked).toBe(false);
  });

  it("読み込みに失敗したら理由を出す", async () => {
    stubHanamask({
      readAppSettings: vi.fn(() => Promise.reject(new Error("設定ファイルが読めません"))),
    });

    render(<StartupSettings />);

    expect((await screen.findByRole("alert")).textContent).toContain("設定ファイルが読めません");
  });
});
