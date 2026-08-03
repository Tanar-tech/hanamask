# SPEC.md — 機能追加バッチ(1)：タブ表示 / 月表示カレンダー / プロジェクトその場登録 / 工数集計ダッシュボード

作成日: 2026-07-28
対象: docs/REQUIREMENTS.md §4.1, §4.3, §4.2, §4.5 に対応する4機能の追加実装

> 2026-07-28 管理者承認済み: 機能3（プロジェクトその場新規登録）実装OK／機能2の集計単位は実働時間ベースでOK／機能4のグラフは適切な外部ライブラリがあれば利用してよい（→ Recharts採用）。

---

## Part 1: 利用者向け（管理者レビュー対象・承認済み）

### 機能1: 実行中タスクのタブタイトル/favicon表示

**説明**: ブラウザの別タブを見ていても、今どのタスクを実行中かが一目でわかるように、タブタイトルとfaviconを実行中タスクに応じて動的に切り替える。休憩中・未着手時は元のタイトルに戻す。（docs/REQUIREMENTS.md §4.1「実行中タスクの常時表示」に対応、現状未実装）

**受け入れ条件**:
- [ ] タスクを開始すると、ブラウザタブのタイトルがタスク名を含む表示に変わる
- [ ] タスクを切り替えると、タブタイトルが新しいタスク名に更新される
- [ ] 休憩を開始すると、タブタイトルが「休憩中」を示す表示になる
- [ ] 終業操作（タスク完了）後は、タブタイトルが元の「Chocotto」に戻る
- [ ] favicon が実行中/休憩中/待機中で視覚的に区別できる（色や記号の変化）
- [ ] ページを再読み込みしても、実行中タスクがあれば正しいタブタイトルが復元される

---

### 機能2: 月表示カレンダー

**説明**: 現状は週表示（タイムライン形式）のみのカレンダーに、月表示を追加する。月表示は各日のタスク実行状況を実働時間（数値）で表示する。週表示と月表示は切り替え可能にする。（docs/REQUIREMENTS.md §4.3に対応）

**受け入れ条件**:
- [ ] ダッシュボードで「週表示」「月表示」を切り替えられる
- [ ] 月表示では、当月のカレンダーグリッドに各日の実働時間合計が表示される
- [ ] 前月・今月・次月に移動できる
- [ ] 月表示の日をクリックすると、その日の詳細（タスク一覧）を確認できる
- [ ] 実行中タスク（終了時刻未確定）も当日の集計に反映される

（集計単位は実働時間ベースで確定。タスク件数表示は将来拡張とする）

---

### 機能3: プロジェクト/カテゴリの「その場新規登録」

**説明**: タスク開始・編集時のプロジェクト選択欄から、既存プロジェクトの選択に加えて「新規プロジェクトを作成」してその場で選択できるようにする。事前のマスタ登録という原則を維持しつつ、都度の画面遷移の手間を省く。（docs/REQUIREMENTS.md §7未決定事項に該当していたが、2026-07-28管理者承認により実装確定）

**受け入れ条件**:
- [ ] タスク開始画面のプロジェクト選択欄から新規プロジェクトを作成できる
- [ ] タスク編集画面のプロジェクト選択欄からも同様に新規作成できる
- [ ] 作成したプロジェクトはサイドバーのプロジェクト一覧にも反映される
- [ ] 同一組織内の他メンバーにも新規プロジェクトが共有される（組織単位でのプロジェクト共有という既存仕様通り）
- [ ] 空文字や重複名など不正な入力はエラーメッセージで弾かれる

---

### 機能4: 工数集計ダッシュボード

**説明**: プロジェクト別・日別・週別・月別の工数（実働時間）集計を、グラフで視覚的に確認できるページを追加する。（docs/REQUIREMENTS.md §4.5に対応）

**受け入れ条件**:
- [ ] 集計ページで日別・週別・月別の切り替えができる
- [ ] プロジェクトごとの実働時間が棒グラフ等で視覚的に表示される
- [ ] 選択期間の合計実働時間が表示される
- [ ] 休憩時間は集計に含まれない
- [ ] 実行中タスク（終了時刻未確定）は現在時刻までの経過時間として集計に含まれる
- [ ] 自分の組織のデータのみが表示される（他組織データの混入がないこと）

**グラフ実装方針**: 2026-07-28管理者確認により、[Recharts](https://recharts.org/) を新規導入する（React 19 / Next.js App Router対応、軽量、SVGベースでTailwindスタイルとも親和性が高いため採用）。`package.json` への依存追加はSPECで管理者から明示的に承認済み。

---

## Part 2: AI用（実装セット定義・並列グループ宣言）

### 前提
- 全セット共通で `docs/REQUIREMENTS.md`・既存コーディング規約（`"use client"` + named export、kebab-caseファイル名、Tailwind直書き、ドメインロジックは `src/lib/*.ts` に純粋関数として分離、ファイル冒頭に日本語コメントで参照ドキュメントを明記）に従う。
- 全サーバーハンドラで `requireOrganizationContext(req)`（`src/server/context.ts`）を先頭で呼び、`organizationId` を全Prismaクエリの `where` に含める（他組織データ混入防止）。
- **本SPECの実装は独立worktree `work-manager-dashboard-batch1`（ブランチ `feature/dashboard-batch1`）内で行う。同時に別セッションが `work-manager` 本体ディレクトリで別作業（IAM権限修正等）を進めているため、当該ディレクトリには一切触れないこと。**

### 実装セット一覧

#### Set A: 実行中タスクのタブタイトル/favicon表示
- **目的**: 機能1の受け入れ条件すべて
- **触ってよいファイル**:
  - `src/lib/use-document-title.ts`（新規、document.title/faviconを状態に応じて更新するクライアントフック）
  - `src/app/icon.tsx`（新規、Next.js動的favicon。静的favicon切替が難しい場合はlink[rel=icon]をDOM操作で書き換える代替実装でも可）
  - `src/app/dashboard/task-panel.tsx`（編集: openTask状態の変化に応じて `use-document-title.ts` のフックを呼び出す処理を追加。既存のUI・ロジックは変更しない）
- **依存する既存ファイル（読み取りのみ）**: `src/lib/task-timer.ts`
- **テスト置き場**: `src/lib/use-document-title.test.ts`（Vitest + jsdom、document.titleが正しく更新されることを検証）

#### Set B: 月表示カレンダー
- **目的**: 機能2の受け入れ条件すべて（page.tsxへの表示切替UI組み込みを除く）
- **触ってよいファイル**:
  - `src/lib/month.ts`（新規、月範囲計算・日別グルーピングの純粋関数。`src/lib/week.ts` の設計パターンを踏襲）
  - `src/app/dashboard/month-calendar.tsx`（新規、月表示UIコンポーネント。既存 `/api/tasks/range` を利用してデータ取得）
- **依存する既存ファイル（読み取りのみ）**: `src/lib/week.ts`, `src/app/dashboard/week-calendar.tsx`, `src/app/dashboard/task-edit-dialog.tsx`
- **テスト置き場**: `src/lib/month.test.ts`
- **備考**: `page.tsx` への週/月切替タブの組み込みはPhase 4（共有ファイル）で行う

#### Set C: プロジェクト/カテゴリのその場新規登録
- **目的**: 機能3の受け入れ条件すべて（task-panel.tsxへの組み込みを除く）
- **触ってよいファイル**:
  - `src/server/handlers/projects.ts`（編集: `createProject` ハンドラを追加。既存 `listProjects` は変更しない）
  - `src/app/dashboard/project-select.tsx`（新規、プロジェクト選択＋新規作成フォームを内包する共通コンポーネント）
  - `src/app/dashboard/task-edit-dialog.tsx`（編集: 既存の `<select>` を `<ProjectSelect>` に置換）
- **依存する既存ファイル（読み取りのみ）**: `src/server/context.ts`, `src/lib/current-organization.ts`
- **テスト置き場**: `src/server/handlers/projects.test.ts`
- **備考**: `task-panel.tsx` への `<ProjectSelect>` 組み込みと `src/server/app.ts` へのルート登録（`POST /api/projects`）はPhase 4（共有ファイル）で行う

#### Set D: 工数集計ダッシュボード
- **目的**: 機能4の受け入れ条件すべて（app.tsへのルート登録を除く）
- **触ってよいファイル**:
  - `src/lib/aggregation.ts`（新規、日/週/月別・プロジェクト別の工数集計を行う純粋関数）
  - `src/server/handlers/stats.ts`（新規、`GET /api/stats/summary` 相当のハンドラ。`getTasksInRange` と同様のクエリパターンを踏襲）
  - `src/app/dashboard/stats/page.tsx`（新規、集計ページ）
  - `src/app/dashboard/stats-chart.tsx`（新規、Rechartsを用いた棒グラフコンポーネント）
  - `src/app/dashboard/header.tsx`（編集: 集計ページへのナビリンク追加。他セットは本ファイルを触らない）
  - `package.json` / `package-lock.json`（編集: `recharts` を dependencies に追加し `npm install` を実行。他セットは本ファイルを触らないため単独編集可）
- **依存する既存ファイル（読み取りのみ）**: `src/lib/task-timer.ts`, `src/server/context.ts`
- **テスト置き場**: `src/lib/aggregation.test.ts`, `src/server/handlers/stats.test.ts`
- **備考**: `src/server/app.ts` へのルート登録（`GET /api/stats/summary`）はPhase 4（共有ファイル）で行う

### 並列グループ宣言
- Set A / Set B / Set C / Set D は互いにファイルが重複しないため、**全セット同時並列実行可能**。
- 以下は共有ファイルのためPhase 4（統合ゲート）でのみ編集する：
  - `src/app/dashboard/page.tsx`（Set Bの週/月切替タブ組み込み）
  - `src/app/dashboard/task-panel.tsx` への `<ProjectSelect>` 追加（Set Aが既に編集するファイルへの追加変更）
  - `src/server/app.ts`（Set C・Set Dの新規ルート登録: `POST /api/projects`, `GET /api/stats/summary`）

### 完了条件
- `npm test`（Vitest）が全て緑
- `npm run lint`（ESLint）がエラーなし
- Phase 5レビュー（正しさ/仕様カバレッジ/重複抜け漏れ/型・null安全性）で重大な指摘がない
