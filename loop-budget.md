# Loop Budget — hanamask

## Daily limits

| Loop | Max runs/day | Max sub-agent spawns/run |
|------|--------------|--------------------------|
| Daily Triage | 2 | 0 (L1) / 2 (L2) |
| Dev Loop | 管理者が `/loop` を止めるまで | 上限なし（1トラック1worktree、ファイル所有範囲を重複させない） |

トークン消費の自動集計は行っていない。実績は `loop-run-log.md` にラウンドごとのPR番号として残す。

## On budget exceed

1. スケジューラを止める（`CronDelete`、または管理者へ停止を依頼する）
2. `loop-run-log.md` にイベントを追記する
3. `STATE.md` の High Priority に書き、管理者に報告する

## Kill switch

- 管理者からの「止めてください」の指示、または `loop-pause-all` フラグ
- 再開は管理者が `STATE.md` のフラグを解除してから

## 2026-08-16 改訂

このファイルは足場作成時の雛形のまま残っており、実態と合っていなかった。
削除した記述と理由:

- `npx @cobusgreyling/loop-cost` によるコスト見積り — このリポジトリで使ったことがなく、コマンドの実在も未確認だった
- Slack通知 — このプロジェクトにSlack連携は無い
- Daily Triage の 100k tokens/day 上限 — 集計する手段が無く、守られているか確認できなかった
- Dev Loop の記載漏れ — 実際に走っていたのはこちらだが、表に無かった
