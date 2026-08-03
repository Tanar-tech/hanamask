import { csv, json, type ApiRequest, type ApiResponse } from "../http";
import { requireOrganizationContext } from "../context";
import { prisma } from "@/lib/db";
import { aggregateByProject, getRangeForGranularity, totalDurationMs, type Granularity } from "@/lib/aggregation";

// 工数集計ダッシュボード用ハンドラ（SPEC.md Set D、docs/REQUIREMENTS.md §4.5）。
// src/server/handlers/tasks.ts の getTasksInRange と同じクエリパターン（organizationId + userId で
// スコープし、期間に重なるタスクを実行中含めて取得する）を踏襲する。

function parseGranularity(value: string | null): Granularity | null {
  if (value === "day" || value === "week" || value === "month") {
    return value;
  }
  return null;
}

// GET /api/stats/summary?granularity=day|week|month&date=ISO(省略時は現在時刻)
// 選択粒度から算出した期間内の、プロジェクト別実働時間集計と合計を返す。
// 休憩(type='break')は集計に含めず、実行中タスク(endTime未確定)は現在時刻までの経過として計算する。
export async function getStatsSummary(req: ApiRequest): Promise<ApiResponse> {
  const ctx = await requireOrganizationContext(req);
  if (!ctx) {
    return json(401, { error: "unauthorized" });
  }

  const granularity = parseGranularity(req.query.get("granularity"));
  if (!granularity) {
    return json(400, { error: "granularity は day, week, month のいずれかである必要があります。" });
  }

  const dateParam = req.query.get("date");
  const reference = dateParam ? new Date(dateParam) : new Date();
  if (Number.isNaN(reference.getTime())) {
    return json(400, { error: "date はISO日時である必要があります。" });
  }

  const range = getRangeForGranularity(granularity, reference);
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      startTime: { lt: range.end },
      OR: [{ endTime: { gt: range.start } }, { endTime: null }],
    },
  });

  const projects = aggregateByProject(tasks, now, range);
  const total = totalDurationMs(projects);

  return json(200, {
    granularity,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    projects,
    totalDurationMs: total,
  });
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

// GET /api/stats/export?granularity=day|week|month&date=ISO
// getStatsSummaryと同じ集計をCSVでダウンロードさせる（docs/REQUIREMENTS.md §4.5、要求事項#5）。
export async function exportStatsSummary(req: ApiRequest): Promise<ApiResponse> {
  const ctx = await requireOrganizationContext(req);
  if (!ctx) {
    return json(401, { error: "unauthorized" });
  }

  const granularity = parseGranularity(req.query.get("granularity"));
  if (!granularity) {
    return json(400, { error: "granularity は day, week, month のいずれかである必要があります。" });
  }

  const dateParam = req.query.get("date");
  const reference = dateParam ? new Date(dateParam) : new Date();
  if (Number.isNaN(reference.getTime())) {
    return json(400, { error: "date はISO日時である必要があります。" });
  }

  const range = getRangeForGranularity(granularity, reference);
  const now = new Date();

  const [tasks, allProjects] = await Promise.all([
    prisma.task.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        startTime: { lt: range.end },
        OR: [{ endTime: { gt: range.start } }, { endTime: null }],
      },
    }),
    // アーカイブ済み・削除済みグループの過去データもCSVで名前が引けるよう全件（アーカイブ含む）取得する
    prisma.project.findMany({ where: { organizationId: ctx.organizationId } }),
  ]);

  const projectById = new Map(allProjects.map((p) => [p.id, p]));
  const durations = aggregateByProject(tasks, now, range);
  const total = totalDurationMs(durations);

  const startLabel = range.start.toISOString();
  const endLabel = range.end.toISOString();
  const rows: string[][] = [
    ["期間開始", "期間終了", "グループ", "実働時間(時間)"],
    ...durations.map((d) => [
      startLabel,
      endLabel,
      d.projectId ? (projectById.get(d.projectId)?.name ?? "不明なグループ") : "グループ未設定",
      (d.durationMs / 3600_000).toFixed(2),
    ]),
    [startLabel, endLabel, "合計", (total / 3600_000).toFixed(2)],
  ];

  const filename = `stats-${granularity}-${range.start.toISOString().slice(0, 10)}.csv`;
  // Excelでの文字化けを避けるためUTF-8 BOMを付与する
  return csv(200, filename, `﻿${toCsv(rows)}`);
}
