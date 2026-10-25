/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { UpdateBanner } from "../../src/renderer/components/UpdateBanner";
import { stubHanamask } from "./hanamask-stub";
import type {
  HanamaskPreloadApi,
  UpdateState,
  UpdateStatus,
} from "../../src/shared/preload-api";

const BANNER_NAME = "更新の準備";
const INSTALL_LABEL = "再起動して更新";
const LATER_LABEL = "あとで";

const statusOf = (state: UpdateState): UpdateStatus => ({
  currentVersion: "2.1.1",
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
    readUpdateStatus: vi.fn(async () => statusOf(state)),
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

const flush = async (): Promise<void> => {
  await act(async () => {});
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UpdateBanner", () => {
  it("準備ができたときだけ版を添えて出る", async () => {
    stubUpdate({ kind: "downloaded", version: "2.2.0" });

    render(<UpdateBanner />);

    const banner = await screen.findByRole("status", { name: BANNER_NAME });
    expect(banner.textContent).toContain(
      "新しい版 v2.2.0 の準備ができました。",
    );
    expect(banner.textContent).toContain("次に hanamask を終了したとき");
  });

  it.each<UpdateState>([
    { kind: "unsupported" },
    { kind: "idle", lastCheckedAt: null },
    { kind: "checking" },
    { kind: "downloading", version: "2.2.0", percent: 50 },
    { kind: "error", message: "更新を確認できませんでした" },
  ])("$kind のときは出ない", async (state) => {
    stubUpdate(state);

    render(<UpdateBanner />);
    await flush();

    expect(screen.queryByRole("status", { name: BANNER_NAME })).toBeNull();
  });

  it("ダウンロードが終わった知らせで現れる", async () => {
    const { emit } = stubUpdate({
      kind: "downloading",
      version: "2.2.0",
      percent: 99,
    });

    render(<UpdateBanner />);
    await flush();
    act(() => {
      emit(statusOf({ kind: "downloaded", version: "2.2.0" }));
    });

    expect(
      await screen.findByRole("status", { name: BANNER_NAME }),
    ).toBeTruthy();
  });

  it("「再起動して更新」で入れ替える", async () => {
    const installUpdate = vi.fn(async () => {});
    stubUpdate({ kind: "downloaded", version: "2.2.0" }, { installUpdate });

    render(<UpdateBanner />);
    const button = await screen.findByRole("button", { name: INSTALL_LABEL });
    await act(async () => {
      button.click();
    });

    expect(installUpdate).toHaveBeenCalledTimes(1);
  });

  it("「あとで」で隠し、入れ替えはしない", async () => {
    const installUpdate = vi.fn(async () => {});
    stubUpdate({ kind: "downloaded", version: "2.2.0" }, { installUpdate });

    render(<UpdateBanner />);
    const button = await screen.findByRole("button", { name: LATER_LABEL });
    act(() => {
      button.click();
    });

    expect(screen.queryByRole("status", { name: BANNER_NAME })).toBeNull();
    expect(installUpdate).not.toHaveBeenCalled();
  });

  it("外したら購読をやめる", async () => {
    const { unsubscribe } = stubUpdate({ kind: "idle", lastCheckedAt: null });

    const { unmount } = render(<UpdateBanner />);
    await flush();
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
