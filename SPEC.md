# SPEC: 自動更新（T64）

> 2026-10-25 管理者承認の計画（既定オン・バックグラウンドDL→通知→再起動で適用・未署名のまま）を Part 1 / Part 2 形式に転記したもの。停止①は計画の承認で代えている。

## Part 1: 利用者向け

### 何を・なぜ

修正を出しても、今は利用者が Releases から入れ直さない限り届きません（HTTP2Shell の修正も同じ）。新しい版が出たら hanamask が自分で取ってきて、**利用者が選んだタイミングで**入れ替わるようにします。

### 画面イメージ・操作フロー

- **起動時（少し後）と6時間ごと**に、GitHub Releases に新しい版があるか確かめる。あれば裏でダウンロードする
- ダウンロードが終わると **OSの通知**「hanamask の新しい版（vX.Y.Z）の準備ができました」が出る。クリックでウィンドウが前に出る
- 画面上部に帯「**新しい版 vX.Y.Z の準備ができました。** ［再起動して更新］［あとで］」。「あとで」で閉じても、**次に hanamask を終了したときに入れ替わる**
- **設定画面**に「更新」欄: 現在のバージョン、チェック「**更新を自動で確認する**」（既定オン）、ボタン「**今すぐ確認**」、状態（確認中／vX.Y.Z をダウンロード中 NN%／最新です（最終確認: 日時）／準備ができました［再起動して更新］／確認できませんでした）
- **勝手に再起動しない。**ネットワークが無くても普通に使える（確認の失敗は状態に出すだけ）

### 外部との通信

アプリが外部と通信するのは**自動更新だけ**（GitHub Releases の `latest.yml` とインストーラーの取得）。ノート・タスクの中身は送らない。設定のチェックを外すと自動では一切通信しない（「今すぐ確認」を押したときだけ確認する）。

### 受け入れ条件

1. 配布版で起動すると、更新の確認が自動で走る。開発時・E2E では走らない
2. 新しい版があれば裏でダウンロードし、終わったら通知と帯が出る
3. ［再起動して更新］で新しい版に入れ替わって起動し直す。**ウィンドウを閉じると通知領域に残る設定でも**、確実に終了して入れ替わる
4. ［あとで］を選んでも、次回の終了時に入れ替わる
5. 「更新を自動で確認する」を外すと、起動時・定期の確認が止まる。戻すと再開する
6. オフラインで起動しても、エラーで止まらず普通に使える
7. 公開サイト・README・SECURITY.md に「外部との通信は自動更新だけ」と書かれている

### 未署名について

インストーラーは未署名のため、electron-updater は署名検証を行わない（HTTPS と `latest.yml` の sha512 照合で守る。今の手動配布と同じ信頼の前提、`docs/AUTO_UPDATE.md` §3）。署名は別タスク。

## Part 2: AI用（実装セット定義）

### 共有契約（開発管理者が先行コミット済み）

- `src/shared/preload-api.ts`: `AppSettings.autoUpdate: boolean`、`UpdateState`（`unsupported | idle(lastCheckedAt) | checking | downloading(version, percent) | downloaded(version) | error(message)`）、`UpdateStatus { currentVersion, state }`、`HanamaskPreloadApi` の `readUpdateStatus` / `checkForUpdates` / `installUpdate` / `onUpdateStatusChanged`
- 依存 `electron-updater@6.8.11` は `package.json` に追加済み

### セット A: mainプロセスの更新制御

触るファイル: `src/main/update/update-state.ts`、`src/main/update/auto-updater.ts`、`tests/main/update/*.test.ts` のみ。

- `update-state.ts`（純粋関数）: electron-updater のイベント（`checking-for-update` / `update-available` / `update-not-available` / `download-progress` / `update-downloaded` / `error`）から次の `UpdateState` を作る reducer。`update-not-available` は `idle(lastCheckedAt = 現在時刻ISO)`。エラーの `message` は利用者向けの日本語「更新を確認できませんでした」に固定し、詳細はログへ
- `auto-updater.ts`: `createAutoUpdate(deps)` を export。deps は注入する（テストで差し替え）:
  - `updater`: electron-updater の `AppUpdater` のうち使う部分だけの最小インターフェース（`autoDownload` / `autoInstallOnAppQuit` / `logger` / `on` / `checkForUpdates` / `quitAndInstall`）。本物の `autoUpdater` が型として代入できること
  - `currentVersion: string`、`isSupported: boolean`（`app.isPackaged && DB上書き無し` は結線側で計算）、`isEnabled: () => boolean`、`onStatusChanged(status)`、`onDownloaded(version)`（OS通知用）、`prepareToQuit()`（`isQuitting = true` 用）、`now()`、タイマー（`setTimeout` / `setInterval` 相当を注入できる形）
  - 返り値: `start()`（`isSupported` でなければ何もしない。有効なら初回確認を `INITIAL_CHECK_DELAY_MS`（10秒）後、以降 `CHECK_INTERVAL_MS`（6時間）ごと）、`refreshSchedule()`（設定変更時。オフでタイマー停止、オンで再開）、`checkNow(): Promise<UpdateStatus>`（手動確認。設定オフでも動く。unsupported なら何もしない）、`install()`（`downloaded` のときだけ。**`prepareToQuit()` を呼んでから** `quitAndInstall(true, true)`）、`status(): UpdateStatus`、`stop()`
  - `autoDownload = true`、`autoInstallOnAppQuit = true`
  - `checkForUpdates()` の reject は握りつぶして状態を `error` にする（例外を外へ出さない）。`downloaded` 以降は定期確認をしない
- テスト: reducer の全遷移、unsupported で何も呼ばない、設定オフで自動確認しないが `checkNow` は動く、`refreshSchedule` の停止・再開、reject で例外を投げず error になる、`install` の呼び出し順（prepareToQuit → quitAndInstall）、downloaded 以外で `install` しない

### セット B: 画面

触るファイル: `src/renderer/components/UpdateSettings.tsx`、`src/renderer/components/UpdateBanner.tsx`、`tests/renderer/UpdateSettings.test.tsx`、`tests/renderer/UpdateBanner.test.tsx` のみ。

- `UpdateSettings`: Part 1 の「更新」欄。見た目・アクセス方法は `StartupSettings.tsx` に揃える（設定の保存は既存の `readAppSettings` / `saveAppSettings` を使い、他の項目を `...settings` で保つ）。状態は `readUpdateStatus` と `onUpdateStatusChanged` で追う。unsupported のときは「開発版のため自動更新は動きません」と出し、チェックとボタンを無効化する
- `UpdateBanner`: `downloaded` のときだけ出る帯。［再起動して更新］で `installUpdate`、［あとで］でこの起動中は隠す
- テスト: 各状態の表示、チェックの保存（他項目を保つ）、今すぐ確認、unsupported の無効化、帯の表示条件と2つのボタン

### 並列グループ宣言

セット A と B は触るファイルが重ならないので並列に実行する。

### Phase 4（開発管理者）

`src/main/index.ts`（結線・IPC `update:read-status` / `update:check` / `update:install` / `update:status-changed`・`isAppSettings` に `autoUpdate`）、`src/main/settings/app-settings.ts`（既定 `autoUpdate: true`）、`src/preload/index.ts`、`src/renderer/App.tsx`（設定欄と帯の配置）、既存テストのフィクスチャ、`tests/main/no-network.test.ts`、ドキュメント・公開サイト。

### 完了条件（機械判定）

`npm run lint` / `npm run typecheck` / `npm run build` / `npm test` が緑。

### セーフティ

各グループの自己修正は3回まで。テストの削除・無効化・アサーションの緩和で緑にしない。
