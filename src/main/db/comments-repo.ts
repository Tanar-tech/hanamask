import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import type {
  CommentAnchor,
  CommentAuthor,
  CommentEntityType,
  CommentMessage,
  CommentStatus,
  CommentThread,
  NewCommentInput,
} from "../../shared/preload-api.js";

interface CommentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  parent_id: string | null;
  author: string;
  body: string;
  quote: string | null;
  prefix: string | null;
  suffix: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface CommentThreadFilter {
  entityType?: CommentEntityType;
  entityId?: string;
  status?: CommentStatus | "all";
}

const ENTITY_TYPES: readonly string[] = ["note", "task"];
const AUTHORS: readonly string[] = ["user", "agent"];
const STATUSES: readonly string[] = ["open", "resolved"];

const TABLE_OF: Readonly<Record<CommentEntityType, "notes" | "tasks">> = {
  note: "notes",
  task: "tasks",
};

const isCommentEntityType = (value: unknown): value is CommentEntityType =>
  typeof value === "string" && ENTITY_TYPES.includes(value);

const isCommentAuthor = (value: unknown): value is CommentAuthor =>
  typeof value === "string" && AUTHORS.includes(value);

const isCommentStatus = (value: unknown): value is CommentStatus =>
  typeof value === "string" && STATUSES.includes(value);

export const toCommentEntityType = (value: unknown): CommentEntityType => {
  if (!isCommentEntityType(value)) {
    throw new Error(`Entity type must be one of ${ENTITY_TYPES.join(", ")}, got ${String(value)}`);
  }
  return value;
};

export const toCommentStatus = (value: unknown): CommentStatus => {
  if (!isCommentStatus(value)) {
    throw new Error(`Comment status must be one of ${STATUSES.join(", ")}, got ${String(value)}`);
  }
  return value;
};

const toCommentAuthor = (value: unknown): CommentAuthor => {
  if (!isCommentAuthor(value)) {
    throw new Error(`Comment author must be one of ${AUTHORS.join(", ")}, got ${String(value)}`);
  }
  return value;
};

const isStringOrNull = (value: unknown): value is string | null =>
  typeof value === "string" || value === null;

const isCommentRow = (value: unknown): value is CommentRow => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  const strings = [row.id, row.entity_type, row.entity_id, row.author, row.body, row.status];
  const timestamps = [row.created_at, row.updated_at];
  const nullables = [row.parent_id, row.quote, row.prefix, row.suffix, row.resolved_at];
  return (
    [...strings, ...timestamps].every((field) => typeof field === "string") &&
    nullables.every(isStringOrNull)
  );
};

const toCommentRows = (rows: unknown[]): CommentRow[] =>
  rows.map((row) => {
    if (!isCommentRow(row)) {
      throw new Error("Unexpected comments row shape");
    }
    return row;
  });

const toAnchor = (row: CommentRow): CommentAnchor | null =>
  row.quote === null ? null : { quote: row.quote, prefix: row.prefix ?? "", suffix: row.suffix ?? "" };

const toMessage = (row: CommentRow): CommentMessage => ({
  id: row.id,
  author: toCommentAuthor(row.author),
  body: row.body,
  createdAt: row.created_at,
});

// rowid で並びを固定する。同じ時刻に続けて返信すると created_at だけでは順序が決まらない。
const selectReplies = (rootId: string): CommentRow[] =>
  toCommentRows(
    getDb()
      .prepare(
        "SELECT * FROM comments WHERE parent_id = ? AND deleted_at IS NULL ORDER BY created_at, rowid",
      )
      .all(rootId),
  );

const toThread = (root: CommentRow): CommentThread => ({
  id: root.id,
  entityType: toCommentEntityType(root.entity_type),
  entityId: root.entity_id,
  anchor: toAnchor(root),
  status: toCommentStatus(root.status),
  createdAt: root.created_at,
  updatedAt: root.updated_at,
  resolvedAt: root.resolved_at,
  messages: [root, ...selectReplies(root.id)].map(toMessage),
});

const findRootRow = (threadId: string): CommentRow | null => {
  const row: unknown = getDb()
    .prepare("SELECT * FROM comments WHERE id = ? AND parent_id IS NULL AND deleted_at IS NULL")
    .get(threadId);
  if (row === undefined) return null;
  const [root] = toCommentRows([row]);
  return root ?? null;
};

const requireRootRow = (threadId: string): CommentRow => {
  const root = findRootRow(threadId);
  if (root === null) {
    throw new Error(`Comment thread not found: ${threadId}`);
  }
  return root;
};

const requireThread = (threadId: string): CommentThread => toThread(requireRootRow(threadId));

// 外部キーが無いため、存在しない id やゴミ箱の記録にも挿入できてしまう。ここで確かめる。
const assertEntityActive = (type: CommentEntityType, id: string): void => {
  const found = getDb()
    .prepare(`SELECT 1 FROM ${TABLE_OF[type]} WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (found === undefined) {
    throw new Error(`${type} not found: ${id}`);
  }
};

/*
 * 上限が無いと、巨大なコメントで一覧が重くなり、引用の探し直し（前後の文字との比較）が
 * 描画のたびに画面を固める。画面と MCP の両方がここを通るので、ここで1度だけ決める。
 */
export const MAX_COMMENT_BODY_LENGTH = 10_000;
export const MAX_QUOTE_LENGTH = 2_000;
export const MAX_ANCHOR_CONTEXT_LENGTH = 256;

const toBody = (body: string): string => {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new Error("Comment body must not be empty");
  }
  if (trimmed.length > MAX_COMMENT_BODY_LENGTH) {
    throw new Error(`Comment body is too long (max ${String(MAX_COMMENT_BODY_LENGTH)} characters)`);
  }
  return trimmed;
};

// 引用は本文から探し直すときの手がかりなので、空白も含めて受け取ったまま保存する。
// 前後の文字は引用に近い側だけが手がかりになるので、長すぎれば遠い側を落とす。
const toStoredAnchor = (anchor: CommentAnchor | null): CommentAnchor | null => {
  if (anchor === null) return null;
  if (anchor.quote.trim().length === 0) {
    throw new Error("Comment anchor quote must not be empty");
  }
  if (anchor.quote.length > MAX_QUOTE_LENGTH) {
    throw new Error(`Selected text is too long (max ${String(MAX_QUOTE_LENGTH)} characters)`);
  }
  return {
    quote: anchor.quote,
    prefix: anchor.prefix.slice(-MAX_ANCHOR_CONTEXT_LENGTH),
    suffix: anchor.suffix.slice(0, MAX_ANCHOR_CONTEXT_LENGTH),
  };
};

export const getThread = (threadId: string): CommentThread | null => {
  const root = findRootRow(threadId);
  return root === null ? null : toThread(root);
};

export const createCommentThread = (
  input: NewCommentInput,
  author: CommentAuthor,
  now: Date,
): CommentThread => {
  const entityType = toCommentEntityType(input.entityType);
  assertEntityActive(entityType, input.entityId);
  const body = toBody(input.body);
  const anchor = toStoredAnchor(input.anchor);
  const id = randomUUID();
  const timestamp = now.toISOString();
  getDb()
    .prepare(
      `INSERT INTO comments (id, entity_type, entity_id, parent_id, author, body, quote, prefix, suffix,
        status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    )
    .run(id, entityType, input.entityId, toCommentAuthor(author), body,
      anchor?.quote ?? null, anchor?.prefix ?? null, anchor?.suffix ?? null, timestamp, timestamp);
  return requireThread(id);
};

// 返信の追加とスレッドの更新日時を別々に書くと、途中で落ちたとき一覧の並びが返信とずれる。
export const replyToThread = (
  threadId: string,
  author: CommentAuthor,
  body: string,
  now: Date,
): CommentThread => {
  const root = requireRootRow(threadId);
  const text = toBody(body);
  const timestamp = now.toISOString();
  getDb().transaction(() => {
    getDb()
      .prepare(
        `INSERT INTO comments (id, entity_type, entity_id, parent_id, author, body, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), root.entity_type, root.entity_id, root.id, toCommentAuthor(author), text,
        timestamp, timestamp);
    // 解決済みのまま返信すると既定の一覧（未解決）から見えず、返信が見落とされるので開き直す。
    getDb()
      .prepare("UPDATE comments SET updated_at = ?, status = 'open', resolved_at = NULL WHERE id = ?")
      .run(timestamp, root.id);
  })();
  return requireThread(root.id);
};

// 返信して解決するとき、途中で失敗すると返信だけが残り、やり直しで返信が二重になる。まとめて書く。
export const replyAndResolve = (
  threadId: string,
  author: CommentAuthor,
  body: string,
  now: Date,
): CommentThread =>
  getDb().transaction(() => {
    replyToThread(threadId, author, body, now);
    return setThreadStatus(threadId, "resolved", now);
  })();

export const setThreadStatus = (
  threadId: string,
  status: CommentStatus,
  now: Date,
): CommentThread => {
  const nextStatus = toCommentStatus(status);
  const root = requireRootRow(threadId);
  const timestamp = now.toISOString();
  const resolvedAt = nextStatus === "resolved" ? timestamp : null;
  getDb()
    .prepare("UPDATE comments SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ?")
    .run(nextStatus, resolvedAt, timestamp, root.id);
  return requireThread(root.id);
};

export const deleteThread = (threadId: string, now: Date): boolean => {
  if (findRootRow(threadId) === null) return false;
  getDb()
    .prepare(
      "UPDATE comments SET deleted_at = ? WHERE (id = ? OR parent_id = ?) AND deleted_at IS NULL",
    )
    .run(now.toISOString(), threadId, threadId);
  return true;
};

const buildThreadQuery = (filter: CommentThreadFilter): { sql: string; params: string[] } => {
  const conditions = ["parent_id IS NULL", "deleted_at IS NULL"];
  const params: string[] = [];
  if (filter.entityType !== undefined) {
    conditions.push("entity_type = ?");
    params.push(toCommentEntityType(filter.entityType));
  }
  if (filter.entityId !== undefined) {
    conditions.push("entity_id = ?");
    params.push(filter.entityId);
  }
  if (filter.status !== undefined && filter.status !== "all") {
    conditions.push("status = ?");
    params.push(toCommentStatus(filter.status));
  }
  const order = "CASE status WHEN 'open' THEN 0 ELSE 1 END, updated_at DESC, rowid DESC";
  return { sql: `SELECT * FROM comments WHERE ${conditions.join(" AND ")} ORDER BY ${order}`, params };
};

// 記録がゴミ箱にあってもコメントは返す。復元できる間は消さない（REQUIREMENTS §4.12）。
export const listThreads = (filter: CommentThreadFilter): CommentThread[] => {
  const { sql, params } = buildThreadQuery(filter);
  return toCommentRows(getDb().prepare(sql).all(...params)).map(toThread);
};

export const deleteCommentsForMissingEntities = (): number =>
  getDb()
    .prepare(
      `DELETE FROM comments WHERE
        (entity_type = 'note' AND entity_id NOT IN (SELECT id FROM notes)) OR
        (entity_type = 'task' AND entity_id NOT IN (SELECT id FROM tasks))`,
    )
    .run().changes;
