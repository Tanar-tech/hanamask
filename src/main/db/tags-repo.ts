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

const readTagColumn = (table: "notes" | "tasks"): string[][] => {
  const rows: unknown[] = getDb()
    .prepare(`SELECT tags FROM ${table} WHERE deleted_at IS NULL`)
    .all();
  return rows.map((row) => {
    if (!isTagsRow(row)) throw new Error(`Unexpected ${table} row shape while reading tags`);
    return parseTags(row.tags);
  });
};

export const listTagsInUse = (): TagUsage[] => {
  const usage = new Map<string, TagUsage>();
  const add = (tag: string, kind: "noteCount" | "taskCount"): void => {
    const entry = usage.get(tag) ?? { tag, noteCount: 0, taskCount: 0 };
    entry[kind] += 1;
    usage.set(tag, entry);
  };

  readTagColumn("notes").forEach((tags) => {
    // 同じノートに同じタグが二度入っていても1件と数える。
    new Set(tags).forEach((tag) => {
      add(tag, "noteCount");
    });
  });
  readTagColumn("tasks").forEach((tags) => {
    new Set(tags).forEach((tag) => {
      add(tag, "taskCount");
    });
  });

  return [...usage.values()].sort((a, b) => a.tag.localeCompare(b.tag, "ja"));
};
