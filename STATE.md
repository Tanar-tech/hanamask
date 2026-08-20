# Loop State — hanamask

Last run: 2026-08-19T12:20Z (dev-loop, shipped — **v1.0.1 リリース**。PR #179 / #183 / #184 / #187 / #188 / #189 / #192 / #193 / #194)

## High Priority (loop is acting or waiting on human)

- **なし。**`docs/TASKS.md` の T00〜T47・T51〜T53 は完了（T12は凍結中）。**オープンなPRもゼロ。**
- 残っているのは **T48〜T50（ローカルLLM組み込み）** で、**別セッションが `feature/local-llm` で進行中**。詳細は `docs/TASKS-local-llm.md`。

## Resolved (this run)

- **T51 開発依存の自動マージ** — `development` グループのPRだけ `gh pr merge --auto` を有効化する（PR #187）。**実物で両分岐を確認済み**: #173（`development`）はCIが緑になってから自動マージされ、#172（グループ未定義）は `skipped`。**無条件マージになっていない**ことが本体の検証だった。
- **T52 アクション更新の扱い** — `github-actions` にグループが未定義で `dependency-group` が空になり、**自動マージから一律に外れていた**。`actions` グループを新設しマイナー以下を対象にした（PR #189）。
- **T53 #172 の判断** — マージした。**確認の過程で、E2Eのスクリーンショットが元から保存されていない不具合を発見**（PR #192。詳細は下記）。
- **v1.0.1 リリース** — アプリのコードは無変更で、**Electronランタイムの更新のみ**（43.3.0 → 43.4.0）。SHA-512が `latest.yml` と一致することを匿名ダウンロードで実測。

## Watch List

- **E2Eのスクリーンショットが長期間保存されていなかった**（PR #192で解消）。**3つが重なって静かに壊れていた**: ①保存ステップの条件が `failure()` で普段走らない ②`if-no-files-found: ignore` でファイルが無くても警告すら出ずステップは `success` ③`.artifacts` が隠しディレクトリで `upload-artifact` v4.4.0 以降の既定で除外。**緑でも赤でも異常に見えない組み合わせ**だった。
- **`production-runtime` の分離が実際に効いた。**`electron` 43.4.0 のPR（#190）で `dependency-type` は `direct:development` だが `dependency-group` は `production-runtime`。**型だけで判定していたらマイナー更新として自動マージされていた**（配布物のランタイムが黙って変わる）。
- **`electron-updater` による自動更新が未導入。**前提は揃った（公開リポジトリ、`latest.yml` が2リリース連続で正しく発行）。**依存追加は `docs/GOVERNANCE.md` §6 の承認事項**で、まだタスク化していない。
- **インストーラーが未署名。**public化により Certum Open Source Code Signing（年$50〜70）の条件を満たすようになった（`docs/SIGNING.md` 選択肢C）。方針は据え置きで、費用判断は管理者。
- **CIはパッケージ後の挙動を見ていない。**Electronのようにランタイムが変わる更新は、リリース時のインストール確認が最後の砦。
- **単体テストの上限は40秒**（WindowsのI/O停滞対策）。**E2Eは 1.0.1 のリリース前に1度フレークした**（`task-flow.spec.ts`）。単独実行・全体実行2回・CIいずれも緑で再現せず。**失敗時の詳細ログを取り逃がしたので、再発したら詳細を取る。**
- **`strict: true` により、マージのたびに他PRの更新が要る**（管理者判断で維持）。auto-merge はブランチを自動更新しないが、**Dependabot は自力で rebase する**ことを実測済み。

## Recent Noise (ignored this run)

- CIは直近で失敗ゼロ。オープンなGitHub issueも無し。
- **書き込み権限を持つのは `Tanar-tech` のみ、fork 0件。**第三者はマージできない（止めているのはブランチ保護ではなくリポジトリ権限）。
- ブランチ保護は `enforce_admins: true` / 必要な承認数0 / force push・削除禁止。**承認数0は単独開発では必然**（自分のPRを自分で承認できないため）。

---
Run log: [loop-run-log.md](loop-run-log.md)
