# work-manager CI/CD 設計

> 2026-07-23: Webアプリ化（/goal指示）に伴い全面改訂。旧版（.NET/WPF・WinUI3のWindowsデスクトップアプリを対象としたビルド・exe/zip配布・S3保存)はこのドキュメントの以前のリビジョン（git履歴）を参照。

## 1. 目的

GitHub Actions を用いて、PR単位の品質担保と、手動トリガーによる本番デプロイを自動化する。
`docs/GOVERNANCE.md` の体制・承認ルールと整合させ、本番デプロイには管理者の承認ゲートを設ける。

## 2. 前提となる決定事項

| 項目 | 決定内容 |
|---|---|
| 技術スタック | Next.js（App Router, TypeScript）+ PostgreSQL + Prisma ORM + Auth.js + Stripe + Tailwind CSS（docs/REQUIREMENTS.md §5） |
| パッケージマネージャ | npm |
| テスト | Vitest（単体）。E2E（Playwright）導入の要否は docs/REQUIREMENTS.md §7 で確認中 |
| CIのOS runner | `ubuntu-latest`、Node.js 24（Lambdaランタイムと統一。2026-07-28更新） |
| デプロイトリガー | 手動（`workflow_dispatch`） |
| ホスティング | AWSサーバーレス構成（CloudFront+S3 / API Gateway+Lambda / Aurora Serverless v2。2026-07-24 /goal指示で決定、[docs/AWS.md](AWS.md)）。IaCは `infra/lib/web-app-stack.ts` |
| DBマイグレーション | Prisma Migrate。適用方式（踏み台/マイグレーションLambda）は初回デプロイ時に決定する（docs/AWS.md §4） |
| AWSの用途 | アプリ本体のホスティング先（上記）。旧「ビルド成果物(exe/zip)配布専用」スタックの要否は管理者判断待ち（§9）。実インフラの構築・デプロイは docs/GOVERNANCE.md §6 に該当し管理者が実施する |

未確定: DBマイグレーションの適用方式、カスタムドメイン・ACM・WAF、Stripeの契約・APIキー管理方法（Stripe利用時はNATゲートウェイ追加も要判断。docs/AWS.md §5）。

## 3. パイプライン全体像

以下のワークフローで構成する。

1. **CI（`ci.yml`）**: `main` への PR、および `main` への push で実行。lint・型チェック・単体テスト・ビルドのみ行い、デプロイは行わない。
2. **SAST（`sast.yml`）**: `ci.yml` と同トリガーで実行。Semgrepによる静的解析（本ファイル §6.1）。
3. **Deploy（`release.yml`）**: 管理者が `workflow_dispatch` で手動実行。ビルド・テスト・DBマイグレーション・本番デプロイまでを行う。GitHub Environments の保護ルールによって、実行には承認が必要な状態にする（[6. 承認ゲートの設定](#6-承認ゲートの設定)）。
4. **PR Preview（`pr-preview.yml`）**: PRごとの検証環境を自動生成/破棄する（本ファイル §5.1）。

CIとDeployは共に、実体の処理を `package.json` の npm scripts に持たせる。ワークフローYAMLは「いつ・どの順で・どのランナーで実行するか」だけを担い、コマンドそのものは `package.json` 側に一元化する。これにより、開発者はCIと同じコマンドをローカルでも実行できる（[7. ローカル検証](#7-ローカル検証)）。

## 4. CI ワークフロー（`ci.yml`）

トリガー: `pull_request`（対象 `main`）、`push`（対象 `main`）。

処理:
1. checkout
2. `actions/setup-node` で Node.js セットアップ、`npm ci` で依存関係インストール
3. `npm run lint`（ESLint）
4. `npm run typecheck`（`tsc --noEmit`）
5. `npm test`（Vitest、テスト結果を artifact としてアップロード）
6. `npm run build`（Next.js ビルド確認）

`main` ブランチ保護設定（GitHub リポジトリ設定側。コードでは表現できないため、管理者が設定する）:
- PR経由のマージのみ許可（直接pushを禁止）
- `build-and-test` ジョブの成功をマージ必須条件にする
- `semgrep`（SAST、§6.1）ジョブも同様に必須条件へ追加するかは、初回スキャンでの指摘トリアージ完了後に管理者が判断する
- これは `docs/GOVERNANCE.md` §3・§5 のブランチ保護・レビュー運用を GitHub 側の仕組みで担保するもの。

## 5. Deploy ワークフロー（`release.yml`）

トリガー: `workflow_dispatch`（入力: `environment`、例 `production` / `staging`）。

処理（2026-07-24 /goal指示により具体化済み）:
1. checkout、Node.js セットアップ、依存関係インストール
2. lint・型チェック・テスト（本番デプロイもテスト済みのコードのみを配布するため再実行する）
3. `npm run build`（静的フロント out/）・`npm run build:lambda`（API dist/lambda/）・
   `npm run build:migrate`（マイグレーションLambda dist/migrate/）
4. GitHub OIDCで `work-manager-github-deploy` ロールをAssume（静的キー不使用。
   ロールは WorkManagerGithubDeployStack を管理者がローカルから一度だけデプロイして作成し、
   ARNをリポジトリ変数 `AWS_DEPLOY_ROLE_ARN` に設定する）
5. `npx cdk deploy WorkManagerWebAppStack --require-approval never`（infra/）
6. DBマイグレーション適用: マイグレーションLambda `work-manager-migrate` を同期invoke
   （docs/AWS.md §4。失敗時はジョブを失敗させる）

## 5.1 PR Preview ワークフロー（`pr-preview.yml`、2026-07-27 /goal指示）

`pull_request` をトリガーに、PRごとの検証環境を自動で生成/破棄する。

- `opened`/`synchronize`/`reopened`: フロント・API・マイグレーションをビルド → OIDCでAssumeRole →
  WebAppStack/DomainStackの出力を `describe-stacks` で取得 → `cdk deploy WorkManagerPreviewStack-pr-<番号>` →
  マイグレーションLambdaをinvoke（スキーマ作成+migrate deploy）→ PRにURLをコメント。
- `closed`: スキーマ破棄Lambda（`work-manager-drop-schema`）をinvoke → `cdk destroy` でスタック削除。
- 構成・DB分離（単一Aurora内のスキーマ `pr_<番号>`）の詳細は [docs/AWS.md](AWS.md) の「PRプレビュー環境」を正とする。
- 認証は Deploy と同じ GitHub OIDC ロール（`work-manager-github-deploy`）。承認ゲートは設けない
  （検証環境のため。本番デプロイ §5 とは別扱い）。

### 5.1.1 構築の高速化（2026-07-28 /goal指示）

プレビュー生成の実測ボトルネックは `cdk deploy`（全体の約80%）で、内訳は
①CloudFront Distribution作成 ≈158s、②静的サイトのアップロード用 `BucketDeployment`（Lambda custom
resource）が `/*` 無効化のため**Distribution作成完了を待って直列実行**され ≈90s が後ろに積まれる、の2つ。
これに対し以下を実施（**IAM変更不要でこのPRのプレビューから即有効**）:

- **アップロードの並列化**: `preview-stack.ts` の `BucketDeployment` から `distribution`/`distributionPaths`
  を外し、CloudFront `/*` 無効化を廃止。アップロードがDistribution作成と並列になり、直列化していた
  約90sが臨界パスから外れる。無効化を外す代わりにHTMLへ `Cache-Control: no-cache` を付与し、
  synchronize時も最新HTMLを配信（CloudFront CACHING_OPTIMIZED は min TTL≈1s でオリジンの
  Cache-Control を尊重）。プレビューは低トラフィックのため一律 no-cache で可。
- **ホットスワップ**: `cdk deploy --hotswap-fallback`。2回目以降のプッシュ（synchronize）は
  Lambdaコード・S3内容をCloudFormation changeset無しで直接更新（数秒）。初回や
  ホットスワップ不可の変更時はフルデプロイに自動フォールバック。非本番のため利用可（本番 §5 では不使用）。

**[フォローアップ・要管理者] teardown（`closed`）の非同期化**: 現状は `cdk destroy` がCloudFront削除
完了（≈225s）まで待機しGitHub Actions時間を消費する。`aws cloudformation delete-stack`（非同期・待機なし）
へ置換すれば大幅短縮できるが、OIDCロール（§5.2/`github-deploy-stack.ts`）は現在 `sts:AssumeRole`(cdk-*)・
`DescribeStacks`・`InvokeFunction` のみで **`cloudformation:DeleteStack` を持たない**ため、権限付与＋管理者に
よるGithubDeployStack再デプロイが前提。権限が無いまま切替えるとAccessDeniedでスタックが孤児化するため、
本高速化PRからは分離し未実施（構築＝生成側の高速化を優先）。

## 6. 承認ゲートの設定

`docs/GOVERNANCE.md` §6 により、本番デプロイは管理者の承認が必要。これを GitHub Actions の **Environments** 機能で実現する。

- リポジトリ設定で `production` という Environment を作成する。
- `production` Environment に "Required reviewers" を設定し、承認者に管理者を指定する。
- `release.yml` の deploy ジョブに `environment: production` を指定し、ワークフロー実行時に承認待ち状態になり、指定した承認者が承認するまでジョブが進まないようにする。

## 6.1 SAST（`sast.yml`、2026-07-29 /goal指示）

`main` への PR・push を対象に静的解析（SAST）を実行する。必須要件は **Web/APIのOWASP Top 10** の検出（/goal指示）。

### 技術選定

| 選択肢 | 判定 | 理由 |
|---|---|---|
| **Semgrep OSS CLI**（採用） | ◯ | ルールセット `p/owasp-top-ten`（OWASP Top 10特化）を標準搭載。CLI自体がOSS/無料で、semgrep.dev（AppSec Platform）へのログイン・トークン登録は不要。GitHub Actionsの実行時間（既存の無料枠）以外に追加コストが発生しない。 |
| GitHub CodeQL（コード スキャン機能） | ✕ | 本リポジトリはprivateのため、CodeQLの分析自体は無料でも、結果をGitHubの「コードスキャン」機能（Security タブ）に取り込むには **GitHub Advanced Security（有料・コミッター課金）** が必須。個人開発でコストを最小に保つ方針（docs/GOVERNANCE.md）に反するため不採用。 |
| Snyk / Bearer 等の他SaaS型SAST | △ | 無料枠はあるが、スキャン回数・機能に制限がありSaaSアカウント管理が発生する。Semgrepで要件（OWASP Top 10）を満たせるため採用見送り。 |

- 本プロジェクトはGitHubの「コードスキャン」API（SARIFアップロード）を使わない。これもprivateリポジトリではGHASが必要なため。検出結果はジョブのログにのみ出力する（無料）。
- 適用ルールセット: `p/owasp-top-ten`（必須要件）、`p/secrets`（ハードコードされた認証情報の検出。誤検知が少なく、docs/GOVERNANCE.md §9 のシークレット管理ルールを補強するため追加）。
- `--error` フラグにより、検出があった場合はジョブを失敗させる（ブロッキング）。
- 将来的にTypeScript/React/Next.js向けの追加ルールセット（`p/typescript`・`p/react`・`p/nextjs`）を加える場合は、まずブロッキングなしで導入し誤検知を評価してからブロッキング化する（YAGNI・段階導入）。

### 初回スキャンでの指摘・トリアージ（2026-07-29）

導入PR（#22）の初回実行で、`p/secrets` 由来の `github-actions-mutable-action-tag`（GitHub Actions の `uses: xxx@v4` のようなタグ/ブランチ参照は差し替え可能なため、コミットSHA固定を推奨する検出）が `ci.yml`/`pr-preview.yml`/`release.yml`/`sast.yml` の計12箇所でヒットした。

- 真陽性（実際にタグ参照を使っている）だが、Web/API脆弱性ではなくCI/CDサプライチェーンの堅牢化に関する指摘であり、必須要件（OWASP Top 10）の範囲外。対応（全workflowの`uses:`をコミットSHAへ固定）は `docs/GOVERNANCE.md` §6 の「CI/CD・ビルドパイプラインの設定変更」に該当するため、当初は`--exclude-rule`で一時除外し管理者判断を仰いだ。
- **対応済み（2026-07-29、同PR内）**: 管理者の承認を得て、`ci.yml`/`sast.yml`/`release.yml`/`pr-preview.yml`（計12箇所）の `actions/checkout@v4`・`actions/setup-node@v4`・`aws-actions/configure-aws-credentials@v4` をそれぞれ現時点のv4最新コミットSHA（`actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0` 等、`# vX.Y.Z` コメント付き）に固定し、`sast.yml` の `--exclude-rule` を削除した。
- **残課題**: SHA固定によりバージョンアップ時は手動でSHAを調べて更新する必要がある。Dependabotの `github-actions` エコシステム設定（SHA固定でも `# vX.Y.Z` コメントを頼りに自動更新PRを出せる）は本対応では未導入。必要になった時点で別途検討する。

## 7. ローカル検証

CIと同じ npm scripts をローカルで直接実行することで、CIを待たずに同じ結果を確認できる。

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run dev   # ローカル開発サーバー
```

- DBはローカルでPostgreSQLを（Docker等で）用意し、`.env` の `DATABASE_URL` を設定した上で `npx prisma migrate dev` を実行する。
- Stripe連携のローカル検証は Stripe CLI（`stripe listen`）でwebhookを転送して行う。

## 8. シークレット・環境変数管理

- `DATABASE_URL`、Auth.js用シークレット、Stripeの `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` 等は GitHub Secrets（Environmentごと）で管理し、リポジトリにコミットしない。
- ローカル開発は `.env.local`（`.gitignore` 対象）を使う。`.env.example` にキー名のみのテンプレートを用意する。

## 9. 旧: Windowsデスクトップアプリ版のビルド資産

Webアプリ化以前に用意していた `scripts/build.ps1`・`scripts/test.ps1`・`scripts/publish.ps1`（.NETビルド用）、および `infra/lib/release-bucket-stack.ts`（exe/zip配布用S3バケット）は、旧方針の名残であり本改訂で役割を終える。削除するか、非商用版を別ラインとして残すかは docs/REQUIREMENTS.md §7 の未決定事項（既存版の扱い）に従って管理者の判断後に整理する。それまでは参考資料として残置する。

## 10. 今後のTODO

- ~~依存関係の既知脆弱性（Next.js 14系）~~ → 2026-07-28 対応済み。Next.js 14→16・React 18→19・Prisma 5→6・その他一括更新でNext14系の脆弱性を解消。sharp(libvips)の間接依存脆弱性は `overrides` でパッチ版に固定。残る `npm audit` の指摘はESLintの開発時依存（`brace-expansion` DoS、本番Lambda未同梱）のみで、解消にはESLint 10（Next16と非互換の破壊的変更）が必要なため据え置き（docs/GOVERNANCE.md §6、パッケージ更新PR参照）。
- **[要管理者・計画的実施] Aurora PostgreSQL 16→17 メジャーアップグレード**: 現在は16系最新（16.13）。17.xへのメジャーアップグレードはパラメータグループのファミリ変更・`allowMajorVersionUpgrade`・ダウンタイムを伴う稼働中クラスタへの破壊的操作のため、稼働最優先の方針によりパッケージ更新とは分離。メンテナンスウィンドウを設けて管理者が計画的に実施する（手順は docs/AWS.md §5）。
- ホスティング先（AWS ECS/Fargate、AWS App Runner、Vercel等）の比較検討・決定（管理者承認事項）。
- マネージドPostgreSQLプロバイダの決定。
- Dockerfile・デプロイステップの具体化（ホスティング先決定後）。
- Stripe本番アカウントの契約・Webhookエンドポイント設定（管理者実施）。
- `main` ブランチ保護ルール・`production` Environment の実際のGitHub側設定（管理者が実施）。
