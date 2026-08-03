"use client";

// 工数集計ダッシュボードの棒グラフ（SPEC.md Set D、docs/REQUIREMENTS.md §4.5）。
// Rechartsを使用し、プロジェクトごとの実働時間(時間単位)を横棒グラフで表示する。

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Project } from "@prisma/client";
import type { ProjectDuration } from "@/lib/aggregation";

interface Props {
  projects: Project[];
  data: ProjectDuration[];
}

const NO_PROJECT_LABEL = "グループ未設定";
const NO_PROJECT_COLOR = "#64748b";

export function StatsChart({ projects, data }: Props) {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const chartData = data
    .map((d) => {
      const project = d.projectId ? projectById.get(d.projectId) : undefined;
      return {
        name: project?.name ?? NO_PROJECT_LABEL,
        color: project?.color ?? NO_PROJECT_COLOR,
        hours: Number((d.durationMs / 3600_000).toFixed(2)),
      };
    })
    .sort((a, b) => b.hours - a.hours);

  if (chartData.length === 0) {
    return <p className="text-sm text-gray-500">この期間の実働時間データはありません。</p>;
  }

  return (
    <div className="h-72 w-full" role="img" aria-label="グループ別実働時間の棒グラフ">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" unit="h" />
          <YAxis type="category" dataKey="name" width={120} />
          <Tooltip formatter={(value) => [`${value}h`, "実働時間"]} />
          <Bar dataKey="hours">
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
