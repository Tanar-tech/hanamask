/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPanel } from "../../src/renderer/components/ChatPanel";
import type { ChatEvent, ChatMessage } from "../../src/shared/preload-api";

interface Overrides {
  sendChatMessage?: (history: ChatMessage[], userText: string) => Promise<ChatMessage[]>;
}

const mockHanamask = (overrides: Overrides = {}) => {
  const listeners: Array<(event: ChatEvent) => void> = [];
  const sendChatMessage = vi.fn(overrides.sendChatMessage ?? (async () => []));
  const abortChat = vi.fn(async () => {});
  window.hanamask = {
    deleteTask: vi.fn(async () => {}),
    listDeletedTasks: vi.fn(async () => []),
    restoreTask: vi.fn(async () => null),
    sendChatMessage,
    abortChat,
    onChatEvent: (callback: (event: ChatEvent) => void) => {
      listeners.push(callback);
      return () => listeners.splice(listeners.indexOf(callback), 1);
    },
  } as unknown as typeof window.hanamask;
  const emit = async (event: ChatEvent): Promise<void> => {
    await act(async () => {
      listeners.forEach((listener) => listener(event));
    });
  };
  return { sendChatMessage, abortChat, emit };
};

const typeAndSend = async (text: string): Promise<void> => {
  fireEvent.change(screen.getByLabelText("メッセージ"), { target: { value: text } });
  await act(async () => {
    screen.getByRole("button", { name: "送信" }).click();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChatPanel", () => {
  it("送信すると発言が並びmainへ渡す", async () => {
    const { sendChatMessage } = mockHanamask();

    render(<ChatPanel onOpenSettings={vi.fn()} />);
    await typeAndSend("メモして");

    expect(sendChatMessage).toHaveBeenCalledWith([], "メモして");
    expect(screen.getByText("メモして")).toBeTruthy();
  });

  it("空のままでは送信できない", async () => {
    const { sendChatMessage } = mockHanamask();

    render(<ChatPanel onOpenSettings={vi.fn()} />);

    expect((screen.getByRole("button", { name: "送信" }) as HTMLButtonElement).disabled).toBe(true);
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it("エージェントの発言を表示する", async () => {
    const { emit } = mockHanamask();

    render(<ChatPanel onOpenSettings={vi.fn()} />);
    await emit({ kind: "assistant-text", text: "作成しました" });

    expect(screen.getByText("作成しました")).toBeTruthy();
  });

  /*
   * 実行中の行を結果で置き換える。行を積み増すと、1つのツールが2行に見えて
   * 「何回実行されたのか」が読めなくなる。
   */
  it("ツールの実行中表示を結果で置き換える", async () => {
    const { emit } = mockHanamask();

    render(<ChatPanel onOpenSettings={vi.fn()} />);
    await emit({ kind: "tool-started", toolName: "create_note" });
    expect(screen.getByText("create_note を実行しています")).toBeTruthy();

    await emit({ kind: "tool-finished", toolName: "create_note" });

    expect(screen.queryByText("create_note を実行しています")).toBeNull();
    expect(screen.getByText("create_note を実行しました")).toBeTruthy();
  });

  it("ツールの失敗を区別して表示する", async () => {
    const { emit } = mockHanamask();

    render(<ChatPanel onOpenSettings={vi.fn()} />);
    await emit({ kind: "tool-started", toolName: "delete_note" });
    await emit({ kind: "tool-failed", toolName: "delete_note" });

    expect(screen.getByText("delete_note が失敗しました")).toBeTruthy();
  });

  /*
   * APIキー未設定は「直せば解決する」ので、エラー文言ではなく設定への導線を出す。
   */
  it("APIキー未設定のときは設定への導線を出す", async () => {
    const onOpenSettings = vi.fn();
    mockHanamask({
      sendChatMessage: async () => {
        throw new Error("APIキーが未設定です。設定画面で入力してください。");
      },
    });

    render(<ChatPanel onOpenSettings={onOpenSettings} />);
    await typeAndSend("やあ");
    await act(async () => {
      screen.getByRole("button", { name: "設定を開く" }).click();
    });

    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("APIキー以外の失敗はそのまま表示する", async () => {
    mockHanamask({
      sendChatMessage: async () => {
        throw new Error("接続に失敗しました");
      },
    });

    render(<ChatPanel onOpenSettings={vi.fn()} />);
    await typeAndSend("やあ");

    expect(screen.getByText(/接続に失敗しました/)).toBeTruthy();
  });

  it("送信中は中止ボタンを出し、取り消せないことを明記する", async () => {
    let resolveSend: ((messages: ChatMessage[]) => void) | undefined;
    const { abortChat } = mockHanamask({
      sendChatMessage: () =>
        new Promise<ChatMessage[]>((resolve) => {
          resolveSend = resolve;
        }),
    });

    render(<ChatPanel onOpenSettings={vi.fn()} />);
    await typeAndSend("長い依頼");

    expect(screen.getByText(/すでに実行されたツールは取り消されません/)).toBeTruthy();
    await act(async () => {
      screen.getByRole("button", { name: "中止する" }).click();
    });
    expect(abortChat).toHaveBeenCalled();

    await act(async () => {
      resolveSend?.([]);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "送信" })).toBeTruthy();
    });
  });

  it("会話の履歴を次の送信へ引き継ぐ", async () => {
    const history: ChatMessage[] = [{ role: "user", content: [{ type: "text", text: "前" }] }];
    const { sendChatMessage } = mockHanamask({ sendChatMessage: async () => history });

    render(<ChatPanel onOpenSettings={vi.fn()} />);
    await typeAndSend("1回目");
    await typeAndSend("2回目");

    expect(sendChatMessage).toHaveBeenLastCalledWith(history, "2回目");
  });

  it("課金が利用者持ちであることを明示する", () => {
    mockHanamask();

    render(<ChatPanel onOpenSettings={vi.fn()} />);

    expect(screen.getByText(/ご自身のアカウントに課金されます/)).toBeTruthy();
  });
});
