/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatSettings } from "../../src/renderer/components/ChatSettings";
import type { ChatSettings as Settings } from "../../src/shared/preload-api";

const API_KEY = "sk-ant-api03-secret-value-4f2a";

interface Overrides {
  readChatSettings?: () => Promise<Settings>;
  saveChatApiKey?: (apiKey: string) => Promise<Settings>;
}

const mockHanamask = (overrides: Overrides = {}) => {
  const readChatSettings = vi.fn(
    overrides.readChatSettings ??
      (async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" }) as Settings),
  );
  const saveChatApiKey = vi.fn(
    overrides.saveChatApiKey ??
      (async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" }) as Settings),
  );
  const clearChatApiKey = vi.fn(
    async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" }) as Settings,
  );
  const saveChatModel = vi.fn(async (model: string) => ({ apiKeyMask: "4f2a", model }) as Settings);
  window.hanamask = {
    deleteTask: vi.fn(async () => {}),
    listDeletedTasks: vi.fn(async () => []),
    restoreTask: vi.fn(async () => null),
    readChatSettings,
    saveChatApiKey,
    clearChatApiKey,
    saveChatModel,
  } as unknown as typeof window.hanamask;
  return { readChatSettings, saveChatApiKey, clearChatApiKey, saveChatModel };
};

const clickButton = async (name: string): Promise<void> => {
  const button = await screen.findByRole("button", { name });
  await act(async () => {
    button.click();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChatSettings", () => {
  it("未設定のときは案内を出す", async () => {
    mockHanamask();

    render(<ChatSettings />);

    expect(await screen.findByText(/APIキーが未設定です/)).toBeTruthy();
  });

  it("入力したAPIキーを保存する", async () => {
    const { saveChatApiKey } = mockHanamask();

    render(<ChatSettings />);
    await clickButton("入力する");
    fireEvent.change(await screen.findByLabelText("Anthropic APIキー"), {
      target: { value: API_KEY },
    });
    await clickButton("保存");

    expect(saveChatApiKey).toHaveBeenCalledWith(API_KEY);
  });

  /*
   * 保存後にキー全体が画面へ残っていると、肩越しに見られただけで漏れる。
   * 末尾4文字しか出さないことをここで固定する。
   */
  it("保存後はキー全体を画面に出さない", async () => {
    mockHanamask({
      readChatSettings: async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" }),
    });

    render(<ChatSettings />);

    await screen.findByText(/4f2a$/);
    expect(document.body.textContent).not.toContain(API_KEY);
    expect(document.body.textContent).not.toContain("secret-value");
  });

  it("入力中のキーは伏せ字にする", async () => {
    mockHanamask();

    render(<ChatSettings />);
    await clickButton("入力する");

    expect((await screen.findByLabelText("Anthropic APIキー")).getAttribute("type")).toBe(
      "password",
    );
  });

  it("空のまま保存はできない", async () => {
    const { saveChatApiKey } = mockHanamask();

    render(<ChatSettings />);
    await clickButton("入力する");
    const save = await screen.findByRole("button", { name: "保存" });

    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(saveChatApiKey).not.toHaveBeenCalled();
  });

  /*
   * safeStorageが使えない環境ではmain側が保存を断る。利用者には「保存できなかった」
   * ことと理由が伝わる必要がある（黙って成功したように見せない）。
   */
  it("保存を断られたら理由をそのまま表示する", async () => {
    mockHanamask({
      saveChatApiKey: async () => {
        throw new Error("この環境ではOSのセキュアストレージを利用できないため、保存できません");
      },
    });

    render(<ChatSettings />);
    await clickButton("入力する");
    fireEvent.change(await screen.findByLabelText("Anthropic APIキー"), {
      target: { value: API_KEY },
    });
    await clickButton("保存");

    expect((await screen.findByRole("alert")).textContent).toContain("セキュアストレージ");
  });

  it("削除は確認してから実行する", async () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    const { clearChatApiKey } = mockHanamask({
      readChatSettings: async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" }),
    });

    render(<ChatSettings />);
    await clickButton("削除");

    expect(confirmMock).toHaveBeenCalled();
    expect(clearChatApiKey).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("モデルを変えると保存する", async () => {
    const { saveChatModel } = mockHanamask({
      readChatSettings: async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" }),
    });

    render(<ChatSettings />);
    fireEvent.change(await screen.findByLabelText("モデル"), {
      target: { value: "claude-opus-4-5" },
    });

    await waitFor(() => {
      expect(saveChatModel).toHaveBeenCalledWith("claude-opus-4-5");
    });
  });

  it("課金が利用者持ちであることを明示する", async () => {
    mockHanamask();

    render(<ChatSettings />);

    expect(await screen.findByText(/ご自身のAnthropic/)).toBeTruthy();
  });
});
