---
name: e2e-runner
description: work-manager（Next.js Webアプリ）をローカルで実際に起動してE2E動作確認を行う。SPEC.mdの受け入れ条件確認、UI変更の実機確認、管理者へ渡す起動手順・スクリプトの事前検証に使う（Parallel Subagent Frameworkのフェーズ外でも使用可）。
---

# e2e-runner

`SPEC.md` の受け入れ条件や管理者向け成果物（起動スクリプト等）を、実際にアプリを起動して確認する。テスト・型チェックが通ることと機能が正しく動くことは別なので、UI変更・起動手順の変更を伴う場合は本スキルで実機確認する。

## 起動方法

- 標準の起動: `./scripts/dev.ps1`（PostgreSQL自動準備・.env.local生成・マイグレーション・シード・devサーバー起動まで全自動）。
- devサーバーのみ（DB起動済みの場合）: `npm run dev`。
- 起動確認: `http://localhost:3000` が200を返すこと。
- 動作確認用ログイン: `admin@example.com` / `password123`（`prisma/seed.ts` が投入）。

## 確認手順

1. アプリを起動する（上記）。
2. HTTPレベルの確認（curl等）: ランディング(`/`)200 → `/api/auth/login` へ `{"email","password"}` をPOSTしてログイン（Set-Cookie: wm_session） → Cookie付きで `/api/auth/session` が200になることを確認 → 対象機能のAPI/ページを実際に叩く。PowerShellからcurl.exeにJSONを渡すときは引数エスケープ事故を避けるため `--data "@file.json"` のファイル渡しを使う。
3. 認可の確認: 未認証アクセスが401/リダイレクトになること、他組織のデータが見えないことを必ず確認する（docs/GOVERNANCE.md §8）。
4. `SPEC.md` Part 1 の受け入れ条件を1件ずつ実際の操作で確認する。
5. 確認結果（golden pathとエッジケース、期待通りだったか）を報告する。確認できなかった項目は「未確認」と明記し、成功したと主張しない。

## 管理者へ成果物を渡す前の必須検証（2026-07-24追記・実障害の再発防止）

管理者に「このコマンドを実行してください」と渡すものは、**管理者と同一の方法**で事前に実行して成功を確認する。ステップの個別実行・セッション内の代替手段による確認は、ファイルとしての実行時にしか出ない問題を見逃すため、検証として不十分。

- PowerShellスクリプトは `powershell -NoProfile -Command "Set-Location <リポジトリ>; ./scripts/xxx.ps1"` のように**新規プロセスでファイルとして**実行して確認する（プロファイル・セッション状態・環境変数を引き継がない）。
- **PowerShellスクリプト（.ps1）は必ずUTF-8 BOM付きで保存する**。Windows PowerShell 5.1はBOMなしファイルをANSI（日本語環境ではShift-JIS）として解釈するため、日本語コメントを含むスクリプトは文字化けし構文エラーで実行不能になる（2026-07-24に `scripts/dev.ps1` で実際に発生）。ClaudeのWriteツールはBOMなしで書くため、.ps1作成・編集後は必ずBOMを付与する:
  ```powershell
  $text = [System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($true))
  ```
- 初回実行時にしか通らないパス（ダウンロード・initdb・.env生成等）と、2回目以降のパス（既存資産の再利用）の両方を可能な範囲で確認する。
- 実行後は起動したプロセス（devサーバー・DB）の状態を報告する（起動したまま渡すのか、停止したのかを明記）。

## 絶対ルール

- テストの削除・無効化や、確認をスキップして「確認済み」と報告することは禁止。
- 動作確認できなかった場合は「未確認」と明記する。
