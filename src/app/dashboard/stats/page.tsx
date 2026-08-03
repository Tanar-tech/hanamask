"use client";

// 工数集計ダッシュボードページ（SPEC.md Set D、docs/REQUIREMENTS.md §4.5）。
// 日/週/月の粒度を切り替えて、選択期間の合計実働時間とプロジェクト別内訳を棒グラフで表示する。
// ヘッダー・左アイコンメニュー・プロジェクト一覧は ../layout.tsx が共通で提供する（/goal指示）。

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Granularity, ProjectDuration } from "@/lib/aggregation";
import { useDashboardContext } from "../dashboard-context";
import { StatsChart } from "../stats-chart";

interface SummaryResponse {
  granularity: Granularity;
  start: string;
  end: string;
  projects: ProjectDuration[];
  totalDurationMs: number;
}

const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "日別",
  week: "週別",
  month: "月別",
};
const GRANULARITIES = Object.keys(GRANULARITY_LABELS) as Granularity[];

function formatHours(durationMs: number): string {
  return (durationMs / 3600_000).toFixed(1);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatRangeLabel(start: string, end: string): string {
  const startDate = new Date(start);
  // end は排他的境界（翌日/翌週/翌月の0時）なので、表示上は1ms引いて期間内の日付にする
  const inclusiveEndDate = new Date(new Date(end).getTime() - 1);
  return `${formatDate(startDate)} 〜 ${formatDate(inclusiveEndDate)}`;
}

export default function StatsPage() {
  const router = useRouter();
  const { projects } = useDashboardContext();
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    const res = await fetch(`/api/stats/summary?granularity=${granularity}`);
    if (res.status === 401) {
      router.replace("/sign-in");
      return;
    }
    if (!res.ok) {
      setError("集計データの取得に失敗しました。");
      return;
    }
    const data = (await res.json()) as SummaryResponse;
    setSummary(data);
    setError(null);
  }, [granularity, router]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <h1 className="text-lg font-semibold">工数集計</h1>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2" role="group" aria-label="集計粒度の切り替え">
          {GRANULARITIES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              aria-pressed={granularity === g}
              className={`rounded-full border px-4 py-1.5 text-sm ${
                granularity === g
                  ? "border-amber-600 bg-amber-100 font-semibold text-amber-900"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {GRANULARITY_LABELS[g]}
            </button>
          ))}
        </div>
        <a
          href={`/api/stats/export?granularity=${granularity}`}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          CSVダウンロード
        </a>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!summary ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{formatRangeLabel(summary.start, summary.end)}</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">
              合計 {formatHours(summary.totalDurationMs)} 時間
            </p>
          </div>
          <StatsChart projects={projects} data={summary.projects} />
        </>
      )}
    </section>
  );
}
