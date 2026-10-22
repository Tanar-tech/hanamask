import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import { assertLiveEntityExists, findLiveEntityTitle } from "./entity-lookup.js";
import { toEntityType } from "./links-repo.js";
import type { ChatEntry, ChatSender, EntityType } from "../../shared/preload-api.js";

interface ChatMessageRow {
  id: string;
  entity_type: string;
  entity_id: string;
  sender: string;
  body: string;
  created_at: string;
  delivered_at: string | null;
}

/** 未配信の発言をエージェントへ渡すとき、どの対象宛かを名前で分かるようにする。 */
export interface ChatEntryWithTitle extends ChatEntry {
  entityTitle: string;
}

export interface ChatEntryInput {
  entityType: EntityType;
  entityId: string;
  sender: ChatSender;
  body: string;
}

const isChatSender = (value: unknown): value is ChatSender =>
  value === "user" || value === "agent";

const toChatSender = (value: unknown): ChatSender => {
  if (!isChatSender(value)) {
    throw new Error(`Chat sender must be user or agent, got ${String(value)}`);
  }
  return value;
};

const isChatMessageRow = (value: unknown): value is ChatMessageRow => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return (
    typeof row.id === "string" &&
    typeof row.entity_type === "string" &&
    typeof row.entity_id === "string" &&
    typeof row.sender === "string" &&
    typeof row.body === "string" &&
    typeof row.created_at === "string" &&
    (row.delivered_at === null || typeof row.delivered_at === "string")
  );
};

const toChatEntry = (row: ChatMessageRow): ChatEntry => ({
  id: row.id,
  entityType: toEntityType(row.entity_type),
  entityId: row.entity_id,
  sender: toChatSender(row.sender),
  body: row.body,
  createdAt: row.created_at,
  deliveredAt: row.delivered_at,
});

const toChatEntries = (rows: unknown[]): ChatEntry[] =>
  rows.map((row) => {
    if (!isChatMessageRow(row)) {
      throw new Error("Unexpected chat_messages row shape");
    }
    return toChatEntry(row);
  });

// 外部のMCPクライアントから繰り返し叩かれる経路なので、本文の上限だけは設ける。
export const MAX_CHAT_BODY_LENGTH = 20_000;

const assertBodyWithinLimit = (body: string): void => {
  if (body.length > MAX_CHAT_BODY_LENGTH) {
    throw new Error(`chat body exceeds ${MAX_CHAT_BODY_LENGTH} characters`);
  }
};

export const createChatEntry = (input: ChatEntryInput): ChatEntry => {
  const entityType = toEntityType(input.entityType);
  assertBodyWithinLimit(input.body);
  const sender = toChatSender(input.sender);
  assertLiveEntityExists(entityType, input.entityId);
  const timestamp = new Date().toISOString();
  const entry: ChatEntry = {
    id: randomUUID(),
    entityType,
    entityId: input.entityId,
    sender,
    body: input.body,
    createdAt: timestamp,
    // エージェント自身の発言は届ける相手がいないので、最初から配信済みにしておく。
    deliveredAt: sender === "agent" ? timestamp : null,
  };
  getDb()
    .prepare(
      "INSERT INTO chat_messages (id, entity_type, entity_id, sender, body, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      entry.id,
      entry.entityType,
      entry.entityId,
      entry.sender,
      entry.body,
      entry.createdAt,
      entry.deliveredAt,
    );
  return entry;
};

// created_at は同じミリ秒に並ぶことがあるので、rowid で挿入順まで決めておく。
const CREATION_ORDER = "ORDER BY created_at ASC, rowid ASC";

export const listChatEntries = (entityType: EntityType, entityId: string): ChatEntry[] => {
  const rows: unknown[] = getDb()
    .prepare(
      `SELECT * FROM chat_messages WHERE entity_type = ? AND entity_id = ? ${CREATION_ORDER}`,
    )
    .all(toEntityType(entityType), entityId);
  return toChatEntries(rows);
};

export const listUndeliveredChatEntries = (): ChatEntryWithTitle[] => {
  const rows: unknown[] = getDb()
    .prepare(
      `SELECT * FROM chat_messages WHERE sender = 'user' AND delivered_at IS NULL ${CREATION_ORDER}`,
    )
    .all();
  return toChatEntries(rows).flatMap((entry) => {
    const entityTitle = findLiveEntityTitle(entry.entityType, entry.entityId);
    // 対象がゴミ箱へ入った後の発言は届け先が無いので、待ち受けには渡さない。
    return entityTitle === null ? [] : [{ ...entry, entityTitle }];
  });
};

export const markChatEntriesDelivered = (ids: string[], deliveredAt: string): void => {
  if (ids.length === 0) return;
  const update = getDb().prepare("UPDATE chat_messages SET delivered_at = ? WHERE id = ?");
  getDb().transaction((targets: string[]) => {
    targets.forEach((id) => update.run(deliveredAt, id));
  })(ids);
};

// 親の表に外部キーを張っていないので、物理削除で親が消えた会話はここで揃えて落とす。
export const deleteOrphanChatMessages = (): number =>
  getDb()
    .prepare(
      `DELETE FROM chat_messages WHERE
         (entity_type = 'note' AND entity_id NOT IN (SELECT id FROM notes))
         OR (entity_type = 'task' AND entity_id NOT IN (SELECT id FROM tasks))
         OR (entity_type = 'notebook' AND entity_id NOT IN (SELECT id FROM notebooks))`,
    )
    .run().changes;
