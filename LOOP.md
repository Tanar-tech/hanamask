# Loop Configuration — Minimal Triage (Claude Code)

## Active Loops

| Pattern | Cadence | Status | Command |
|---------|---------|--------|---------|
| Daily Triage | 1d | L1 report-only | `/loop 1d Run $loop-triage` |
| Dev Loop | 10m | L2 実装あり（サブエージェント起用） | `/loop 10m 開発を続けてください。…` |

`docs/TASKS.md` のタスクを実装してPRにする開発ループ。**各ラウンドの終了時に、作成・マージしたPR番号を `loop-run-log.md` に記録する**（2026-08-05、管理者指示）。ログだけを見て「いつ何が入ったか」を追えるようにするため。`STATE.md` の High Priority / Watch List も同時に更新する。

## Human Gates

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
- Review STATE.md daily

## Links

- Pattern: [daily-triage](../../patterns/daily-triage.md)
- Checklist: [loop-design-checklist](../../docs/loop-design-checklist.md)