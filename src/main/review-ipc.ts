import type { IpcMainInvokeEvent } from "electron";
import {
  createCommentThread,
  deleteThread,
  getThread,
  listThreads,
  replyToThread,
  setThreadStatus,
  toCommentEntityType,
  toCommentStatus,
} from "./db/comments-repo.js";
import { toEntityType } from "./db/links-repo.js";
import {
  listUnread,
  markAllViewed,
  markViewed,
  readChangesSinceView,
} from "./db/views-repo.js";
import {
  emitCommentsChanged,
  emitViewsChanged,
  type CommentChange,
} from "./mcp/change-emitter.js";
import type {
  ChangesSinceView,
  CommentAnchor,
  CommentThread,
  DiffableEntityType,
  NewCommentInput,
  UnreadEntry,
} from "../shared/preload-api.js";

export const VIEWS_MARK_CHANNEL = "views:mark";
export const VIEWS_MARK_ALL_CHANNEL = "views:mark-all";
export const VIEWS_LIST_UNREAD_CHANNEL = "views:list-unread";
export const VIEWS_CHANGES_CHANNEL = "views:changes-since-view";
export const VIEWS_CHANGED_CHANNEL = "views:changed";
export const COMMENTS_LIST_CHANNEL = "comments:list";
export const COMMENTS_CREATE_CHANNEL = "comments:create";
export const COMMENTS_REPLY_CHANNEL = "comments:reply";
export const COMMENTS_SET_STATUS_CHANNEL = "comments:set-status";
export const COMMENTS_DELETE_CHANNEL = "comments:delete";
export const COMMENTS_CHANGED_CHANNEL = "comments:changed";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

export interface IpcRegistrar {
  handle(channel: string, handler: Handler): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readText = (value: unknown, name: string): string => {
  if (typeof value !== "string") throw new Error(`${name} は文字列で渡してください`);
  return value;
};

const toDiffableEntityType = (value: unknown): DiffableEntityType => {
  if (value === "note" || value === "notebook") return value;
  throw new Error(`差分を出せない種類です: ${String(value)}`);
};

// レンダラーから来る値は信用しない（引用の文字列も本文由来で、攻撃者が選べる）。
const readAnchor = (value: unknown): CommentAnchor | null => {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new Error("引用の形式が正しくありません");
  return {
    quote: readText(value.quote, "quote"),
    prefix: readText(value.prefix, "prefix"),
    suffix: readText(value.suffix, "suffix"),
  };
};

const readNewComment = (value: unknown): NewCommentInput => {
  if (!isRecord(value)) throw new Error("コメントの形式が正しくありません");
  return {
    entityType: toCommentEntityType(value.entityType),
    entityId: readText(value.entityId, "entityId"),
    body: readText(value.body, "body"),
    anchor: readAnchor(value.anchor),
  };
};

const announce = (thread: CommentThread, action: CommentChange["action"]): CommentThread => {
  emitCommentsChanged({
    entityType: thread.entityType,
    entityId: thread.entityId,
    threadId: thread.id,
    action,
    by: "user",
  });
  return thread;
};

const markOne = (_event: IpcMainInvokeEvent, entityType: unknown, id: unknown): void => {
  markViewed(toEntityType(entityType), readText(id, "id"), new Date());
  emitViewsChanged();
};

const markAll = (): void => {
  markAllViewed(new Date());
  emitViewsChanged();
};

const changesSinceView = (
  _event: IpcMainInvokeEvent,
  entityType: unknown,
  id: unknown,
): ChangesSinceView | null =>
  readChangesSinceView(toDiffableEntityType(entityType), readText(id, "id"));

const commentsOf = (
  _event: IpcMainInvokeEvent,
  entityType: unknown,
  entityId: unknown,
): CommentThread[] =>
  listThreads({
    entityType: toCommentEntityType(entityType),
    entityId: readText(entityId, "entityId"),
    status: "all",
  });

const createComment = (_event: IpcMainInvokeEvent, input: unknown): CommentThread =>
  announce(createCommentThread(readNewComment(input), "user", new Date()), "created");

const replyComment = (_event: IpcMainInvokeEvent, threadId: unknown, body: unknown) =>
  announce(
    replyToThread(readText(threadId, "threadId"), "user", readText(body, "body"), new Date()),
    "replied",
  );

const changeCommentStatus = (_event: IpcMainInvokeEvent, threadId: unknown, status: unknown) => {
  const next = toCommentStatus(status);
  const thread = setThreadStatus(readText(threadId, "threadId"), next, new Date());
  return announce(thread, next === "resolved" ? "resolved" : "reopened");
};

// 削除後は種類と記録のIDを引けなくなるので、通知に載せる分を先に読んでおく。
const removeComment = (_event: IpcMainInvokeEvent, threadId: unknown): boolean => {
  const thread = getThread(readText(threadId, "threadId"));
  if (thread === null || !deleteThread(thread.id, new Date())) return false;
  announce(thread, "deleted");
  return true;
};

const unread = (): UnreadEntry[] => listUnread();

export const registerReviewIpc = (ipc: IpcRegistrar): void => {
  ipc.handle(VIEWS_MARK_CHANNEL, markOne);
  ipc.handle(VIEWS_MARK_ALL_CHANNEL, markAll);
  ipc.handle(VIEWS_LIST_UNREAD_CHANNEL, unread);
  ipc.handle(VIEWS_CHANGES_CHANNEL, changesSinceView);
  ipc.handle(COMMENTS_LIST_CHANNEL, commentsOf);
  ipc.handle(COMMENTS_CREATE_CHANNEL, createComment);
  ipc.handle(COMMENTS_REPLY_CHANNEL, replyComment);
  ipc.handle(COMMENTS_SET_STATUS_CHANNEL, changeCommentStatus);
  ipc.handle(COMMENTS_DELETE_CHANNEL, removeComment);
};
