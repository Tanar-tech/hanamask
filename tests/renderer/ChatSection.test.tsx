/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatSection } from "../../src/renderer/components/ChatSection";
import type {
  ChatEntriesChange,
  ChatEntry,
  ChatPresence,
  EntityType,
} from "../../src/shared/preload-api";
import { stubHanamask } from "./hanamask-stub";

const makeEntry = (overrides: Partial<ChatEntry> = {}): ChatEntry => ({
  id: "chat-1",
  entityType: "note",
  entityId: "note-1",
  sender: "user",
  body: "この節をもう少し短くして",
  createdAt: "2026-08-29T10:02:00.000Z",
  deliveredAt: "2026-08-29T10:02:01.000Z",
  ...overrides,
});

interface ChatApiOverrides {
  entries?: ChatEntry[];
  presence?: ChatPresence;
  postChatEntry?: (entityType: EntityType, entityId: string, body: string) => Promise<ChatEntry>;
}

const mockHanamask = (overrides: ChatApiOverrides = {}) => {
  const listChatEntries = vi.fn(async () => overrides.entries ?? []);
  const postChatEntry = vi.fn(
    overrides.postChatEntry ?? (async () => makeEntry({ id: "chat-posted" })),
  );
  const getChatPresence = vi.fn(async () => overrides.presence ?? { waitingAgents: 0 });
  const entriesListeners: Array<(change: ChatEntriesChange) => void> = [];
  const presenceListeners: Array<(presence: ChatPresence) => void> = [];
  const unsubscribeEntries = vi.fn();
  const onChatEntriesChanged = vi.fn((callback: (change: ChatEntriesChange) => void) => {
    entriesListeners.push(callback);
    return unsubscribeEntries;
  });
  const onChatPresenceChanged = vi.fn((callback: (presence: ChatPresence) => void) => {
    presenceListeners.push(callback);
    return () => {};
  });
  stubHanamask({
    listChatEntries,
    postChatEntry,
    getChatPresence,
    onChatEntriesChanged,
    onChatPresenceChanged,
  });
  const emitEntriesChanged = async (change: ChatEntriesChange): Promise<void> => {
    await act(async () => {
      entriesListeners.forEach((listener) => {
        listener(change);
      });
    });
  };
  const emitPresenceChanged = async (presence: ChatPresence): Promise<void> => {
    await act(async () => {
      presenceListeners.forEach((listener) => {
        listener(presence);
      });
    });
  };
  return {
    listChatEntries,
    postChatEntry,
    getChatPresence,
    unsubscribeEntries,
    emitEntriesChanged,
    emitPresenceChanged,
  };
};

const renderSection = async (): Promise<void> => {
  render(<ChatSection entityType="note" entityId="note-1" />);
  await screen.findByRole("region", { name: "チャット" });
};

const typeDraft = (text: string): void => {
  fireEvent.change(screen.getByLabelText("メッセージ"), { target: { value: text } });
};

afterEach(() => {
  cleanup();
});

describe("ChatSection", () => {
  it("対象のチャットを読み込んで発言者ごとに並べる", async () => {
    mockHanamask({
      entries: [
        makeEntry({ id: "chat-1", sender: "user", body: "短くして" }),
        makeEntry({ id: "chat-2", sender: "agent", body: "**まとめました**" }),
      ],
    });
    await renderSection();

    expect(await screen.findByText("短くして")).toBeTruthy();
    expect(screen.getByText("あなた")).toBeTruthy();
    expect(screen.getByText("エージェント")).toBeTruthy();
    // エージェントの返信はMarkdownとして描かれる。
    expect(screen.getByText("まとめました").tagName).toBe("STRONG");
  });

  it("送信すると postChatEntry が呼ばれ入力が空になる", async () => {
    const api = mockHanamask();
    await renderSection();

    typeDraft("  この節を短くして  ");
    fireEvent.click(screen.getByRole("button", { name: "送信" }));

    await waitFor(() => {
      expect(api.postChatEntry).toHaveBeenCalledWith("note", "note-1", "この節を短くして");
    });
    await waitFor(() => {
      expect(screen.getByLabelText("メッセージ")).toHaveProperty("value", "");
    });
  });

  it("Ctrl+Enter でも送信できる", async () => {
    const api = mockHanamask();
    await renderSection();

    typeDraft("送るよ");
    fireEvent.keyDown(screen.getByLabelText("メッセージ"), { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(api.postChatEntry).toHaveBeenCalledWith("note", "note-1", "送るよ");
    });
  });

  it("空白だけの入力では送信できない", async () => {
    const api = mockHanamask();
    await renderSection();

    const send = screen.getByRole("button", { name: "送信" });
    expect(send.hasAttribute("disabled")).toBe(true);

    typeDraft("   ");
    fireEvent.keyDown(screen.getByLabelText("メッセージ"), { key: "Enter", ctrlKey: true });

    expect(screen.getByRole("button", { name: "送信" }).hasAttribute("disabled")).toBe(true);
    expect(api.postChatEntry).not.toHaveBeenCalled();
  });

  it("待ち受けが0のときは不在の案内を出す", async () => {
    mockHanamask({ presence: { waitingAgents: 0 } });
    await renderSection();

    expect(await screen.findByText("接続中のエージェントがいません")).toBeTruthy();
    expect(
      screen.getByText(
        "接続中のエージェントがいません。メッセージは保存され、次に待ち受けたときに届きます。",
      ),
    ).toBeTruthy();
  });

  it("待ち受け中は在席を示し、在席イベントで切り替わる", async () => {
    const api = mockHanamask({ presence: { waitingAgents: 1 } });
    await renderSection();

    expect(await screen.findByText("エージェントが待機中")).toBeTruthy();

    await api.emitPresenceChanged({ waitingAgents: 0 });
    expect(screen.getByText("接続中のエージェントがいません")).toBeTruthy();
  });

  it("未配信の利用者メッセージにだけ未配信の印を出す", async () => {
    mockHanamask({
      entries: [
        makeEntry({ id: "chat-1", sender: "user", deliveredAt: null }),
        makeEntry({ id: "chat-2", sender: "user", body: "届いた", deliveredAt: "2026-08-29T10:03:00.000Z" }),
        makeEntry({ id: "chat-3", sender: "agent", body: "返信", deliveredAt: null }),
      ],
    });
    await renderSection();

    await screen.findByText("届いた");
    expect(screen.getAllByText("未配信")).toHaveLength(1);
  });

  it("自分の対象の変更イベントで取り直す", async () => {
    const api = mockHanamask();
    await renderSection();
    await waitFor(() => {
      expect(api.listChatEntries).toHaveBeenCalledTimes(1);
    });

    await api.emitEntriesChanged({ entityType: "note", entityId: "note-1" });

    await waitFor(() => {
      expect(api.listChatEntries).toHaveBeenCalledTimes(2);
    });
  });

  it("他の対象の変更イベントでは取り直さない", async () => {
    const api = mockHanamask();
    await renderSection();
    await waitFor(() => {
      expect(api.listChatEntries).toHaveBeenCalledTimes(1);
    });

    await api.emitEntriesChanged({ entityType: "note", entityId: "note-2" });
    await api.emitEntriesChanged({ entityType: "task", entityId: "note-1" });

    expect(api.listChatEntries).toHaveBeenCalledTimes(1);
  });

  it("読み込みに失敗したらエラーを見せる", async () => {
    stubHanamask({
      listChatEntries: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    render(<ChatSection entityType="note" entityId="note-1" />);

    expect((await screen.findByRole("alert")).textContent).toContain("チャットの読み込みに失敗");
  });

  it("片付けで変更イベントの購読を解除する", async () => {
    const api = mockHanamask();
    await renderSection();
    cleanup();

    expect(api.unsubscribeEntries).toHaveBeenCalled();
  });
});
