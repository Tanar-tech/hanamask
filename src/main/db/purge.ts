import { getDb } from "./db.js";
import { NOTE_RETENTION_DAYS } from "../../shared/preload-api.js";

const RETENTION_MS = NOTE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface PurgeResult {
  notesPurged: number;
  tasksPurged: number;
}

const purgeTable = (tableName: "notes" | "tasks", cutoff: string): number =>
  getDb()
    .prepare(`DELETE FROM ${tableName} WHERE deleted_at IS NOT NULL AND deleted_at < ?`)
    .run(cutoff).changes;

export const purgeSoftDeletedRecords = (now: Date): PurgeResult => {
  const cutoff = new Date(now.getTime() - RETENTION_MS).toISOString();
  return {
    notesPurged: purgeTable("notes", cutoff),
    tasksPurged: purgeTable("tasks", cutoff),
  };
};
