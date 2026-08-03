import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "@/server/http";

// SPEC.md セットC: createProject ハンドラのテスト。
// requireOrganizationContext と prisma をモックし、認可・バリデーション・重複名チェックを検証する。

const { mockRequireOrganizationContext } = vi.hoisted(() => ({
  mockRequireOrganizationContext: vi.fn(),
}));
vi.mock("@/server/context", () => ({
  requireOrganizationContext: mockRequireOrganizationContext,
}));

const { mockProjectFindFirst, mockProjectCreate, mockProjectFindMany, mockProjectUpdate, mockProjectDelete } =
  vi.hoisted(() => ({
    mockProjectFindFirst: vi.fn(),
    mockProjectCreate: vi.fn(),
    mockProjectFindMany: vi.fn(),
    mockProjectUpdate: vi.fn(),
    mockProjectDelete: vi.fn(),
  }));
vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findFirst: mockProjectFindFirst,
      create: mockProjectCreate,
      findMany: mockProjectFindMany,
      update: mockProjectUpdate,
      delete: mockProjectDelete,
    },
  },
}));

const { createProject, deleteProject, listProjects, updateProject } = await import("@/server/handlers/projects");

function makeRequest(body: unknown, query: Record<string, string> = {}): ApiRequest {
  return {
    method: "POST",
    path: "/api/projects",
    query: new URLSearchParams(query),
    headers: {},
    cookies: {},
    body: body === undefined ? null : JSON.stringify(body),
  };
}

beforeEach(() => {
  mockRequireOrganizationContext.mockReset();
  mockProjectFindFirst.mockReset();
  mockProjectCreate.mockReset();
  mockProjectFindMany.mockReset();
  mockProjectUpdate.mockReset();
  mockProjectDelete.mockReset();
});

describe("createProject", () => {
  it("未認証なら401", async () => {
    mockRequireOrganizationContext.mockResolvedValue(null);
    const res = await createProject(makeRequest({ name: "新規プロジェクト" }));
    expect(res.status).toBe(401);
    expect(mockProjectCreate).not.toHaveBeenCalled();
  });

  it("正常な名前で作成でき、組織IDが付与される", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValue(null);
    mockProjectCreate.mockResolvedValue({ id: "p1", organizationId: "org1", name: "新規プロジェクト" });

    const res = await createProject(makeRequest({ name: "新規プロジェクト" }));

    expect(res.status).toBe(200);
    expect(mockProjectCreate).toHaveBeenCalledWith({
      data: { organizationId: "org1", name: "新規プロジェクト" },
    });
    expect((res.body as { project: { id: string } }).project.id).toBe("p1");
  });

  it("前後の空白はトリムされて保存される", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValue(null);
    mockProjectCreate.mockResolvedValue({ id: "p1", organizationId: "org1", name: "設計" });

    await createProject(makeRequest({ name: "  設計  " }));

    expect(mockProjectCreate).toHaveBeenCalledWith({
      data: { organizationId: "org1", name: "設計" },
    });
  });

  it("空文字はエラーで弾かれる", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });

    const res = await createProject(makeRequest({ name: "   " }));

    expect(res.status).toBe(400);
    expect(mockProjectCreate).not.toHaveBeenCalled();
  });

  it("name未指定はエラーで弾かれる", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });

    const res = await createProject(makeRequest({}));

    expect(res.status).toBe(400);
  });

  it("同一組織内の重複名はエラーで弾かれる", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValue({ id: "existing", organizationId: "org1", name: "既存プロジェクト" });

    const res = await createProject(makeRequest({ name: "既存プロジェクト" }));

    expect(res.status).toBe(400);
    expect(mockProjectCreate).not.toHaveBeenCalled();
    expect(mockProjectFindFirst).toHaveBeenCalledWith({
      where: { organizationId: "org1", name: "既存プロジェクト" },
    });
  });

  it("不正なJSONボディは400", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    const req: ApiRequest = {
      method: "POST",
      path: "/api/projects",
      query: new URLSearchParams(),
      headers: {},
      cookies: {},
      body: "not json",
    };

    const res = await createProject(req);
    expect(res.status).toBe(400);
  });

  it("JSONリテラルnullのボディは400（例外にならない）", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    const res = await createProject(makeRequest(null));
    expect(res.status).toBe(400);
    expect(mockProjectCreate).not.toHaveBeenCalled();
  });
});

function makeGetRequest(query: Record<string, string> = {}): ApiRequest {
  return {
    method: "GET",
    path: "/api/projects",
    query: new URLSearchParams(query),
    headers: {},
    cookies: {},
    body: null,
  };
}

describe("listProjects", () => {
  it("未認証なら401", async () => {
    mockRequireOrganizationContext.mockResolvedValue(null);
    const res = await listProjects(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("デフォルトはアーカイブ済みを除外する", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindMany.mockResolvedValue([]);

    await listProjects(makeGetRequest());

    expect(mockProjectFindMany).toHaveBeenCalledWith({
      where: { organizationId: "org1", isArchived: false },
      orderBy: { name: "asc" },
    });
  });

  it("?all=1 のときはアーカイブ済みも含める", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindMany.mockResolvedValue([]);

    await listProjects(makeGetRequest({ all: "1" }));

    expect(mockProjectFindMany).toHaveBeenCalledWith({
      where: { organizationId: "org1" },
      orderBy: { name: "asc" },
    });
  });

  it("?all=0 等の他の値はデフォルト（除外）のまま", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindMany.mockResolvedValue([]);

    await listProjects(makeGetRequest({ all: "0" }));

    expect(mockProjectFindMany).toHaveBeenCalledWith({
      where: { organizationId: "org1", isArchived: false },
      orderBy: { name: "asc" },
    });
  });

  it("他組織のプロジェクトが混入しない（organizationIdで絞り込む）", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindMany.mockResolvedValue([{ id: "p1", organizationId: "org1" }]);

    const res = await listProjects(makeGetRequest());

    const call = mockProjectFindMany.mock.calls[0]?.[0] as { where: { organizationId: string } };
    expect(call.where.organizationId).toBe("org1");
    expect((res.body as { projects: unknown[] }).projects).toHaveLength(1);
  });
});

function makePatchRequest(body: unknown, id = "p1"): { req: ApiRequest; params: Record<string, string> } {
  return {
    req: {
      method: "PATCH",
      path: `/api/projects/${id}`,
      query: new URLSearchParams(),
      headers: {},
      cookies: {},
      body: body === undefined ? null : JSON.stringify(body),
    },
    params: { id },
  };
}

describe("updateProject", () => {
  it("未認証なら401", async () => {
    mockRequireOrganizationContext.mockResolvedValue(null);
    const { req, params } = makePatchRequest({ name: "改名" });
    const res = await updateProject(req, params);
    expect(res.status).toBe(401);
  });

  it("自組織に存在しないID（他組織のIDを含む）は404", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValue(null);

    const { req, params } = makePatchRequest({ name: "改名" }, "other-orgs-project");
    const res = await updateProject(req, params);

    expect(res.status).toBe(404);
    expect(mockProjectFindFirst).toHaveBeenCalledWith({
      where: { id: "other-orgs-project", organizationId: "org1" },
    });
  });

  it("名前を変更できる（前後の空白はトリム）", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValueOnce({ id: "p1", organizationId: "org1", name: "旧名" });
    mockProjectFindFirst.mockResolvedValueOnce(null); // 重複名チェック
    mockProjectUpdate.mockResolvedValue({ id: "p1", name: "新名" });

    const { req, params } = makePatchRequest({ name: "  新名  " });
    const res = await updateProject(req, params);

    expect(res.status).toBe(200);
    expect(mockProjectUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { name: "新名" } });
  });

  it("空文字の名前は400", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValueOnce({ id: "p1", organizationId: "org1", name: "旧名" });

    const { req, params } = makePatchRequest({ name: "   " });
    const res = await updateProject(req, params);

    expect(res.status).toBe(400);
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it("自分自身以外に同名があれば400（自分自身は除外して重複チェック）", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValueOnce({ id: "p1", organizationId: "org1", name: "旧名" });
    mockProjectFindFirst.mockResolvedValueOnce({ id: "p2", name: "新名" });

    const { req, params } = makePatchRequest({ name: "新名" });
    const res = await updateProject(req, params);

    expect(res.status).toBe(400);
    expect(mockProjectFindFirst).toHaveBeenLastCalledWith({
      where: { organizationId: "org1", name: "新名", id: { not: "p1" } },
    });
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it("色名やrrggbb以外の形式は400", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValue({ id: "p1", organizationId: "org1", name: "既存" });

    const { req, params } = makePatchRequest({ color: "red" });
    const res = await updateProject(req, params);

    expect(res.status).toBe(400);
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it("#rrggbb形式の色は許可される", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValue({ id: "p1", organizationId: "org1", name: "既存" });
    mockProjectUpdate.mockResolvedValue({ id: "p1", color: "#ff0000" });

    const { req, params } = makePatchRequest({ color: "#ff0000" });
    const res = await updateProject(req, params);

    expect(res.status).toBe(200);
    expect(mockProjectUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { color: "#ff0000" } });
  });

  it("isArchivedはboolean以外だと400", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValue({ id: "p1", organizationId: "org1", name: "既存" });

    const { req, params } = makePatchRequest({ isArchived: "true" });
    const res = await updateProject(req, params);

    expect(res.status).toBe(400);
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it("アーカイブ切替のみ指定すると名前チェックは走らない（1回のfindFirstのみ）", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValue({ id: "p1", organizationId: "org1", name: "既存" });
    mockProjectUpdate.mockResolvedValue({ id: "p1", isArchived: true });

    const { req, params } = makePatchRequest({ isArchived: true });
    const res = await updateProject(req, params);

    expect(res.status).toBe(200);
    expect(mockProjectFindFirst).toHaveBeenCalledTimes(1);
    expect(mockProjectUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { isArchived: true } });
  });

  it("不正なJSONボディは400", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValue({ id: "p1", organizationId: "org1", name: "既存" });
    const req: ApiRequest = {
      method: "PATCH",
      path: "/api/projects/p1",
      query: new URLSearchParams(),
      headers: {},
      cookies: {},
      body: "not json",
    };
    const res = await updateProject(req, { id: "p1" });
    expect(res.status).toBe(400);
  });
});

describe("deleteProject", () => {
  it("未認証なら401", async () => {
    mockRequireOrganizationContext.mockResolvedValue(null);
    const res = await deleteProject(makeGetRequest(), { id: "p1" });
    expect(res.status).toBe(401);
  });

  it("自組織に存在しないIDは404で、deleteは呼ばれない", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValue(null);

    const res = await deleteProject(makeGetRequest(), { id: "other-orgs-project" });

    expect(res.status).toBe(404);
    expect(mockProjectDelete).not.toHaveBeenCalled();
  });

  it("自組織のプロジェクトは削除できる", async () => {
    mockRequireOrganizationContext.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    mockProjectFindFirst.mockResolvedValue({ id: "p1", organizationId: "org1" });
    mockProjectDelete.mockResolvedValue({ id: "p1" });

    const res = await deleteProject(makeGetRequest(), { id: "p1" });

    expect(res.status).toBe(200);
    expect(mockProjectDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });
});
