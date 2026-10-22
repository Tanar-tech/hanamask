import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createChatEntry, listChatEntries } from "../../../src/main/db/chat-repo";
import { createNote } from "../../../src/main/db/notes-repo";
import {
  emitChatEntriesChanged,
  onChatEntriesChanged,
  onChatPresenceChanged,
} from "../../../src/main/mcp/change-emitter";
import { getChatPresence } from "../../../src/main/mcp/chat-waiters";
import { chatTools, findChatTool } from "../../../src/main/mcp/tools/chat";

const callTool = (
  name: string,
  args: unknown,
  signal?: AbortSignal,
): CallToolResult | Promise<CallToolResult> => {
  const tool = findChatTool(name);
  if (tool === undefined) throw new Error(`Tool not found: ${name}`);
  return tool.handler(args, signal);
};

const readPayload = (result: CallToolResult): Record<string, unknown> => {
  const [firstContent] = result.content;
  if (firstContent === undefined || firstContent.type !== "text") {
    throw new Error(`Tool result has no text content: ${JSON.stringify(result)}`);
  }
  const payload: unknown = JSON.parse(firstContent.text);
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("payload is not an object");
  }
  return { ...payload };
};

const readMessages = (result: CallToolResult): Record<string, unknown>[] => {
  const { messages } = readPayload(result);
  if (!Array.isArray(messages)) throw new Error("payload has no messages array");
  return messages.map((message: unknown) => {
    if (typeof message !== "object" || message === null) throw new Error("message is not an object");
    return { ...message };
  });
};

const postUserMessage = (entityId: string, body: string): void => {
  createChatEntry({ entityType: "note", entityId, sender: "user", body });
  emitChatEntriesChanged({ entityType: "note", entityId });
};

describe("mcp chat tools", () => {
  let dbFilePath: string;
  let noteId: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-chat-tools-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
    noteId = createNote({ title: "設計メモ", body: "本文", tags: [] }).id;
  });

  afterEach(() => {
    vi.useRealTimers();
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("3つのチャットツールを公開している", () => {
    expect(chatTools.map((tool) => tool.definition.name)).toEqual([
      "wait_for_chat_message",
      "reply_chat_message",
      "list_chat_messages",
    ]);
  });

  it("未配信の発言があれば待たずに返し、配信済みへ更新する", async () => {
    createChatEntry({ entityType: "note", entityId: noteId, sender: "user", body: "短くして" });

    const result = await callTool("wait_for_chat_message", {});

    expect(result.isError).toBeFalsy();
    const payload = readPayload(result);
    expect(payload.timed_out).toBe(false);
    const messages = readMessages(result);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.body).toBe("短くして");
    expect(messages[0]?.entityTitle).toBe("設計メモ");
    expect(messages[0]?.deliveredAt).not.toBeNull();
    expect(listChatEntries("note", noteId)[0]?.deliveredAt).not.toBeNull();
  });

  it("未配信が無いときは後から届いた発言で返る", async () => {
    const pending = callTool("wait_for_chat_message", { timeout_seconds: 45 });

    await Promise.resolve();
    postUserMessage(noteId, "あとから送った");

    const messages = readMessages(await pending);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.body).toBe("あとから送った");
  });

  it("待ち受けが時間切れになると空の結果を返し、エラーにしない", async () => {
    vi.useFakeTimers();
    const pending = callTool("wait_for_chat_message", { timeout_seconds: 1 });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result.isError).toBeFalsy();
    expect(readPayload(result).timed_out).toBe(true);
    expect(readMessages(result)).toEqual([]);
  });

  it("待ち受け中に中断されると空の結果で解け、待ち受け数が戻る", async () => {
    const controller = new AbortController();
    const pending = callTool("wait_for_chat_message", { timeout_seconds: 45 }, controller.signal);

    await Promise.resolve();
    expect(getChatPresence().waitingAgents).toBe(1);
    controller.abort();
    const result = await pending;

    expect(result.isError).toBeFalsy();
    expect(readPayload(result).timed_out).toBe(true);
    expect(getChatPresence().waitingAgents).toBe(0);
  });

  it("待ち受けの増減で在席が通知される", async () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    const unsubscribe = onChatPresenceChanged(listener);

    const pending = callTool("wait_for_chat_message", { timeout_seconds: 1 });
    await Promise.resolve();
    expect(listener).toHaveBeenCalledWith({ waitingAgents: 1 });

    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(listener).toHaveBeenLastCalledWith({ waitingAgents: 0 });
    unsubscribe();
  });

  it("2つの待ち受けが同時にいても発言は先着1つだけに届く", async () => {
    vi.useFakeTimers();
    const first = callTool("wait_for_chat_message", { timeout_seconds: 1 });
    const second = callTool("wait_for_chat_message", { timeout_seconds: 1 });
    await Promise.resolve();

    postUserMessage(noteId, "1体だけに届く");

    expect(readMessages(await first)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    const secondResult = await second;
    expect(readMessages(secondResult)).toEqual([]);
    expect(readPayload(secondResult).timed_out).toBe(true);
  });

  it("timeout_seconds が上限を超えても丸めて受け付ける", async () => {
    vi.useFakeTimers();
    const pending = callTool("wait_for_chat_message", { timeout_seconds: 999 });

    await vi.advanceTimersByTimeAsync(45_000);

    expect(readPayload(await pending).timed_out).toBe(true);
  });

  it("timeout_seconds が整数でなければエラー結果を返す", async () => {
    const result = await callTool("wait_for_chat_message", { timeout_seconds: 0 });

    expect(result.isError).toBe(true);
  });

  it("reply_chat_message は返信を保存し、変更を通知する", async () => {
    const listener = vi.fn();
    const unsubscribe = onChatEntriesChanged(listener);

    const result = await callTool("reply_chat_message", {
      entity_type: "note",
      entity_id: noteId,
      body: "3段落を1段落にまとめました",
    });

    expect(result.isError).toBeFalsy();
    expect(listener).toHaveBeenCalledWith({ entityType: "note", entityId: noteId });
    const stored = listChatEntries("note", noteId);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.sender).toBe("agent");
    expect(stored[0]?.body).toBe("3段落を1段落にまとめました");
    unsubscribe();
  });

  it("reply_chat_message は対象が無ければエラー結果を返し、通知しない", async () => {
    const listener = vi.fn();
    const unsubscribe = onChatEntriesChanged(listener);

    const result = await callTool("reply_chat_message", {
      entity_type: "note",
      entity_id: "missing-id",
      body: "返信",
    });

    expect(result.isError).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("list_chat_messages は新しい方から切り、古い順で返す", async () => {
    ["1件目", "2件目", "3件目"].forEach((body) => {
      createChatEntry({ entityType: "note", entityId: noteId, sender: "user", body });
    });

    const messages = readMessages(
      await callTool("list_chat_messages", { entity_type: "note", entity_id: noteId, limit: 2 }),
    );

    expect(messages.map((message) => message.body)).toEqual(["2件目", "3件目"]);
  });

  it("list_chat_messages は対象が違えば空を返す", async () => {
    createChatEntry({ entityType: "note", entityId: noteId, sender: "user", body: "本文" });

    const messages = readMessages(
      await callTool("list_chat_messages", { entity_type: "note", entity_id: "other" }),
    );

    expect(messages).toEqual([]);
  });
});
