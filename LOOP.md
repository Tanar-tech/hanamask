# Loop Configuration — hanamask (Claude Code)

## Active Loops

| Pattern | Cadence | Status | Command |
|---------|---------|--------|---------|
| Daily Triage | 1d | L1 report-only | `/loop 1d Run $loop-triage` |
| Dev Loop | 15m | L2 実装あり（サブエージェント起用）。現在は停止中 | `/loop 15m 開発を進めてください。…` |

`docs/TASKS.md` のタスクを実装してPRにする開発ループ。**各ラウンドの終了時に、作成・マージしたPR番号を `loop-run-log.md` に記録する**（2026-08-05、管理者指示）。ログだけを見て「いつ何が入ったか」を追えるようにするため。`STATE.md` の High Priority / Watch List も同時に更新する。

ループは管理者が `/loop` で起動し、`CronDelete` または「止めてください」の指示で停止する。無条件に自走し続けない（CLAUDE.md セーフティ機構）。

## Human Gates

- **PRは必ずdraftで作成し、マージは管理者が実施する。**ループがマージボタンを押すことはない（docs/safety.md、loop-constraints.md、CLAUDE.md 要点）。
- pushの前に、何をpushするかを管理者に伝える。
- No auto-fix until L2 checklist complete
- All high-risk paths: human review required (see docs/safety.md denylist)

## Worktrees

- Use `isolation: worktree` when spawning implementer sub-agents (L2+).
- One worktree per fix attempt; discard after verifier REJECT.

## Connectors (MCP)

- MCP optional for L1 report-only loops.
- For L2+: GitHub MCP to read CI/issues; scope connectors to read + comment only until trusted.

## Budget

- Max sub-agent spawns per run: 0 (L1) / Dev Loop は上限を設けないが、1トラック1worktreeとしファイル所有範囲を重複させない
- 詳細は [loop-budget.md](loop-budget.md)
- Review STATE.md daily
