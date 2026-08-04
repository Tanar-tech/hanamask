---
name: e2e-runner
description: hanamask（Electronデスクトップアプリ）を実際に起動してGUI/E2E動作確認を行う。SPEC.mdの受け入れ条件確認、UI変更の実機確認、MCPツール経由の操作がデスクトップUIに反映されることの確認に使う（Parallel Subagent Frameworkのフェーズ外でも使用可）。
---

# e2e-runner（GUI検証）

`SPEC.md` の受け入れ条件やUI変更を、実際にElectronアプリを起動して確認する。テスト・型チェックが通ることと機能が正しく動くことは別なので、UI変更・MCPツール追加を伴う場合は本スキルで実機確認する。

hanamaskはブラウザではなくElectronデスクトップアプリのため、Playwright MCPの `browser_*` ツール（`docs/web-debugging.md`）はそのままでは使えない。自動E2Eには `tests/e2e/`（Playwrightの `_electron` API、Vitestで実行）を使う。

## 検証方法の使い分け

| 状況 | 方法 |
|---|---|
| MCPツール経由の操作がUIに反映されるか（画面自動更新・永続化）を再現性高く確認したい | 自動E2E（`npm run test:e2e`） |
| 見た目・レイアウト・細かいUI調整の確認 | 手動起動（`npm run dev`）+ スクリーンショット |
| CI・PR前の最終確認 | 自動E2E |

## 自動E2E（`tests/e2e/`）

- 実行: `npm run test:e2e`（`npm run build` を実行してから `vitest.e2e.config.ts` でElectronアプリを実際に起動する。ビルド成果物`dist/`に対して実行するため、`npm run dev`のViteデブサーバーとは独立している）。
- 何を検証しているか（`tests/e2e/note-flow.spec.ts`）: Electronウィンドウの起動 → MCPクライアント（SDKの`Client`+`StreamableHTTPClientTransport`）で`create_note`を呼び出す → 開いているウィンドウに**手動リロードなしで**新しいノートが表示されることを確認 → アプリを再起動しても永続化されていることを確認。SPEC.mdの受け入れ条件を自動化したもの。
- テスト用DB/ポートの分離: `HANAMASK_DB_PATH`（一時ファイル）・`HANAMASK_MCP_PORT`（既定の39217とは別の39299固定）を環境変数で上書きして起動する。開発者が`npm run dev`で使っている実DB・実ポートには触れない。
- スクリーンショットは `tests/e2e/.artifacts/`（gitignore対象）に出力される。実行後にこのディレクトリを見て実際の画面を確認できる。
- **Linux/CI/WSLでの前提**: Electronのウィンドウ描画にはディスプレイが必要。ヘッドレスサーバー（WSL含む）では `xvfb-run npm run test:e2e` のようにXvfb配下で実行する。GUI環境（開発者のデスクトップ）では追加設定不要。

## 新しいUI機能・MCPツールを追加したときの対応

新しい受け入れ条件（SPEC.mdのPart 1）にUI反映が含まれる場合、`tests/e2e/note-flow.spec.ts` に倣ってシナリオを追加するか、新規specファイルを追加する（`tests/e2e/*.spec.ts`は自動でVitestに拾われる）。MCP経由の操作は極力SDKクライアント経由で行い、curl等での直接HTTP叩きは避ける（Streamable HTTPのセッション処理をSDKに任せた方が実際のAIエージェントの挙動に近い）。

## 手動起動での確認手順

1. `npm run dev` でアプリを起動する（"hanamask" というタイトルのウィンドウが開く）。
2. MCPクライアント役として、`tests/e2e/note-flow.spec.ts` の `createNoteViaMcp` と同様にSDKクライアントで呼び出すか、暫定的にAIエージェント（Claude Code等）を実際にMCPサーバー（`http://127.0.0.1:39217/mcp`）に接続して操作する。
3. `SPEC.md` Part 1 の受け入れ条件を1件ずつ実際の操作で確認する。UI変更を伴う場合はスクリーンショットで確認する（Claude Code自身がElectronウィンドウを直接スクリーンショットする手段がない場合は、`tests/e2e/`のスクリーンショット出力を活用するか、管理者に画面を見てもらう）。
4. 確認結果（golden pathとエッジケース、期待通りだったか）を報告する。確認できなかった項目は「未確認」と明記し、成功したと主張しない。

## 管理者へ成果物を渡す前の必須検証

管理者に「このコマンドを実行してください」と渡すものは、**管理者と同一の方法**で事前に実行して成功を確認する。ステップの個別実行・セッション内の代替手段による確認は、実際の実行時にしか出ない問題を見逃すため、検証として不十分。

- PowerShellスクリプトは新規プロセスでファイルとして実行して確認する（プロファイル・セッション状態・環境変数を引き継がない）。
- **PowerShellスクリプト（.ps1）は必ずUTF-8 BOM付きで保存する**。Windows PowerShell 5.1はBOMなしファイルをANSI（日本語環境ではShift-JIS）として解釈するため、日本語コメントを含むスクリプトは文字化けし構文エラーで実行不能になる（2026-07-24に `scripts/dev.ps1` で実際に発生）。ClaudeのWriteツールはBOMなしで書くため、.ps1作成・編集後は必ずBOMを付与する:
  ```powershell
  $text = [System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($true))
  ```

## 絶対ルール

- テストの削除・無効化や、確認をスキップして「確認済み」と報告することは禁止。
- 動作確認できなかった場合は「未確認」と明記する。
