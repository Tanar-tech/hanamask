/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { StartupSettings } from "../../src/renderer/components/StartupSettings";
import { UpdateSettings } from "../../src/renderer/components/UpdateSettings";
import { stubHanamask } from "./hanamask-stub";
import type { AppSettings, UpdateStatus } from "../../src/shared/preload-api";

const QUIT_ON_CLOSE_LABEL = "ウィンドウを閉じたら終了する";
const AUTO_UPDATE_LABEL = "更新を自動で確認する";

const IDLE_UPDATE: UpdateStatus = {
  currentVersion: "2.2.0",
  state: { kind: "idle", lastCheckedAt: null },
};

const toggle = async (name: string): Promise<void> => {
  const box = await screen.findByRole<HTMLInputElement>("checkbox", { name });
  await act(async () => {
    box.click();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("設定画面の欄どうし", () => {
  it("片方の欄で変えた項目を、もう片方の欄の保存で巻き戻さない", async () => {
    let stored: AppSettings = { closeToTray: true, openAtLogin: false, autoUpdate: true };
    const saveAppSettings = vi.fn(async (next: AppSettings) => {
      stored = next;
      return next;
    });
    stubHanamask({
      readAppSettings: vi.fn(async () => stored),
      saveAppSettings,
      readUpdateStatus: vi.fn(async () => IDLE_UPDATE),
    });

    render(
      <>
        <StartupSettings />
        <UpdateSettings />
      </>,
    );

    await toggle(QUIT_ON_CLOSE_LABEL);
    await toggle(AUTO_UPDATE_LABEL);

    expect(saveAppSettings).toHaveBeenLastCalledWith({
      closeToTray: false,
      openAtLogin: false,
      autoUpdate: false,
    });
  });
});
