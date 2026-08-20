import { createHash } from "node:crypto";
import { asRecord } from "../records.js";
import { getDb } from "./db.js";

export type EmbeddedEntityType = "note" | "task";

export interface StoredEmbedding {
  entityType: EmbeddedEntityType;
  entityId: string;
  modelId: string;
  contentHash: string;
  vector: Float32Array;
  updatedAt: string;
}

export interface StaleEntity {
  entityType: EmbeddedEntityType;
  entityId: string;
  title: string;
  body: string;
}

interface EmbeddingRow {
  entity_type: EmbeddedEntityType;
  entity_id: string;
  model_id: string;
  content_hash: string;
  vector: Buffer;
  updated_at: string;
}

interface IndexedStateRow {
  entity_type: EmbeddedEntityType;
  entity_id: string;
  title: string;
  body: string;
  content_hash: string | null;
}

const ENTITY_TYPES: readonly string[] = ["note", "task"];

const isEmbeddedEntityType = (value: unknown): value is EmbeddedEntityType =>
  typeof value === "string" && ENTITY_TYPES.includes(value);

const isEmbeddingRow = (value: unknown): value is EmbeddingRow => {
  const row = asRecord(value);
  if (row === null) return false;
  return (
    isEmbeddedEntityType(row.entity_type) &&
    typeof row.entity_id === "string" &&
    typeof row.model_id === "string" &&
    typeof row.content_hash === "string" &&
    Buffer.isBuffer(row.vector) &&
    typeof row.updated_at === "string"
  );
};

const isIndexedStateRow = (value: unknown): value is IndexedStateRow => {
  const row = asRecord(value);
  if (row === null) return false;
  return (
    isEmbeddedEntityType(row.entity_type) &&
    typeof row.entity_id === "string" &&
    typeof row.title === "string" &&
    typeof row.body === "string" &&
    (row.content_hash === null || typeof row.content_hash === "string")
  );
};

/*
 * Float32Array と Buffer は同じメモリを共有できるが、better-sqlite3 が返す Buffer は
 * プールの一部を指していることがあるため、読み出しでは必ずコピーしてから型付き配列にする。
 * バイト順はホスト依存だが、DBファイルは書いたPCの中でしか読まれないので問題にならない。
 */
const toVectorBuffer = (vector: Float32Array): Buffer =>
  Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);

const toFloat32Array = (buffer: Buffer): Float32Array =>
  new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

const toStoredEmbedding = (row: EmbeddingRow): StoredEmbedding => ({
  entityType: row.entity_type,
  entityId: row.entity_id,
  modelId: row.model_id,
  contentHash: row.content_hash,
  vector: toFloat32Array(row.vector),
  updatedAt: row.updated_at,
});

// 改行を挟むのは、タイトル末尾と本文先頭の連結が別の組み合わせと同じ文字列にならないようにするため。
export const contentHashOf = (title: string, body: string): string =>
  createHash("sha256").update(`${title}\n${body}`, "utf8").digest("hex");

export const upsertEmbedding = (row: StoredEmbedding): void => {
  getDb()
    .prepare(
      `INSERT INTO embeddings (entity_type, entity_id, model_id, content_hash, vector, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET
         model_id = excluded.model_id,
         content_hash = excluded.content_hash,
         vector = excluded.vector,
         updated_at = excluded.updated_at`,
    )
    .run(
      row.entityType,
      row.entityId,
      row.modelId,
      row.contentHash,
      toVectorBuffer(row.vector),
      row.updatedAt,
    );
};

export const deleteEmbedding = (entityType: EmbeddedEntityType, entityId: string): void => {
  getDb()
    .prepare("DELETE FROM embeddings WHERE entity_type = ? AND entity_id = ?")
    .run(entityType, entityId);
};

// ゴミ箱の中身を検索結果に出さないため、生きているノート・タスクに結び付く行だけを返す。
const LIST_EMBEDDINGS_SQL = `
  SELECT e.* FROM embeddings e
    JOIN notes n ON n.id = e.entity_id
   WHERE e.entity_type = 'note' AND e.model_id = ? AND n.deleted_at IS NULL
  UNION ALL
  SELECT e.* FROM embeddings e
    JOIN tasks t ON t.id = e.entity_id
   WHERE e.entity_type = 'task' AND e.model_id = ? AND t.deleted_at IS NULL`;

export const listEmbeddings = (modelId: string): StoredEmbedding[] => {
  const rows: unknown[] = getDb().prepare(LIST_EMBEDDINGS_SQL).all(modelId, modelId);
  return rows.map((row) => {
    if (!isEmbeddingRow(row)) {
      throw new Error("Unexpected embeddings row shape");
    }
    return toStoredEmbedding(row);
  });
};

/*
 * SQLite に sha256 が無いので、ハッシュの一致判定は取り出してから JS 側で行う。model_id を
 * JOIN 条件に入れているので、モデルを差し替えたときは全件が索引なしとして出る。
 */
const LIST_INDEXED_STATE_SQL = `
  SELECT 'note' AS entity_type, n.id AS entity_id, n.title AS title, n.body AS body,
         e.content_hash AS content_hash
    FROM notes n
    LEFT JOIN embeddings e ON e.entity_type = 'note' AND e.entity_id = n.id AND e.model_id = ?
   WHERE n.deleted_at IS NULL
  UNION ALL
  SELECT 'task' AS entity_type, t.id AS entity_id, t.title AS title, t.body AS body,
         e.content_hash AS content_hash
    FROM tasks t
    LEFT JOIN embeddings e ON e.entity_type = 'task' AND e.entity_id = t.id AND e.model_id = ?
   WHERE t.deleted_at IS NULL`;

export const listStaleEntities = (modelId: string): StaleEntity[] => {
  const rows: unknown[] = getDb().prepare(LIST_INDEXED_STATE_SQL).all(modelId, modelId);
  return rows
    .map((row) => {
      if (!isIndexedStateRow(row)) {
        throw new Error("Unexpected indexed state row shape");
      }
      return row;
    })
    .filter((row) => row.content_hash !== contentHashOf(row.title, row.body))
    .map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      title: row.title,
      body: row.body,
    }));
};

// 物理削除で行き場を失ったベクトルを落とす。呼び出し側は purge のみ。
export const deleteOrphanEmbeddings = (): number =>
  getDb()
    .prepare(
      `DELETE FROM embeddings
        WHERE (entity_type = 'note' AND entity_id NOT IN (SELECT id FROM notes))
           OR (entity_type = 'task' AND entity_id NOT IN (SELECT id FROM tasks))`,
    )
    .run().changes;
