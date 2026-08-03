# 個人開発のprivateリポジトリに、コストゼロでSAST(静的解析)を入れた話

個人でWebアプリを開発してて、「そろそろセキュリティ周りもちゃんとしたいな〜」と思い、GitHub ActionsにSAST(静的解析でコードの脆弱性を検出するやつ)を組み込んでみました。

ただしprivateリポジトリ + 個人開発なので、**お金は一切かけたくない**という制約付き。この記事はその技術選定〜導入〜つまずいたところまでのメモです。

## どんなシステムに入れたか

- Next.js(App Router) + TypeScript のWebアプリ(タスク管理系のSaaS)
- API部分はAWS Lambda、DBはAurora Serverless v2(PostgreSQL)
- フロントは S3 + CloudFront で配信するサーバーレス構成
- CI/CDはGitHub Actions。PRごとにlint/型チェック/テスト/ビルドを回す`ci.yml`と、PRごとに検証環境を自動で立ち上げる`pr-preview.yml`が既にある状態

要は「よくあるサーバーレスWebアプリ + GitHub Actions」くらいの構成だと思ってもらえればOKです。

## 要件

- GitHub ActionsのCIに組み込む
- コストは今まで通り最小限(≒ 無料)
- 最低限Web/APIのOWASP Top10はチェックしたい

## 技術選定

まず思いつくのは**GitHub CodeQL**(GitHub純正のコードスキャン)ですが、ここで詰みポイントが一つ。

> CodeQLの解析自体はタダでも、結果を「Security」タブに出す「コードスキャン」機能は、**privateリポジトリだとGitHub Advanced Security(有料・コミッター課金)が必須**

個人開発のprivateリポジトリだとこれが結構痛い出費になるので却下。publicリポジトリなら無料なんですが、今回はprivate運用なので使えませんでした。

というわけで選んだのが **Semgrep(OSS版のCLI)** です。

| 選択肢 | ジャッジ | 理由 |
|---|---|---|
| Semgrep OSS CLI | ◎ | OWASP Top10特化ルールセットが無料で使える。ログイン・トークンも不要 |
| GitHub CodeQL | ✕ | privateだとGHAS(有料)必須 |
| Snyk/Bearer等 | △ | 無料枠はあるけどアカウント管理・回数制限が発生する |

Semgrepは公式のOSSルールレジストリに`p/owasp-top-ten`というOWASP Top10特化ルールセットがあって、これを使えば要件をドンピシャで満たせます。CLI自体もOSSで、semgrep.dev(有料のAppSec Platform)にログインしなくても普通に動きます。GitHub Actionsの実行時間(無料枠内)しかコストがかからないのが決め手でした。

## 実装

ワークフローはこんな感じ。公式のDockerイメージにsemgrepが入ってるので、それを使うだけです。

```yaml
name: SAST

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  semgrep:
    runs-on: ubuntu-latest
    container:
      image: semgrep/semgrep
    steps:
      - uses: actions/checkout@<コミットSHA> # v4.4.0

      - name: Semgrep scan (OWASP Top 10 + secrets)
        run: semgrep scan --config p/owasp-top-ten --config p/secrets --error
```

ポイントはこのくらい:

- `--config p/owasp-top-ten`: OWASP Top10特化ルール(必須要件)
- `--config p/secrets`: ハードコードされた認証情報の検出。誤検知が少なくて軽量なので追加
- `--error`: 指摘があったらジョブを失敗させる(ブロッキング)
- GitHubの「コードスキャン」機能(SARIFアップロード)は使わない。これもprivateだとGHAS要求されるので、結果はジョブのログにそのまま出すだけにしてる

## 初回スキャンでいきなり詰んだ話

意気揚々とPRを出したら、初回スキャンでいきなり12件のブロッキング指摘。「うわ、既存コードやばいのか…?」と身構えましたが、中身を見たら全部同じルールでした。

```
github-actions-mutable-action-tag
GitHub Actions step uses a mutable tag or branch reference...
Pin the reference to a full 40-character commit SHA instead
```

要するに「`uses: actions/checkout@v4`みたいなタグ参照は書き換え可能だから危ないよ、コミットSHAに固定してね」という指摘でした。実際、`tj-actions/changed-files`など有名アクションの乗っ取り事件も過去にあったので、真っ当な指摘ではあります。

ただこれ、OWASP Top10(Web/APIの脆弱性)とは毛色が違う「CI/CDのサプライチェーン対策」の話。しかも自分のワークフローファイル全部(4ファイル・12箇所)に影響する変更だったので、いったん`--exclude-rule`でこのルールだけ除外してPRをマージ可能な状態にしました。

その後、GitHub APIで各アクションの`v4`タグが指す最新コミットSHAを調べて、

```yaml
# before
- uses: actions/checkout@v4

# after
- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
```

という感じで全部SHA固定に変更。AWS認証まわりのアクションも含めて直したので、ちゃんとデプロイが壊れないかも実際にCIを走らせて確認してから`--exclude-rule`を外しました。

## まとめ

- privateリポジトリ + 個人開発でコストゼロのSASTを入れるなら、**GitHub CodeQLではなくSemgrep OSS CLI**がおすすめ(CodeQLはprivateだと有料機能が絡んでくる)
- `p/owasp-top-ten`を使えばOWASP Top10特化のチェックがそのまま無料で手に入る
- 初めて導入するときは、既存コードに対して思わぬジャンルの指摘(今回はCI/CDのタグ固定)が出ることがあるので、「今回の要件に関係ある指摘か」を切り分けてから対応するとスムーズです
- ついでにGitHub Actionsのコミットハッシュ固定もできて、セキュリティ的に一石二鳥でした

以上、個人開発のセキュリティ強化メモでした。同じ悩みの人の参考になれば幸いです。
