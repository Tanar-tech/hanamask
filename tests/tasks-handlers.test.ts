import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "@/server/http";

// src/server/handlers/tasks.tsのハンドラテスト。ハンドラ層は従来ゼロカバレッジだったため追加。
// task-timer.ts / task-patch.ts / week.ts は既に個別にテスト済みの純粋関数なので実装をそのまま使い、
// prisma・requireOrganizationContextのみモックしてI/O境界を切る。

const {
  mockTaskFindFirst,
  mockTaskFindMany,
  mockTaskCreate,
  mockTaskUpdate,
  mockTaskDelete,
  mockTransaction,
  mockProjectFindFirst,
} = vi.hoisted(() => ({
  mockTaskFindFirst: vi.fn(),
  mockTaskFindMany: vi.fn(),
  mockTaskCreate: vi.fn(),
  mockTaskUpdate: vi.fn(),
  mockTaskDelete: vi.fn(),
  mockTransaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  mockProjectFindFirst: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    task: {
      findFirst: mockTaskFindFirst,
      findMany: mockTaskFindMany,
      create: mockTaskCreate,
      update: mockTaskUpdate,
      delete: mockTaskDelete,
    },
    project: { findFirst: mockProjectFindFirst },
    $transaction: mockTransaction,
  },
}));

const { mockRequireOrganizationContext } = vi.hoisted(() => ({
  mockRequireOrganizationContext: vi.fn(),
}));
vi.mock("@/server/context", () => ({
  requireOrganizationContext: mockRequireOrganizationContext,
}));

const { deleteTask, getOpenTask, getTasksInRange, patchTask, postTaskAction } = await import(
  "@/server/handlers/tasks"
);

const CTX = { userId: "u1", organizationId: "org1" };

function makeRequest(opts: {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}): ApiRequest {
  return {
    method: opts.method ?? "GET",
    path: "/api/tasks",
    query: new URLSearchParams(opts.query ?? {}),
    headers: {},
    cookies: {},
    body: opts.body === undefined ? null : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  };
}

beforeEach(() => {
  mockTaskFindFirst.mockReset();
  mockTaskFindMany.mockReset();
  mockTaskCreate.mockReset();
  mockTaskUpdate.mockReset();
  mockTaskDelete.mockReset();
  mockTransaction.mockClear();
  mockProjectFindFirst.mockReset();
  mockRequireOrganizationContext.mockReset();
});

describe("getOpenTask", () => {
  it("未認証なら401", async () => {
    mockRequireOrganizationContext.mockResolvedValue(null);
    const res = await getOpenTask(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("実行中タスクが無ければ task: null", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue(null);
    const res = await getOpenTask(makeRequest({}));
    expect(res.status).toBe(200);
    expect((res.body as { task: null }).task).toBeNull();
  });

  it("実行中タスクがあれば返し、自組織・本人のみでスコープする", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue({ id: "t1", endTime: null });

    const res = await getOpenTask(makeRequest({}));

    expect(res.status).toBe(200);
    expect((res.body as { task: { id: string } }).task.id).toBe("t1");
    expect(mockTaskFindFirst).toHaveBeenCalledWith({
      where: { organizationId: "org1", userId: "u1", endTime: null },
      orderBy: { startTime: "desc" },
    });
  });
});

describe("postTaskAction", () => {
  it("未認証なら401", async () => {
    mockRequireOrganizationContext.mockResolvedValue(null);
    const res = await postTaskAction(makeRequest({ method: "POST", body: { action: "break" } }));
    expect(res.status).toBe(401);
  });

  it("不正なJSONボディは400", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    const res = await postTaskAction(makeRequest({ method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("実行中タスクが無い状態でswitchすると新規作成のみ行われる（closed: null）", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue(null);
    mockTaskCreate.mockResolvedValue({ id: "t1", name: "開発" });

    const res = await postTaskAction(
      makeRequest({ method: "POST", body: { action: "switch", projectId: "p1", name: "開発" } }),
    );

    expect(res.status).toBe(200);
    const body = res.body as { closed: unknown; opened: { id: string } };
    expect(body.closed).toBeNull();
    expect(body.opened.id).toBe("t1");
    expect(mockTaskCreate).toHaveBeenCalledWith({
      data: { organizationId: "org1", userId: "u1", projectId: "p1", name: "開発", type: "work", startTime: expect.any(Date) },
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("実行中タスクがある状態でswitchすると、旧タスクの終了と新タスクの作成がトランザクションで行われる", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue({
      id: "old",
      projectId: "p0",
      name: "前のタスク",
      type: "work",
      startTime: new Date(Date.now() - 60_000),
      endTime: null,
    });
    mockTaskUpdate.mockResolvedValue({ id: "old", endTime: new Date() });
    mockTaskCreate.mockResolvedValue({ id: "new", name: "次のタスク" });

    const res = await postTaskAction(
      makeRequest({ method: "POST", body: { action: "switch", projectId: "p1", name: "次のタスク" } }),
    );

    expect(res.status).toBe(200);
    const body = res.body as { closed: { id: string }; opened: { id: string } };
    expect(body.closed.id).toBe("old");
    expect(body.opened.id).toBe("new");
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTaskUpdate).toHaveBeenCalledWith({ where: { id: "old" }, data: { endTime: expect.any(Date) } });
  });

  it("タスク名が空文字のswitchは400（タスク未作成）", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue(null);

    const res = await postTaskAction(
      makeRequest({ method: "POST", body: { action: "switch", projectId: null, name: "   " } }),
    );

    expect(res.status).toBe(400);
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it("休憩開始（break）は type: break のタスクを作成する", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue(null);
    mockTaskCreate.mockResolvedValue({ id: "b1", name: "休憩", type: "break" });

    const res = await postTaskAction(makeRequest({ method: "POST", body: { action: "break" } }));

    expect(res.status).toBe(200);
    expect(mockTaskCreate).toHaveBeenCalledWith({
      data: { organizationId: "org1", userId: "u1", projectId: null, name: "休憩", type: "break", startTime: expect.any(Date) },
    });
  });

  it("終業（end）は実行中タスクを終了しopened: nullを返す", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue({
      id: "t1",
      projectId: null,
      name: "作業中",
      type: "work",
      startTime: new Date(Date.now() - 1000),
      endTime: null,
    });
    mockTaskUpdate.mockResolvedValue({ id: "t1", endTime: new Date() });

    const res = await postTaskAction(makeRequest({ method: "POST", body: { action: "end" } }));

    expect(res.status).toBe(200);
    const body = res.body as { closed: { id: string }; opened: null };
    expect(body.closed.id).toBe("t1");
    expect(body.opened).toBeNull();
  });

  it("実行中タスクが無い状態でendすると400（終業できるものが無い）", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue(null);

    const res = await postTaskAction(makeRequest({ method: "POST", body: { action: "end" } }));

    expect(res.status).toBe(400);
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it("他組織・他ユーザーの実行中タスクを拾わないよう、findFirstをorganizationId・userIdでスコープする", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue(null);
    mockTaskCreate.mockResolvedValue({ id: "t1" });

    await postTaskAction(makeRequest({ method: "POST", body: { action: "switch", projectId: null, name: "作業" } }));

    expect(mockTaskFindFirst).toHaveBeenCalledWith({
      where: { organizationId: "org1", userId: "u1", endTime: null },
      orderBy: { startTime: "desc" },
    });
  });
});

describe("getTasksInRange", () => {
  it("未認証なら401", async () => {
    mockRequireOrganizationContext.mockResolvedValue(null);
    const res = await getTasksInRange(makeRequest({ query: { start: "2026-07-01T00:00:00Z", end: "2026-07-02T00:00:00Z" } }));
    expect(res.status).toBe(401);
  });

  it("start/endが不正な日時なら400", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    const res = await getTasksInRange(makeRequest({ query: { start: "not-a-date", end: "2026-07-02T00:00:00Z" } }));
    expect(res.status).toBe(400);
  });

  it("end <= start（境界含む）は400", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    const res = await getTasksInRange(
      makeRequest({ query: { start: "2026-07-02T00:00:00Z", end: "2026-07-02T00:00:00Z" } }),
    );
    expect(res.status).toBe(400);
  });

  it("正常な範囲なら本人・自組織のタスクのみ取得する", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindMany.mockResolvedValue([{ id: "t1" }]);

    const res = await getTasksInRange(
      makeRequest({ query: { start: "2026-07-01T00:00:00Z", end: "2026-07-02T00:00:00Z" } }),
    );

    expect(res.status).toBe(200);
    const args = mockTaskFindMany.mock.calls[0]?.[0];
    expect(args.where.organizationId).toBe("org1");
    expect(args.where.userId).toBe("u1");
  });
});

describe("patchTask", () => {
  it("未認証なら401", async () => {
    mockRequireOrganizationContext.mockResolvedValue(null);
    const res = await patchTask(makeRequest({ method: "PATCH", body: { name: "改名" } }), { id: "t1" });
    expect(res.status).toBe(401);
  });

  it("他者・他組織のタスクIDは404（存在を漏らさない）", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue(null);

    const res = await patchTask(makeRequest({ method: "PATCH", body: { name: "改名" } }), { id: "others-task" });

    expect(res.status).toBe(404);
    expect(mockTaskFindFirst).toHaveBeenCalledWith({ where: { id: "others-task", organizationId: "org1", userId: "u1" } });
  });

  it("不正なJSONボディは400", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue({ id: "t1", name: "旧名", projectId: null, startTime: new Date(), endTime: null });

    const res = await patchTask(makeRequest({ method: "PATCH", body: "not json" }), { id: "t1" });
    expect(res.status).toBe(400);
  });

  it("構造が不正なボディ（parseTaskPatch）は400", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue({ id: "t1", name: "旧名", projectId: null, startTime: new Date(), endTime: null });

    const res = await patchTask(makeRequest({ method: "PATCH", body: { name: 123 } }), { id: "t1" });
    expect(res.status).toBe(400);
  });

  it("開始時刻より終了時刻が前（意味的に不正、validateTaskEdit）は400", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue({
      id: "t1",
      name: "既存タスク",
      projectId: null,
      startTime: new Date("2026-07-22T10:00:00Z"),
      endTime: null,
    });

    const res = await patchTask(
      makeRequest({ method: "PATCH", body: { endTime: "2026-07-22T09:00:00Z" } }),
      { id: "t1" },
    );

    expect(res.status).toBe(400);
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it("他組織のprojectIdを指定すると400（組織を跨いだ紐付け防止）", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue({
      id: "t1",
      name: "既存タスク",
      projectId: null,
      startTime: new Date("2026-07-22T10:00:00Z"),
      endTime: null,
    });
    mockProjectFindFirst.mockResolvedValue(null);

    const res = await patchTask(
      makeRequest({ method: "PATCH", body: { projectId: "others-project" } }),
      { id: "t1" },
    );

    expect(res.status).toBe(400);
    expect(mockProjectFindFirst).toHaveBeenCalledWith({
      where: { id: "others-project", organizationId: "org1" },
    });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it("正常な更新は保存され、name はトリムされる", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue({
      id: "t1",
      name: "旧名",
      projectId: null,
      startTime: new Date("2026-07-22T09:00:00Z"),
      endTime: new Date("2026-07-22T10:00:00Z"),
    });
    mockTaskUpdate.mockResolvedValue({ id: "t1", name: "新名" });

    const res = await patchTask(makeRequest({ method: "PATCH", body: { name: "  新名  " } }), { id: "t1" });

    expect(res.status).toBe(200);
    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { name: "新名", projectId: null, startTime: expect.any(Date), endTime: expect.any(Date) },
    });
  });

  it("projectIdをnullにすると未分類として保存できる", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue({
      id: "t1",
      name: "既存",
      projectId: "p1",
      startTime: new Date("2026-07-22T09:00:00Z"),
      endTime: new Date("2026-07-22T10:00:00Z"),
    });
    mockTaskUpdate.mockResolvedValue({ id: "t1", projectId: null });

    const res = await patchTask(makeRequest({ method: "PATCH", body: { projectId: null } }), { id: "t1" });

    expect(res.status).toBe(200);
    expect(mockProjectFindFirst).not.toHaveBeenCalled();
    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: expect.objectContaining({ projectId: null }),
    });
  });
});

describe("deleteTask", () => {
  it("未認証なら401", async () => {
    mockRequireOrganizationContext.mockResolvedValue(null);
    const res = await deleteTask(makeRequest({}), { id: "t1" });
    expect(res.status).toBe(401);
  });

  it("他者・他組織のタスクIDは404（削除は実行されない）", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue(null);

    const res = await deleteTask(makeRequest({}), { id: "others-task" });

    expect(res.status).toBe(404);
    expect(mockTaskDelete).not.toHaveBeenCalled();
  });

  it("本人・自組織のタスクは削除できる", async () => {
    mockRequireOrganizationContext.mockResolvedValue(CTX);
    mockTaskFindFirst.mockResolvedValue({ id: "t1", organizationId: "org1", userId: "u1" });
    mockTaskDelete.mockResolvedValue({ id: "t1" });

    const res = await deleteTask(makeRequest({}), { id: "t1" });

    expect(res.status).toBe(200);
    expect(mockTaskDelete).toHaveBeenCalledWith({ where: { id: "t1" } });
  });
});
