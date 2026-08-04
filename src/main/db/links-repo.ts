import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import type { EntityType, Link } from "../../shared/preload-api.js";

interface LinkRow {
  id: string;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
}

const ENTITY_TYPES: readonly string[] = ["note", "task"];

const isEntityType = (value: unknown): value is EntityType =>
  typeof value === "string" && ENTITY_TYPES.includes(value);

export const toEntityType = (value: unknown): EntityType => {
  if (!isEntityType(value)) {
    throw new Error(`Entity type must be one of ${ENTITY_TYPES.join(", ")}, got ${String(value)}`);
  }
  return value;
};

const isLinkRow = (value: unknown): value is LinkRow => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return (
    typeof row.id === "string" &&
    typeof row.from_type === "string" &&
    typeof row.from_id === "string" &&
    typeof row.to_type === "string" &&
    typeof row.to_id === "string"
  );
};

const toLink = (row: LinkRow): Link => ({
  id: row.id,
  fromType: toEntityType(row.from_type),
  fromId: row.from_id,
  toType: toEntityType(row.to_type),
  toId: row.to_id,
});

export interface LinkInput {
  fromType: EntityType;
  fromId: string;
  toType: EntityType;
  toId: string;
}

export const createLink = (input: LinkInput): Link => {
  const link: Link = {
    id: randomUUID(),
    fromType: toEntityType(input.fromType),
    fromId: input.fromId,
    toType: toEntityType(input.toType),
    toId: input.toId,
  };
  getDb()
    .prepare("INSERT INTO links (id, from_type, from_id, to_type, to_id) VALUES (?, ?, ?, ?, ?)")
    .run(link.id, link.fromType, link.fromId, link.toType, link.toId);
  return link;
};

// Links have no deletion history to preserve, so removal is a physical delete.
export const deleteLink = (id: string): boolean =>
  getDb().prepare("DELETE FROM links WHERE id = ?").run(id).changes > 0;

export const listLinks = (entityType: EntityType, entityId: string): Link[] => {
  const type = toEntityType(entityType);
  const rows: unknown[] = getDb()
    .prepare(
      "SELECT * FROM links WHERE (from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?)",
    )
    .all(type, entityId, type, entityId);
  return rows.map((row) => {
    if (!isLinkRow(row)) {
      throw new Error("Unexpected links row shape in list results");
    }
    return toLink(row);
  });
};
