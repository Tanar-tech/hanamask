import { getDb } from "./db.js";
import type { EntityType } from "../../shared/preload-api.js";

/*
 * links・chat_messages は親の表に外部キーを張っていない。エージェントがidを打ち間違えると
 * どの画面からも開けない行が黙って溜まるので、親の存在はここ1か所で確かめる。
 * MCPとUIの両方が各 create 関数を通るため、呼び出し側ごとに書くと片方だけ抜ける。
 */
const TABLE_OF: Readonly<Record<EntityType, "notes" | "tasks" | "notebooks">> = {
  note: "notes",
  task: "tasks",
  notebook: "notebooks",
};

const isTitleRow = (value: unknown): value is { title: string } => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return typeof row.title === "string";
};

export const findLiveEntityTitle = (entityType: EntityType, entityId: string): string | null => {
  const row: unknown = getDb()
    .prepare(`SELECT title FROM ${TABLE_OF[entityType]} WHERE id = ? AND deleted_at IS NULL`)
    .get(entityId);
  return isTitleRow(row) ? row.title : null;
};

export const assertLiveEntityExists = (entityType: EntityType, entityId: string): void => {
  if (findLiveEntityTitle(entityType, entityId) === null) {
    throw new Error(`${entityType} not found: ${entityId}`);
  }
};
