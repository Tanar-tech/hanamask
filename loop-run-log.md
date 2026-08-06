# Loop Run Log — hanamask

Append one entry per run. Prune entries older than 30 days.

## Format

```json
{
  "run_id": "2026-06-09T08:15:00Z",
  "pattern": "daily-triage | dev-loop",
  "duration_s": 45,
  "items_found": 4,
  "actions_taken": 1,
  "escalations": 0,
  "tokens_estimate": 52000,
  "tasks": ["T00"],
  "prs_opened": [1],
  "prs_merged": [1],
  "outcome": "report-only | fix-proposed | escalated | no-op | shipped"
}
```

`pattern` は `daily-triage`（CI・issueの定期巡回、report-only）と `dev-loop`（`docs/TASKS.md`のタスクを実装してPRにする開発ループ）を区別する。

**`dev-loop` の実行では、そのラウンドで作成・マージしたPR番号を `prs_opened` / `prs_merged` に必ず記録する**（2026-08-05、管理者指示）。ログだけを見て「いつ何が入ったか」を追えるようにするため。着手したタスクIDも `tasks` に記録する。数値が実測できない項目（`duration_s`・`tokens_estimate`）は推測で埋めず `null` を入れる。

## Recent Runs

<!-- Loop appends below this line -->

```json
{
  "run_id": "2026-08-04T00:00:00Z",
  "pattern": "daily-triage",
  "duration_s": 5,
  "items_found": 0,
  "actions_taken": 0,
  "escalations": 0,
  "tokens_estimate": 2000,
  "outcome": "no-op"
}
```

```json
{
  "run_id": "2026-08-04T00:05:00Z",
  "pattern": "daily-triage",
  "duration_s": 60,
  "items_found": 2,
  "actions_taken": 1,
  "escalations": 0,
  "tokens_estimate": null,
  "outcome": "report-only"
}
```

```json
{
  "run_id": "2026-08-03T02:05:00Z",
  "pattern": "daily-triage",
  "duration_s": 90,
  "items_found": 2,
  "actions_taken": 0,
  "escalations": 1,
  "tokens_estimate": null,
  "outcome": "report-only"
}
```

```json
{
  "run_id": "2026-08-03T06:06:00Z",
  "pattern": "daily-triage",
  "duration_s": 120,
  "items_found": 1,
  "actions_taken": 0,
  "escalations": 1,
  "tokens_estimate": null,
  "outcome": "report-only"
}
```
```json
{
  "run_id": "2026-08-04T08:58:00Z",
  "pattern": "dev-loop",
  "duration_s": null,
  "items_found": 4,
  "actions_taken": 6,
  "escalations": 1,
  "tokens_estimate": null,
  "tasks": ["T16", "T17", "T18", "T19", "T20", "T21"],
  "prs_opened": [31, 32, 33, 34, 35, 36],
  "prs_merged": [31, 32, 33, 34, 35, 36],
  "outcome": "shipped"
}
```

```json
{
  "run_id": "2026-08-05T05:22:00Z",
  "pattern": "dev-loop",
  "duration_s": null,
  "items_found": 2,
  "actions_taken": 4,
  "escalations": 0,
  "tokens_estimate": null,
  "tasks": ["T21", "T22", "T23", "T24"],
  "prs_opened": [37, 38, 39, 40],
  "prs_merged": [37, 38, 39, 40],
  "outcome": "shipped"
}
```

```json
{
  "run_id": "2026-08-05T05:43:00Z",
  "pattern": "dev-loop",
  "duration_s": null,
  "items_found": 3,
  "actions_taken": 4,
  "escalations": 2,
  "tokens_estimate": null,
  "tasks": ["T23", "T25", "T26", "T27"],
  "prs_opened": [41, 42, 43, 44],
  "prs_merged": [41, 42, 43, 44],
  "outcome": "shipped"
}
```

```json
{
  "run_id": "2026-08-05T06:17:00Z",
  "pattern": "dev-loop",
  "duration_s": null,
  "items_found": 4,
  "actions_taken": 8,
  "escalations": 1,
  "tokens_estimate": null,
  "tasks": ["T24", "T25", "T26", "T28"],
  "prs_opened": [45, 46, 47, 48, 49, 50, 51, 52],
  "prs_merged": [45, 46, 47, 48, 49, 50, 51, 52],
  "outcome": "shipped"
}
```

```json
{
  "run_id": "2026-08-05T06:40:00Z",
  "pattern": "dev-loop",
  "duration_s": null,
  "items_found": 1,
  "actions_taken": 2,
  "escalations": 0,
  "tokens_estimate": null,
  "tasks": ["T28"],
  "prs_opened": [53, 54],
  "prs_merged": [53, 54],
  "outcome": "shipped"
}
```

```json
{
  "run_id": "2026-08-06T01:05:00Z",
  "pattern": "dev-loop",
  "duration_s": null,
  "items_found": 3,
  "actions_taken": 5,
  "escalations": 1,
  "tokens_estimate": null,
  "tasks": ["T25", "T27"],
  "prs_opened": [56, 57, 58],
  "prs_merged": [56, 57, 58],
  "outcome": "shipped"
}
```

```json
{
  "run_id": "2026-08-06T02:00:00Z",
  "pattern": "dev-loop",
  "duration_s": null,
  "items_found": 5,
  "actions_taken": 6,
  "escalations": 1,
  "tokens_estimate": null,
  "tasks": ["T25", "T29"],
  "prs_opened": [59, 60, 61, 62, 63, 64, 65],
  "prs_merged": [59, 60, 61, 62, 63, 64, 65],
  "outcome": "shipped"
}
```
