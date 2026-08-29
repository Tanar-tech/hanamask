import {
  createChatEntry,
  listChatEntries,
  type ChatEntryWithTitle,
} from "../../db/chat-repo.js";
import { toEntityType } from "../../db/links-repo.js";
import { emitChatEntriesChanged } from "../change-emitter.js";
import { waitForChatEntries } from "../chat-waiters.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EntityType } from "../../../shared/preload-api.js";
import {
  ENTITY_TYPE_SCHEMA,
  jsonResult,
  readString,
  toToolHandler,
  type McpTool,
} from "./shared.js";

const MS_PER_SECOND = 1000;
const DEFAULT_TIMEOUT_SECONDS = 30;
// MCPクライアント既定のリクエスト期限は60秒で、サーバーからは延長できない。切れる前に返す。
const MAX_TIMEOUT_SECONDS = 45;
const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 200;

const readBoundedInteger = (
  args: Record<string, unknown>,
  key: string,
  fallback: number,
  max: number,
): number => {
  const value = args[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`"${key}" must be a positive integer`);
  }
  // 上限を知らずに大きな数を送ってきても失敗させず、丸めて受ける。
  return Math.min(value, max);
};

const readEntityType = (args: Record<string, unknown>, key: string): EntityType =>
  toEntityType(args[key]);

const waitResult = (messages: ChatEntryWithTitle[]): CallToolResult =>
  jsonResult({ messages, timed_out: messages.length === 0 });

const waitForChatMessageTool: McpTool = {
  definition: {
    name: "wait_for_chat_message",
    description:
      "Wait for the user to send you a message from the chat box on a page, task or notebook in the app. " +
      "Call this at the end of a piece of work so the user can steer you without opening a terminal. " +
      "Messages already waiting come back immediately; otherwise the call blocks until one arrives or the timeout passes. " +
      "Each message names the entity it belongs to (entityType, entityId, entityTitle) — read that entity before answering. " +
      "An empty result with `timed_out: true` is normal and not an error: unless you have a reason to stop, just call this again. " +
      "Answer with reply_chat_message and do the requested work with the other tools.",
    inputSchema: {
      type: "object",
      properties: {
        timeout_seconds: {
          type: "integer",
          description: `How long to wait before returning an empty result (default ${DEFAULT_TIMEOUT_SECONDS}, max ${MAX_TIMEOUT_SECONDS})`,
        },
      },
      required: [],
    },
  },
  handler: (args: unknown, signal?: AbortSignal) =>
    toToolHandler(async (parsed) =>
      waitResult(
        await waitForChatEntries(
          readBoundedInteger(parsed, "timeout_seconds", DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS) *
            MS_PER_SECOND,
          signal,
        ),
      ),
    )(args),
};

const replyChatMessageTool: McpTool = {
  definition: {
    name: "reply_chat_message",
    description:
      "Reply to the user in the chat box of a page, task or notebook. The reply appears there right away, rendered as Markdown. " +
      "Use it to answer what wait_for_chat_message delivered, addressing the entity it came from so the conversation stays with its subject. " +
      "Keep replies short — say what you did or found, not how you did it — and record the lasting result on the page or task itself. " +
      "Then call wait_for_chat_message again to keep the conversation going.",
    inputSchema: {
      type: "object",
      properties: {
        entity_type: ENTITY_TYPE_SCHEMA,
        entity_id: { type: "string", description: "Id of the entity whose chat box to reply in" },
        body: { type: "string", description: "Reply text (Markdown)" },
      },
      required: ["entity_type", "entity_id", "body"],
    },
  },
  handler: toToolHandler((args) => {
    const entityType = readEntityType(args, "entity_type");
    const entityId = readString(args, "entity_id");
    const message = createChatEntry({
      entityType,
      entityId,
      sender: "agent",
      body: readString(args, "body"),
    });
    emitChatEntriesChanged({ entityType, entityId });
    return jsonResult({ message });
  }),
};

const listChatMessagesTool: McpTool = {
  definition: {
    name: "list_chat_messages",
    description:
      "Read the chat history attached to a page, task or notebook, oldest first. " +
      "Use it to pick up what was already asked and answered before replying, so you do not repeat yourself or lose the thread.",
    inputSchema: {
      type: "object",
      properties: {
        entity_type: ENTITY_TYPE_SCHEMA,
        entity_id: { type: "string", description: "Id of the entity to read the chat of" },
        limit: {
          type: "integer",
          description: `How many of the most recent messages to return (default ${DEFAULT_MESSAGE_LIMIT}, max ${MAX_MESSAGE_LIMIT})`,
        },
      },
      required: ["entity_type", "entity_id"],
    },
  },
  handler: toToolHandler((args) => {
    const limit = readBoundedInteger(args, "limit", DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT);
    const entries = listChatEntries(readEntityType(args, "entity_type"), readString(args, "entity_id"));
    // 切るのは新しい方から、返すのは古い順。会話は上から読むものなので順序は変えない。
    return jsonResult({ messages: entries.slice(Math.max(0, entries.length - limit)) });
  }),
};

export const chatTools: readonly McpTool[] = [
  waitForChatMessageTool,
  replyChatMessageTool,
  listChatMessagesTool,
];

export const findChatTool = (name: string): McpTool | undefined =>
  chatTools.find((tool) => tool.definition.name === name);
