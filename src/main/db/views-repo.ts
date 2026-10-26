import { getDb } from "./db.js";
import { toEntityType } from "./links-repo.js";
import { listNoteVersions } from "./notes-repo.js";
import { listNotebookVersions } from "./notebooks-repo.js";
import { pickContentAtView } from "../views/changes-since-view.js";
import type {
  ChangesSinceView,
  DiffableEntityType,
  EntityType,
  NoteVersion,
  UnreadEntry,
} from "../../shared/preload-api.js";

const BASELINE_KEY = "views_baseline";

const TABLE_OF: Readonly<Record<EntityType, "notes" | "tasks" | "notebooks">> = {
  note: "notes",
  task: "tasks",
  notebook: "notebooks",
};

const VERSIONS_OF: Readonly<Record<DiffableEntityType, (id: string) => NoteVersion[]>> = {
  note: listNoteVersions,
  notebook: listNotebookVersions,
};

const UPSERT_VIEW_CONFLICT =
  "ON CONFLICT (entity_type, entity_id) DO UPDATE SET viewed_at = excluded.viewed_at";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readStringColumn = (row: unknown, column: string): string | null => {
  if (row === undefined) return null;
  if (!isRecord(row) || typeof row[column] !== "string") {
    throw new Error(`Unexpected row shape: column ${column} is not a string`);
  }
  return row[column];
};

const isUnreadRow = (value: unknown): value is { entity_type: string; id: string } =>
  isRecord(value) && typeof value.entity_type === "string" && typeof value.id === "string";

const readBaseline = (): string | null =>
  readStringColumn(
    getDb().prepare("SELECT value FROM app_meta WHERE key = ?").get(BASELINE_KEY),
    "value",
  );

// 導入前からある記録を未読にしないため、既読の記録を始めた時刻を一度だけ残し、以後は動かさない。
export const ensureViewBaseline = (now: Date): string => {
  getDb()
    .prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)")
    .run(BASELINE_KEY, now.toISOString());
  const baseline = readBaseline();
  if (baseline === null) throw new Error(`app_meta has no ${BASELINE_KEY} after insert`);
  return baseline;
};

const currentBaseline = (): string => readBaseline() ?? ensureViewBaseline(new Date());

export const markViewed = (entityType: EntityType, id: string, now: Date): void => {
  getDb()
    .prepare(
      `INSERT INTO views (entity_type, entity_id, viewed_at) VALUES (?, ?, ?) ${UPSERT_VIEW_CONFLICT}`,
    )
    .run(toEntityType(entityType), id, now.toISOString());
};

export const markAllViewed = (now: Date): void => {
  const db = getDb();
  const viewedAt = now.toISOString();
  db.transaction(() => {
    Object.entries(TABLE_OF).forEach(([entityType, table]) => {
      db.prepare(
        // WHERE を省くと SQLite が ON CONFLICT を結合の ON と読み違えるため、絞り込みは必ず付ける。
        `INSERT INTO views (entity_type, entity_id, viewed_at)
         SELECT ?, id, ? FROM ${table} WHERE deleted_at IS NULL ${UPSERT_VIEW_CONFLICT}`,
      ).run(entityType, viewedAt);
    });
  })();
};

export const readViewedAt = (entityType: EntityType, id: string): string | null =>
  readStringColumn(
    getDb()
      .prepare("SELECT viewed_at FROM views WHERE entity_type = ? AND entity_id = ?")
      .get(toEntityType(entityType), id),
    "viewed_at",
  );

const unreadCondition = (alias: string, entityType: EntityType): string =>
  `${alias}.deleted_at IS NULL AND ${alias}.updated_at > COALESCE(
     (SELECT viewed_at FROM views WHERE entity_type = '${entityType}' AND entity_id = ${alias}.id),
     @baseline)`;

const UNREAD_SQL = `
  SELECT 'note' AS entity_type, n.id AS id FROM notes n WHERE ${unreadCondition("n", "note")}
  UNION ALL
  SELECT 'task', t.id FROM tasks t WHERE ${unreadCondition("t", "task")}
  UNION ALL
  SELECT 'notebook', b.id FROM notebooks b
  WHERE b.deleted_at IS NULL AND (${unreadCondition("b", "notebook")}
    OR EXISTS (SELECT 1 FROM notes p WHERE p.notebook_id = b.id AND ${unreadCondition("p", "note")}))`;

// その記録自身に、利用者がまだ見ていない更新があるか（ノートの中のページは数えない）。
// 画面からの保存の前に確かめ、見ていない更新を保存のついでに既読にしないために使う。
export const hasUnseenUpdate = (entityType: EntityType, id: string): boolean => {
  const type = toEntityType(entityType);
  const row: unknown = getDb()
    .prepare(`SELECT 1 AS hit FROM ${TABLE_OF[type]} r WHERE r.id = @id AND ${unreadCondition("r", type)}`)
    .get({ id, baseline: currentBaseline() });
  return row !== undefined;
};

// 消えた記録の既読の行を片付ける。記録の表への外部キーは無いので、パージのついでに揃える。
export const deleteViewsForMissingEntities = (): number =>
  getDb()
    .prepare(
      `DELETE FROM views WHERE
         (entity_type = 'note' AND entity_id NOT IN (SELECT id FROM notes))
      OR (entity_type = 'task' AND entity_id NOT IN (SELECT id FROM tasks))
      OR (entity_type = 'notebook' AND entity_id NOT IN (SELECT id FROM notebooks))`,
    )
    .run().changes;

export const listUnread = (): UnreadEntry[] => {
  const rows: unknown[] = getDb().prepare(UNREAD_SQL).all({ baseline: currentBaseline() });
  return rows.map((row) => {
    if (!isUnreadRow(row)) throw new Error("Unexpected row shape in unread results");
    return { entityType: toEntityType(row.entity_type), id: row.id };
  });
};

const readActiveUpdatedAt = (entityType: DiffableEntityType, id: string): string | null =>
  readStringColumn(
    getDb()
      .prepare(`SELECT updated_at FROM ${TABLE_OF[entityType]} WHERE id = ? AND deleted_at IS NULL`)
      .get(id),
    "updated_at",
  );

export const readChangesSinceView = (
  entityType: DiffableEntityType,
  id: string,
): ChangesSinceView | null => {
  const updatedAt = readActiveUpdatedAt(entityType, id);
  if (updatedAt === null) return null;
  const viewedAt = readViewedAt(entityType, id) ?? currentBaseline();
  if (updatedAt <= viewedAt) return null;
  const previous = pickContentAtView(VERSIONS_OF[entityType](id), viewedAt);
  if (previous === null) return null;
  return { viewedAt, previousTitle: previous.title, previousBody: previous.body };
};
