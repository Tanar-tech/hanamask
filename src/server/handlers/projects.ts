import { json, parseJsonBody, type ApiRequest, type ApiResponse } from "../http";
import { requireOrganizationContext } from "../context";
import { prisma } from "@/lib/db";

// GET /api/projects: 自組織のプロジェクト/カテゴリ一覧（docs/REQUIREMENTS.md §4.2）。
// ダッシュボードが静的化しサーバー側でPrismaを直接引けなくなったため、API化した。
// ?all=1 を付けるとアーカイブ済みも含めて返す（グループ管理ダイアログ用）。
export async function listProjects(req: ApiRequest): Promise<ApiResponse> {
  const ctx = await requireOrganizationContext(req);
  if (!ctx) {
    return json(401, { error: "unauthorized" });
  }
  const includeArchived = req.query.get("all") === "1";
  const projects = await prisma.project.findMany({
    where: { organizationId: ctx.organizationId, ...(includeArchived ? {} : { isArchived: false }) },
    orderBy: { name: "asc" },
  });
  return json(200, { projects });
}

// POST /api/projects: プロジェクトのその場新規登録（docs/REQUIREMENTS.md §7、SPEC.md セットC）。
// タスク開始・編集画面のプロジェクト選択欄から、既存プロジェクトの選択に加えて
// その場で新規作成できるようにする。
export async function createProject(req: ApiRequest): Promise<ApiResponse> {
  const ctx = await requireOrganizationContext(req);
  if (!ctx) {
    return json(401, { error: "unauthorized" });
  }

  const parsed = parseJsonBody(req);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
    return json(400, { error: "リクエストボディが不正なJSONです。" });
  }
  const body = parsed.value as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name === "") {
    return json(400, { error: "プロジェクト名を入力してください。" });
  }

  // Prismaスキーマに (organizationId, name) の一意制約が無いため、アプリ側で重複名チェックを行う
  // （DBスキーマ変更はSet Cの範囲外のため見送り。競合状態下での二重作成防止は将来課題）。
  const existing = await prisma.project.findFirst({
    where: { organizationId: ctx.organizationId, name },
  });
  if (existing) {
    return json(400, { error: "同じ名前のプロジェクトが既に存在します。" });
  }

  const project = await prisma.project.create({
    data: { organizationId: ctx.organizationId, name },
  });
  return json(200, { project });
}

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// PATCH /api/projects/:id: グループの編集（名前・色・アーカイブ切替、要求事項#1）。
export async function updateProject(req: ApiRequest, params: Record<string, string>): Promise<ApiResponse> {
  const ctx = await requireOrganizationContext(req);
  if (!ctx) {
    return json(401, { error: "unauthorized" });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id ?? "", organizationId: ctx.organizationId },
  });
  if (!project) {
    return json(404, { error: "not found" });
  }

  const parsed = parseJsonBody(req);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
    return json(400, { error: "リクエストボディが不正なJSONです。" });
  }
  const body = parsed.value as { name?: unknown; color?: unknown; isArchived?: unknown };

  const data: { name?: string; color?: string; isArchived?: boolean } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name === "") {
      return json(400, { error: "プロジェクト名を入力してください。" });
    }
    const existing = await prisma.project.findFirst({
      where: { organizationId: ctx.organizationId, name, id: { not: project.id } },
    });
    if (existing) {
      return json(400, { error: "同じ名前のプロジェクトが既に存在します。" });
    }
    data.name = name;
  }

  if (body.color !== undefined) {
    if (typeof body.color !== "string" || !COLOR_PATTERN.test(body.color)) {
      return json(400, { error: "colorは#rrggbb形式で指定してください。" });
    }
    data.color = body.color;
  }

  if (body.isArchived !== undefined) {
    if (typeof body.isArchived !== "boolean") {
      return json(400, { error: "isArchivedはbooleanで指定してください。" });
    }
    data.isArchived = body.isArchived;
  }

  const updated = await prisma.project.update({ where: { id: project.id }, data });
  return json(200, { project: updated });
}

// DELETE /api/projects/:id: グループの削除（要求事項#1）。
// Task.projectId は onDelete: SetNull のため、紐づくタスク記録自体は削除されず未設定になる。
export async function deleteProject(req: ApiRequest, params: Record<string, string>): Promise<ApiResponse> {
  const ctx = await requireOrganizationContext(req);
  if (!ctx) {
    return json(401, { error: "unauthorized" });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id ?? "", organizationId: ctx.organizationId },
  });
  if (!project) {
    return json(404, { error: "not found" });
  }

  await prisma.project.delete({ where: { id: project.id } });
  return json(200, { ok: true });
}
