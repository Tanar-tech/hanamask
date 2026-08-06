# hunk による差分レビュー

[hunk](https://github.com/modem-dev/hunk) は、AIエージェントが書いた変更をレビューすることを主眼に置いたターミナル差分ビューア（MIT / Modem製）。変更ファイルのサイドバー・シンタックスハイライト付き差分に加え、**差分行の真横にインラインコメントを置ける**点が `git diff` の生出力との差になる。人間もエージェントも同じコメント欄を使えるため、指摘の位置がチャットのログではなく差分そのものに残る。

本リポジトリでは、[docs/GOVERNANCE.md](GOVERNANCE.md) §5 のレビューおよび §7.1 手順4（herdrセッションの成果確認）における差分確認の主手段として採用する。

検証済みバージョン: **0.17.7**（2026-08-06）。

## 前提

- Node.js 18以上が必要（本プロジェクトは22以上を要求するため自動的に満たす）。
- **WSL側にインストールする**。hunkはgitの作業ツリーを直接読むため、リポジトリと同じ環境に置く必要がある。Windows側のPowerShellで動作する herdr（[docs/HERDR.md](HERDR.md)）とはインストール先が異なる。
- **コメントはhunkのセッションを終了すると消える**。hunkは作業中のレビュー用であり、記録を残す場所ではない。採否が確定した指摘はPRコメントか `structured-review` の出力に転記する。
- TUIはあくまで人間が見るもの。エージェントは `hunk diff` を直接起動せず、後述の `hunk session` コマンドでセッションを操作する。

## インストール

```bash
npm i -g hunkdiff   # パッケージ名は hunkdiff、コマンド名は hunk
hunk --version
```

## 設定

| ファイル | 用途 |
|---|---|
| `.hunk/config.toml` | リポジトリ共通設定（コミット済み）。`vcs` / `mode` / `agent_notes` のみ置く |
| `~/.config/hunk/config.toml` | 個人設定。テーマ・行番号・折り返し等の好みはこちら |

リポジトリ側で `agent_notes = true` にしてあるのは、エージェントが投下した指摘を既定で表示するため。その他の主なキーは `theme` / `watch` / `exclude_untracked` / `line_numbers` / `wrap_lines` / `menu_bar` / `transparent_background`。

設定は worktree のルートからも読まれるため、herdrで作った各worktreeにも自動的に効く。なお値が不正な場合（`mode = "bogus"` 等）は警告なく既定値にフォールバックするため、設定が効かないときはキー名の誤記を疑う。TOMLの構文自体が壊れている場合は `hunk: Failed to parse toml` で起動に失敗するが、どのファイルが原因かは表示されない。

## 基本ワークフロー（herdr フローの手順4）

1. herdrのセッションが `idle`（完了）になったら、対象worktreeで hunk を起動する。

   ```bash
   cd <worktree-path>
   hunk diff --watch
   ```

   `--watch` は作業ツリーの変化に追従して自動リロードする。差し戻し後の修正をそのまま追える。

2. 差分を読み、指摘は画面上の `[+]` からインラインコメントとして書く。`a` キーでエージェントのコメントの表示/非表示を切り替えられる。
3. レビューの観点は [docs/GOVERNANCE.md](GOVERNANCE.md) §5 に従う（差分の意図理解・過剰実装・セキュリティ・規約整合）。
4. 確定した指摘はPRコメントに転記してから、hunkのセッションを閉じる。

## コマンド

| コマンド | 内容 |
|---|---|
| `hunk diff` | 作業ツリーの変更をレビューする（未追跡ファイルを含む） |
| `hunk diff --watch` | 変更に追従して自動リロードする |
| `hunk diff --staged` | ステージ済みの変更のみをレビューする |
| `hunk diff <left> <right>` | 2ファイルを直接比較する |
| `hunk show [target]` | 直近コミット（または指定ref）をレビューする |
| `hunk patch [file]` | パッチファイルまたは標準入力をレビューする |
| `hunk skill path` | エージェント連携用スキルのパスを表示する |

`--exclude-untracked` で未追跡ファイルを除外できる。

## エージェント連携

エージェントはローカルデーモン経由の `hunk session` サブコマンドでセッションを操作する。**画面を読むのではなくCLIで制御する**点に注意する。

利用するときは、エージェントに次を指示する。

```
`hunk skill path` を実行してスキルを読み込み、それに従って操作すること。
```

スキルは hunk のインストール先に同梱されており、本リポジトリには複製しない（hunk本体の更新に自動追従させるため）。主なコマンドは以下。

```bash
hunk session list                                   # 稼働中のセッションを探す
hunk session review --repo . --json                 # ファイル・hunk構造を把握する
hunk session navigate --repo . --file src/App.tsx --new-line 372
hunk session comment add --repo . --file README.md --new-line 103 --summary "..."
hunk session comment list --repo . --type user      # 人間が書いた指摘を読む
hunk session reload --repo <worktree-path> -- diff  # 対象worktreeの差分に差し替える
```

セッションはリポジトリのルートパスで照合される（`--repo`）。複数worktreeを同時に開いていても取り違えないため、herdrでの並列運用と併用できる。複数セッションが同一リポジトリを指す場合はセッションIDで明示する。

## 注意事項

- エージェントが `hunk session list` で「No active Hunk sessions」を返す場合、hunkが起動していないか、エージェントのサンドボックスがlocalhostを遮断している。前者なら人間側でhunkを開く。
- 指摘を全hunkに機械的に付けさせない。人間が自力で気づけない箇所（意図・構造・リスク・追随作業）に絞らせる。
- 複数の指摘をまとめて投下する場合は `hunk session comment apply --stdin` のJSONバッチを使う（1件ずつシェルを呼ぶより速く、投入前にバッチ全体が検証される）。
