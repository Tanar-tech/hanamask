import { getDb } from "./db.js";
import { deleteOrphanEmbeddings } from "./embeddings-repo.js";
import { deleteOrphanChatMessages } from "./chat-repo.js";
import { TRASH_RETENTION_DAYS } from "../../shared/preload-api.js";

const RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface PurgeResult {
  notesPurged: number;
  tasksPurged: number;
  notebooksPurged: number;
}

const purgeTable = (
  tableName: "notes" | "tasks" | "notebooks",
  cutoff: string,
): number =>
  getDb()
    .prepare(
      `DELETE FROM ${tableName} WHERE deleted_at IS NOT NULL AND deleted_at < ?`,
    )
    .run(cutoff).changes;

const isIdRow = (value: unknown): value is { id: string } => {
  if (typeof value !== "object" || value === null) return false;
  const { id }: Record<string, unknown> = { ...value };
  return typeof id === "string";
};

const notebookIdsToPurge = (cutoff: string): string[] => {
  const rows: unknown[] = getDb()
    .prepare(
      "SELECT id FROM notebooks WHERE deleted_at IS NOT NULL AND deleted_at < ?",
    )
    .all(cutoff);
  return rows.filter(isIdRow).map((row) => row.id);
};

/* ゴミ箱の間は所属を保っている（復元で束が戻る）。物理削除して初めて正式に無所属へ戻す。 */
const detachNotesFrom = (notebookIds: readonly string[]): void => {
  if (notebookIds.length === 0) return;
  const placeholders = notebookIds.map(() => "?").join(", ");
  getDb()
    .prepare(
      `UPDATE notes SET notebook_id = NULL WHERE notebook_id IN (${placeholders})`,
    )
    .run(...notebookIds);
};

// 削除と所属解除の間で落ちると、消えたノートを指したままのページが残る。1トランザクションで行う。
const purgeNotebooks = (cutoff: string): number =>
  getDb().transaction((): number => {
    const notebookIds = notebookIdsToPurge(cutoff);
    const purged = purgeTable("notebooks", cutoff);
    detachNotesFrom(notebookIds);
    return purged;
  })();

export const purgeSoftDeletedRecords = (now: Date): PurgeResult => {
  const cutoff = new Date(now.getTime() - RETENTION_MS).toISOString();
  const result = {
    notesPurged: purgeTable("notes", cutoff),
    tasksPurged: purgeTable("tasks", cutoff),
    notebooksPurged: purgeNotebooks(cutoff),
  };
  // embeddings は notes/tasks への外部キーを持たないので、消えた行のベクトルはここで揃えて落とす。
  deleteOrphanEmbeddings();
  deleteOrphanChatMessages();
  return result;
};
