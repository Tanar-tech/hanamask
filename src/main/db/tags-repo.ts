import { getDb } from "./db.js";
import { parseTags } from "./tags.js";

/*
 * 使われているタグを集める。エージェントは自分が過去に何と名付けたかを覚えていないため、
 * これを見せないと同じ案件に「プロジェクトA」「project-a」のような別名が付き、
 * グループとして機能しなくなる。
 *
 * タグはJSONの文字列として列に入っているので、SQLだけでは数えられない。件数は
 * 高々ノート＋タスクの行数なので、読み出してから数える。
 */

export interface TagUsage {
  tag: string;
  noteCount: number;
  taskCount: number;
}

const isTagsRow = (value: unknown): value is { tags: string } => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return typeof row.tags === "string";
};

type TaggedTable = "notes" | "tasks" | "notebooks";

const readTagColumn = (table: TaggedTable): string[][] => {
  const rows: unknown[] = getDb()
    .prepare(`SELECT tags FROM ${table} WHERE deleted_at IS NULL`)
    .all();
  return rows.map((row) => {
    if (!isTagsRow(row)) throw new Error(`Unexpected ${table} row shape while reading tags`);
    return parseTags(row.tags);
  });
};

type TagCountKind = "noteCount" | "taskCount";

const countTable = (usage: Map<string, TagUsage>, table: TaggedTable, kind: TagCountKind): void => {
  readTagColumn(table).forEach((tags) => {
    // 同じ記録に同じタグが二度入っていても1件と数える。
    new Set(tags).forEach((tag) => {
      const entry = usage.get(tag) ?? { tag, noteCount: 0, taskCount: 0 };
      entry[kind] += 1;
      usage.set(tag, entry);
    });
  });
};

export const listTagsInUse = (): TagUsage[] => {
  const usage = new Map<string, TagUsage>();

  countTable(usage, "notes", "noteCount");
  // ノート（束）とページのタグは一つの名前空間なので、件数も分けずに合算する。
  countTable(usage, "notebooks", "noteCount");
  countTable(usage, "tasks", "taskCount");

  return [...usage.values()].sort((a, b) => a.tag.localeCompare(b.tag, "ja"));
};
