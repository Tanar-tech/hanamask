import { json, parseJsonBody, type ApiRequest, type ApiResponse } from "../http";
import { requireOrganizationContext } from "../context";
import { prisma } from "@/lib/db";
import { endWork, startBreak, switchTask, type OpenTask } from "@/lib/task-timer";
import { parseTaskPatch } from "@/lib/task-patch";
import { validateTaskEdit } from "@/lib/week";

// 旧 src/app/api/tasks/**/route.ts をLambda/ローカル共通のハンドラへ移植したもの。
// 認可: 自組織かつ本人のタスクのみ操作可能。他者のタスクは存在を漏らさないよう404を返す。

type SwitchAction = {
  action: "switch";
  projectId: string | null;
  name: string;
};
type BreakAction = { action: "break" };
type EndAction = { action: "end" };
type TasksRequestBody = SwitchAction | BreakAction | EndAction;

async function findOpenTask(organizationId: string, userId: string) {
  return prisma.task.findFirst({
    where: { organizationId, userId, endTime: null },
    orderBy: { startTime: "desc" },
  });
}

async function findOwnTask(id: string, organizationId: string, userId: string) {
  return prisma.task.findFirst({ where: { id, organizationId, userId } });
}

// GET /api/tasks: 実行中タスクを返す（docs/REQUIREMENTS.md §4.1 常時表示用）。
export async function getOpenTask(req: ApiRequest): Promise<ApiResponse> {
  const ctx = await requireOrganizationContext(req);
  if (!ctx) {
    return json(401, { error: "unauthorized" });
  }
  const openTask = await findOpenTask(ctx.organizationId, ctx.userId);
  return json(200, { task: openTask });
}

// POST /api/tasks: タスク開始/切替・休憩開始・終業を行う（docs/REQUIREMENTS.md §3, §4.1）。
export async function postTaskAction(req: ApiRequest): Promise<ApiResponse> {
  const ctx = await requireOrganizationContext(req);
  if (!ctx) {
    return json(401, { error: "unauthorized" });
  }

  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return json(400, { error: "リクエストボディが不正なJSONです。" });
  }
  const body = parsed.value as TasksRequestBody;
  const now = new Date();
  const openRecord = await findOpenTask(ctx.organizationId, ctx.userId);
  const current: OpenTask | null = openRecord
    ? {
        projectId: openRecord.projectId,
        name: openRecord.name,
        type: openRecord.type,
        startTime: openRecord.startTime,
      }
    : null;

  try {
    if (body.action === "end") {
      const closed = endWork(current, now);
      if (!openRecord) throw new Error("unreachable");
      const updated = await prisma.task.update({
        where: { id: openRecord.id },
        data: { endTime: closed.endTime },
      });
      return json(200, { closed: updated, opened: null });
    }

    const result =
      body.action === "break"
        ? startBreak(current, now)
        : switchTask(current, { projectId: body.projectId, name: body.name }, now);

    const createOpened = prisma.task.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        projectId: result.opened.projectId,
        name: result.opened.name,
        type: result.opened.type,
        startTime: result.opened.startTime,
      },
    });

    if (!openRecord || !result.closed) {
      const openedRecord = await createOpened;
      return json(200, { closed: null, opened: openedRecord });
    }

    const [closedRecord, openedRecord] = await prisma.$transaction([
      prisma.task.update({
        where: { id: openRecord.id },
        data: { endTime: result.closed.endTime },
      }),
      createOpened,
    ]);

    return json(200, { closed: closedRecord, opened: openedRecord });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request";
    return json(400, { error: message });
  }
}

// GET /api/tasks/range?start=ISO&end=ISO
// 認証ユーザー本人のタスクで、期間 [start, end) に重なるもの（実行中含む）を返す。
// 週次カレンダー表示用（docs/REQUIREMENTS.md §4.3）。
export async function getTasksInRange(req: ApiRequest): Promise<ApiResponse> {
  const ctx = await requireOrganizationContext(req);
  if (!ctx) {
    return json(401, { error: "unauthorized" });
  }

  const start = new Date(req.query.get("start") ?? "");
  const end = new Date(req.query.get("end") ?? "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return json(400, { error: "start, end はISO日時で、start < end である必要があります。" });
  }

  const tasks = await prisma.task.findMany({
    where: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      startTime: { lt: end },
      OR: [{ endTime: { gt: start } }, { endTime: null }],
    },
    orderBy: { startTime: "asc" },
  });

  return json(200, { tasks });
}

// PATCH /api/tasks/:id: タスク個別の編集（docs/REQUIREMENTS.md §4.4）。
// ボディは parseTaskPatch で構造検証してから使う（型アサーションのみだと
// startTime: null → 1970年へのサイレント書換等が起こる。構造化レビュー指摘）。
export async function patchTask(req: ApiRequest, params: Record<string, string>): Promise<ApiResponse> {
  const ctx = await requireOrganizationContext(req);
  if (!ctx) {
    return json(401, { error: "unauthorized" });
  }

  const task = await findOwnTask(params.id ?? "", ctx.organizationId, ctx.userId);
  if (!task) {
    return json(404, { error: "not found" });
  }

  const parsedBody = parseJsonBody(req);
  if (!parsedBody.ok) {
    return json(400, { error: "リクエストボディが不正なJSONです。" });
  }

  const parsed = parseTaskPatch(parsedBody.value);
  if (!parsed.ok) {
    return json(400, { error: parsed.error });
  }
  const patch = parsed.patch;

  const name = patch.name !== undefined ? patch.name : task.name;
  const startTime = patch.startTime !== undefined ? patch.startTime : task.startTime;
  const endTime = patch.endTime !== undefined ? patch.endTime : task.endTime;

  const validation = validateTaskEdit({ name, startTime, endTime });
  if (!validation.ok) {
    return json(400, { error: validation.error });
  }

  // projectId が指定された場合は自組織のプロジェクトであることを確認する（他組織IDの混入防止）
  let projectId = task.projectId;
  if (patch.projectId !== undefined) {
    if (patch.projectId === null) {
      projectId = null;
    } else {
      const project = await prisma.project.findFirst({
        where: { id: patch.projectId, organizationId: ctx.organizationId },
      });
      if (!project) {
        return json(400, { error: "指定されたプロジェクトが見つかりません。" });
      }
      projectId = project.id;
    }
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { name: name.trim(), projectId, startTime, endTime },
  });

  return json(200, { task: updated });
}

// DELETE /api/tasks/:id: タスク記録の削除（docs/REQUIREMENTS.md §4.4）。
export async function deleteTask(req: ApiRequest, params: Record<string, string>): Promise<ApiResponse> {
  const ctx = await requireOrganizationContext(req);
  if (!ctx) {
    return json(401, { error: "unauthorized" });
  }

  const task = await findOwnTask(params.id ?? "", ctx.organizationId, ctx.userId);
  if (!task) {
    return json(404, { error: "not found" });
  }

  await prisma.task.delete({ where: { id: task.id } });
  return json(200, { ok: true });
}
