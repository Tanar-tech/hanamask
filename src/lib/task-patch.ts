// PATCH /api/tasks/[id] リクエストボディの構造検証（純粋関数）。
// 型アサーションのみの受け取りは、startTime: null が new Date(null) = 1970-01-01 として
// サイレント保存される・name: null が TypeError で500になる等の実害があるため（構造化レビュー指摘）、
// フィールドごとに実行時型チェックを行う。意味的な検証（終了>開始等）は validateTaskEdit が担う。

export interface TaskPatch {
  name?: string;
  projectId?: string | null;
  startTime?: Date;
  endTime?: Date | null;
}

export type ParseResult = { ok: true; patch: TaskPatch } | { ok: false; error: string };

export function parseTaskPatch(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "リクエストボディはオブジェクトである必要があります。" };
  }
  const record = body as Record<string, unknown>;
  const patch: TaskPatch = {};

  if ("name" in record) {
    if (typeof record.name !== "string") {
      return { ok: false, error: "name は文字列である必要があります。" };
    }
    patch.name = record.name;
  }

  if ("projectId" in record) {
    if (record.projectId !== null && typeof record.projectId !== "string") {
      return { ok: false, error: "projectId は文字列またはnullである必要があります。" };
    }
    patch.projectId = record.projectId as string | null;
  }

  if ("startTime" in record) {
    if (typeof record.startTime !== "string") {
      return { ok: false, error: "startTime はISO日時文字列である必要があります。" };
    }
    patch.startTime = new Date(record.startTime);
  }

  if ("endTime" in record) {
    if (record.endTime !== null && typeof record.endTime !== "string") {
      return { ok: false, error: "endTime はISO日時文字列またはnullである必要があります。" };
    }
    patch.endTime = record.endTime === null ? null : new Date(record.endTime);
  }

  return { ok: true, patch };
}
