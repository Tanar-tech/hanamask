import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, openDb } from "../../../src/main/db/db";
import { searchNotes } from "../../../src/main/db/notes-repo";
import {
  chatToolDefinitions,
  runChatTurn,
  type ChatAssistantReply,
  type ChatModelClient,
} from "../../../src/main/chat/agent-loop";
import type { ChatEvent, ChatMessage } from "../../../src/shared/preload-api";

vi.mock("electron", () => ({ app: { getPath: () => "/tmp" } }));

// 実APIキー無しでテストが通ることを担保するため、モデルへの口だけを差し替える。
const clientReturning = (replies: ChatAssistantReply[]): ChatModelClient & { calls: number } => {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    send: async () => {
      const reply = replies[calls] ?? { text: "", toolUses: [], stopReason: "end_turn" };
      calls += 1;
      return reply;
    },
  };
};

const collect = (): { events: ChatEvent[]; onEvent: (event: ChatEvent) => void } => {
  const events: ChatEvent[] = [];
  return { events, onEvent: (event) => events.push(event) };
};

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hanamask-chat-loop-"));
  openDb(join(dir, "hanamask.sqlite3"));
});

afterEach(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("chat agent loop", () => {
  it("MCPツールをそのままモデルへ渡す", () => {
    const names = chatToolDefinitions().map((tool) => tool.name);

    // CLIエージェントとチャットで呼べる操作が食い違わないことの担保。
    expect(names).toContain("create_note");
    expect(names).toContain("create_task");
    expect(names).toContain("link_entities");
    expect(names).toContain("open_note");
  });

  it("ツール要求が無ければ1往復で終わる", async () => {
    const client = clientReturning([{ text: "こんにちは", toolUses: [], stopReason: "end_turn" }]);
    const { events, onEvent } = collect();

    await runChatTurn({ client, model: "m", history: [], userText: "やあ", onEvent });

    expect(client.calls).toBe(1);
    expect(events).toEqual([{ kind: "assistant-text", text: "こんにちは" }]);
  });

  it("要求されたツールを実行し、結果を添えてモデルへ返す", async () => {
    const client = clientReturning([
      {
        text: "",
        toolUses: [
          { id: "t1", name: "create_note", input: { title: "会議メモ", body: "本文", tags: [] } },
        ],
        stopReason: "tool_use",
      },
      { text: "作成しました", toolUses: [], stopReason: "end_turn" },
    ]);
    const { events, onEvent } = collect();

    await runChatTurn({ client, model: "m", history: [], userText: "メモして", onEvent });

    // 実際にDBへ書かれていること（＝本物のMCPツールが動いたこと）を確認する。
    expect(searchNotes("会議メモ")).toHaveLength(1);
    expect(client.calls).toBe(2);
    expect(events.map((event) => event.kind)).toEqual([
      "tool-started",
      "tool-finished",
      "assistant-text",
    ]);
  });

  it("非同期ハンドラのツールも結果を返して会話が進む", async () => {
    const client = clientReturning([
      {
        text: "",
        // semantic_search_notes は埋め込みの取得を待つため handler が Promise を返す。
        toolUses: [{ id: "t1", name: "semantic_search_notes", input: { query: "過去の経緯" } }],
        stopReason: "tool_use",
      },
      { text: "探しました", toolUses: [], stopReason: "end_turn" },
    ]);
    const { events, onEvent } = collect();

    await runChatTurn({ client, model: "m", history: [], userText: "探して", onEvent });

    const finished = events.find((event) => event.kind === "tool-finished");
    // Promise がそのまま文字列化されると "[object Promise]" になるので、中身で確かめる。
    expect(finished?.detail).toContain("notes");
    expect(events.at(-1)).toEqual({ kind: "assistant-text", text: "探しました" });
  });

  it("知らないツール名を要求されても会話を止めない", async () => {
    const client = clientReturning([
      { text: "", toolUses: [{ id: "t1", name: "make_coffee", input: {} }], stopReason: "tool_use" },
      { text: "できませんでした", toolUses: [], stopReason: "end_turn" },
    ]);
    const { events, onEvent } = collect();

    await runChatTurn({ client, model: "m", history: [], userText: "コーヒーを", onEvent });

    const failed = events.find((event) => event.kind === "tool-failed");
    expect(failed?.detail).toContain("存在しません");
    expect(client.calls).toBe(2);
  });

  it("ツールが失敗しても会話を続けられる", async () => {
    const client = clientReturning([
      {
        text: "",
        // 必須のtitleが無いのでハンドラ側で弾かれる。
        toolUses: [{ id: "t1", name: "create_note", input: {} }],
        stopReason: "tool_use",
      },
      { text: "入力が足りませんでした", toolUses: [], stopReason: "end_turn" },
    ]);
    const { events, onEvent } = collect();

    await runChatTurn({ client, model: "m", history: [], userText: "メモして", onEvent });

    expect(events.some((event) => event.kind === "tool-failed")).toBe(true);
    expect(events.at(-1)).toEqual({ kind: "assistant-text", text: "入力が足りませんでした" });
  });

  /*
   * モデルがツールを要求し続けた場合に無限に往復しないことの担保。
   * 打ち切らないとAPI費用が利用者に青天井で請求される。
   */
  it("ツールの往復が続いても打ち切る", async () => {
    const endless: ChatModelClient = {
      send: async () => ({
        text: "",
        toolUses: [{ id: "t", name: "list_tasks", input: {} }],
        stopReason: "tool_use",
      }),
    };
    const { events, onEvent } = collect();

    await runChatTurn({ client: endless, model: "m", history: [], userText: "繰り返して", onEvent });

    expect(events.at(-1)?.detail).toContain("打ち切りました");
  });

  it("会話の履歴を引き継いでモデルへ渡す", async () => {
    const seen: unknown[] = [];
    const client: ChatModelClient = {
      send: async ({ messages }) => {
        seen.push(messages);
        return { text: "はい", toolUses: [], stopReason: "end_turn" };
      },
    };

    const history: ChatMessage[] = [
      { role: "user", content: [{ type: "text", text: "前の発言" }] },
    ];
    const next = await runChatTurn({
      client,
      model: "m",
      history,
      userText: "続き",
      onEvent: () => {},
    });

    expect(next[0]).toEqual(history[0]);
    expect(next).toHaveLength(3);
  });
});
