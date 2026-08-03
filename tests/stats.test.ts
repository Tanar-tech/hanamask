import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ApiRequest } from "@/server/http";

const { findManyMock, projectFindManyMock, requireOrganizationContextMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  projectFindManyMock: vi.fn(),
  requireOrganizationContextMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { task: { findMany: findManyMock }, project: { findMany: projectFindManyMock } },
}));

vi.mock("@/server/context", () => ({
  requireOrganizationContext: requireOrganizationContextMock,
}));

const { exportStatsSummary, getStatsSummary } = await import("@/server/handlers/stats");

function makeRequest(query: Record<string, string>): ApiRequest {
  return {
    method: "GET",
    path: "/api/stats/summary",
    query: new URLSearchParams(query),
    headers: {},
    cookies: {},
    body: null,
  };
}

describe("getStatsSummary", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    projectFindManyMock.mockReset();
    requireOrganizationContextMock.mockReset();
  });

  it("未認証(コンテキスト解決不可)なら401を返す", async () => {
    requireOrganizationContextMock.mockResolvedValue(null);
    const res = await getStatsSummary(makeRequest({ granularity: "day" }));
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("granularityが不正なら400を返す", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    const res = await getStatsSummary(makeRequest({ granularity: "year" }));
    expect(res.status).toBe(400);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("dateが不正な日時なら400を返す", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    const res = await getStatsSummary(makeRequest({ granularity: "day", date: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("organizationId・userIdでスコープしたPrismaクエリを発行する（他組織データ混入防止）", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    findManyMock.mockResolvedValue([]);
    await getStatsSummary(makeRequest({ granularity: "day", date: "2026-07-22T12:00:00Z" }));

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const args = findManyMock.mock.calls[0]?.[0];
    expect(args.where.organizationId).toBe("o1");
    expect(args.where.userId).toBe("u1");
  });

  it("プロジェクト別集計と合計を返す（休憩除外・実行中タスクは反映）", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    findManyMock.mockResolvedValue([
      {
        projectId: "p1",
        type: "work",
        startTime: new Date(2026, 6, 22, 9, 0),
        endTime: new Date(2026, 6, 22, 10, 0),
      },
      {
        projectId: "p1",
        type: "break",
        startTime: new Date(2026, 6, 22, 10, 0),
        endTime: new Date(2026, 6, 22, 10, 30),
      },
    ]);

    const res = await getStatsSummary(makeRequest({ granularity: "day", date: "2026-07-22T12:00:00Z" }));
    expect(res.status).toBe(200);
    const body = res.body as { projects: { projectId: string | null; durationMs: number }[]; totalDurationMs: number };
    expect(body.projects).toEqual([{ projectId: "p1", durationMs: 3600_000 }]);
    expect(body.totalDurationMs).toBe(3600_000);
  });
});

describe("exportStatsSummary", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    projectFindManyMock.mockReset();
    requireOrganizationContextMock.mockReset();
  });

  function csvLines(res: { body: unknown }): string[] {
    // BOM(先頭のU+FEFF)を除去してから改行分割する
    return String(res.body).replace(/^﻿/, "").split("\r\n");
  }

  it("未認証なら401を返しCSVは生成しない", async () => {
    requireOrganizationContextMock.mockResolvedValue(null);
    const res = await exportStatsSummary(makeRequest({ granularity: "day" }));
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("granularityが不正なら400を返す", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    const res = await exportStatsSummary(makeRequest({ granularity: "year" }));
    expect(res.status).toBe(400);
  });

  it("dateが不正な日時なら400を返す", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    const res = await exportStatsSummary(makeRequest({ granularity: "day", date: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("先頭にUTF-8 BOMを付与し、ファイル名を持つCSVとして返す", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    findManyMock.mockResolvedValue([]);
    projectFindManyMock.mockResolvedValue([]);

    const res = await exportStatsSummary(makeRequest({ granularity: "day", date: "2026-07-22T12:00:00Z" }));

    expect(res.status).toBe(200);
    expect(res.raw).toBe(true);
    expect(res.headers?.["content-type"]).toContain("text/csv");
    // ファイル名の日付部分はrange.start（ローカル日付をUTC変換したもの）に依存し実行環境の
    // タイムゾーンでずれ得るため、日付の具体値ではなく形式のみを検証する（TZ非依存にするため）。
    expect(res.headers?.["content-disposition"]).toMatch(/^attachment; filename="stats-day-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(String(res.body).startsWith("﻿")).toBe(true);
  });

  it("ヘッダー行・プロジェクト別内訳・合計行を出力する", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    findManyMock.mockResolvedValue([
      {
        projectId: "p1",
        type: "work",
        startTime: new Date(2026, 6, 22, 9, 0),
        endTime: new Date(2026, 6, 22, 10, 30),
      },
    ]);
    projectFindManyMock.mockResolvedValue([{ id: "p1", name: "会議" }]);

    const res = await exportStatsSummary(makeRequest({ granularity: "day", date: "2026-07-22T12:00:00Z" }));
    const lines = csvLines(res);

    expect(lines[0]).toBe("期間開始,期間終了,グループ,実働時間(時間)");
    expect(lines[1]).toContain("会議,1.50");
    expect(lines[2]).toContain("合計,1.50");
  });

  it("projectIdがnullのタスクは「グループ未設定」として集計される", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    findManyMock.mockResolvedValue([
      { projectId: null, type: "work", startTime: new Date(2026, 6, 22, 9, 0), endTime: new Date(2026, 6, 22, 10, 0) },
    ]);
    projectFindManyMock.mockResolvedValue([]);

    const res = await exportStatsSummary(makeRequest({ granularity: "day", date: "2026-07-22T12:00:00Z" }));
    const lines = csvLines(res);

    expect(lines[1]).toContain("グループ未設定,1.00");
  });

  it("紐づくプロジェクトが見つからない場合は「不明なグループ」にフォールバックする", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    findManyMock.mockResolvedValue([
      {
        projectId: "deleted-project",
        type: "work",
        startTime: new Date(2026, 6, 22, 9, 0),
        endTime: new Date(2026, 6, 22, 10, 0),
      },
    ]);
    projectFindManyMock.mockResolvedValue([]); // 該当プロジェクトは全件取得しても見つからない

    const res = await exportStatsSummary(makeRequest({ granularity: "day", date: "2026-07-22T12:00:00Z" }));
    const lines = csvLines(res);

    expect(lines[1]).toContain("不明なグループ,1.00");
  });

  it("グループ名にカンマ・改行・ダブルクォートを含む場合はCSVとして正しくエスケープする", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    findManyMock.mockResolvedValue([
      {
        projectId: "p1",
        type: "work",
        startTime: new Date(2026, 6, 22, 9, 0),
        endTime: new Date(2026, 6, 22, 10, 0),
      },
    ]);
    projectFindManyMock.mockResolvedValue([{ id: "p1", name: 'カンマ,改行\n"引用符"入り' }]);

    const res = await exportStatsSummary(makeRequest({ granularity: "day", date: "2026-07-22T12:00:00Z" }));
    const raw = String(res.body).replace(/^﻿/, "");

    // エスケープされたフィールドはダブルクォートで囲まれ、内部の"は""にエスケープされる
    expect(raw).toContain('"カンマ,改行\n""引用符""入り"');
  });

  it("アーカイブ済みプロジェクトの過去データも名前を解決できる", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    findManyMock.mockResolvedValue([
      {
        projectId: "p1",
        type: "work",
        startTime: new Date(2026, 6, 22, 9, 0),
        endTime: new Date(2026, 6, 22, 10, 0),
      },
    ]);
    projectFindManyMock.mockResolvedValue([{ id: "p1", name: "廃止済みグループ", isArchived: true }]);

    await exportStatsSummary(makeRequest({ granularity: "day", date: "2026-07-22T12:00:00Z" }));

    // アーカイブ済みも除外せず全件取得していること（organizationIdのみで絞り込み、isArchivedは条件に含めない）
    expect(projectFindManyMock).toHaveBeenCalledWith({ where: { organizationId: "o1" } });
  });

  it("他組織のタスク・プロジェクトが混入しない（organizationId・userIdでスコープ）", async () => {
    requireOrganizationContextMock.mockResolvedValue({ userId: "u1", organizationId: "o1" });
    findManyMock.mockResolvedValue([]);
    projectFindManyMock.mockResolvedValue([]);

    await exportStatsSummary(makeRequest({ granularity: "day", date: "2026-07-22T12:00:00Z" }));

    const taskArgs = findManyMock.mock.calls[0]?.[0];
    expect(taskArgs.where.organizationId).toBe("o1");
    expect(taskArgs.where.userId).toBe("u1");
    expect(projectFindManyMock).toHaveBeenCalledWith({ where: { organizationId: "o1" } });
  });
});
