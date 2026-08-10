# 開発に参加する

hanamask は個人が開発しているアプリです。Issue も Pull Request も歓迎しますが、**返信までに時間がかかることがあります。**

## 最初に読んでほしいこと

このアプリには、普通のノートアプリとは違う前提が2つあります。ここを外すと、良い変更でも受け入れられないことがあります。

### 1. 本文はAIエージェントが書く＝信頼できない入力

ノート・タスクの本文は、利用者のAIエージェントがMCP経由で書き込みます。エージェントは読んだWebページの内容をそのまま本文にすることがあるため、**本文の中身は攻撃者が制御しうる**前提で実装されています。

本文の描画に手を入れる変更では、[SECURITY.md](SECURITY.md) の該当節を必ず読んでください。特に **`rehype-raw` → `rehype-sanitize` の順序**は逆にすると生HTMLがサニタイズを素通りします。

### 2. 利用者のPC上のSQLiteファイルが唯一の正

サーバーもクラウド同期もありません。**データを失うと取り返しがつきません。**

DBスキーマに触れる変更では、[docs/MIGRATIONS.md](docs/MIGRATIONS.md) を**着手前に**読んでください。`schema.sql` だけを直すと、新規インストールでは正しく動き、**既存利用者のDBだけが取り残されます。しかもテストは新規DBを作って走るので全部緑のまま通ります。**

参加にあたっては [行動規範](CODE_OF_CONDUCT.md) に従ってください。

## 開発環境

```bash
npm ci
npm run dev        # アプリを起動
npm test           # 単体テスト（Vitest）
npm run lint       # ESLint
npm run typecheck  # 型チェック
```

- **Node.js の管理は npm です。**`yarn` / `pnpm` を混ぜないでください
- **Prettier は使っていません。**整形の正は ESLint のみです。`npx prettier --write` を掛けると無関係な差分が大量に出ます
- Windows向けインストーラーのビルドには Windows のツールチェーンが要ります（[docs/PACKAGING.md](docs/PACKAGING.md)）

## 変更を送るまで

1. **まず Issue で相談してください。**特に機能追加は、[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) §9（スコープ外）に該当すると受け入れられません
2. ブランチを切る（`main` へ直接コミットしない）
3. **テストを先に書く。**「実装を壊すとそのテストが落ちる」ことを一度確認してください。落ちないテストは、書いていないのと同じです
4. `npm test` / `npm run lint` / `npm run typecheck` を通す
5. Pull Request を出す

## コーディング上の約束

- **型を `any` にしない。**`as` によるキャストではなく型ガードを書く
- **`eslint-disable` / `@ts-ignore` で黙らせない。**型か設計を直す
- **スタイルは Tailwind ユーティリティのみ。**`<style>` ブロックやコンポーネント単位のCSSファイルを追加しないでください（フラグメントルートのコンポーネントでscoped CSSが黙って効かなくなる問題を避けるため）
- **`dangerouslySetInnerHTML` を使わない**
- コメントは「なぜ」を書くときだけ。「何をしているか」は名前と型で表現してください
- 画面の文言は日本語です

## テスト

- `tests/` 配下に置きます（`tests/main/` = mainプロセス、`tests/renderer/` = UI、`tests/e2e/` = 実際にElectronを起動するE2E）
- **E2Eは `HANAMASK_DB_PATH` と `HANAMASK_MCP_PORT` で必ず別のDB・別ポートを使います。**開発者の実データに触れないでください
- 方針は [docs/TESTING.md](docs/TESTING.md) を参照

## リリースとバージョン

配布物は**タグを打つとCIが作ります**。手元でビルドしたものを配ることはしません（どのコミットから作られたか残らないため）。手順は [docs/PACKAGING.md](docs/PACKAGING.md) を参照してください。

- バージョンは [セマンティック バージョニング](https://semver.org/lang/ja/)に従います
- **1.0.0 に達するまでは、マイナーバージョンの更新に破壊的変更が含まれえます**
- このアプリの「破壊的変更」は、**MCPツールの引数・戻り値が変わること**と、**古いバージョンで書き出したバックアップが取り込めなくなること**を指します。DBスキーマの変更そのものは、[docs/MIGRATIONS.md](docs/MIGRATIONS.md) の規約により既存データを保ったまま追従するので破壊的変更に数えません
- 利用者から見える変更を入れたら `CHANGELOG.md` の `Unreleased` に追記してください。**内部リファクタは書かなくて構いません**

## 脆弱性を見つけた場合

**公開のIssueには書かないでください。**[SECURITY.md](SECURITY.md) の手順に従って非公開で報告してください。

## ライセンス

送っていただいた変更は Apache License 2.0 のもとで公開されます（[LICENSE](LICENSE)）。
