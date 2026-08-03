---
name: docs-html-sync
description: docs/直下のMarkdownファイルを編集した際、対応するHTML版（docs/html/配下）を必ず同期させる。docs/*.mdへの変更をコミットする前に必ず実行する。
---

# docs-html-sync

`docs/` 直下のMarkdownファイル（`docs/articles/` は対象外）は、閲覧用にHTML化したものを `docs/html/` 配下に並行して置いている。Markdownを変更したら、このスキルに従って対応するHTMLも同じ内容に更新する。

## 対象

- 対象: `docs/*.md`（`docs/REQUIREMENTS.md`, `docs/GOVERNANCE.md`, `docs/AWS.md`, `docs/CICD.md`, `docs/CODEX.md`, `docs/HERDR.md` など、`docs/` 直下のMarkdownファイル全て）
- 対象外: `docs/articles/` 配下（Qiita等への寄稿記事下書きであり、社内向けHTML化の対象ではない）
- 新しく `docs/*.md` を追加した場合は、`docs/html/` にも同名の `.html` を新規作成し、`docs/html/index.html` の一覧にリンクを追加する

## いつ実行するか

- `docs/*.md`（対象ファイル）を新規作成・編集した直後、そのセッション内でコミットする前に必ず実行する。複数の `.md` を変更した場合は、変更した全ファイル分を漏れなく実行する。
- 見落とし防止のため、`docs/*.md` を編集したセッションでは対応する `docs/html/*.html` も編集済みかを、コミット前のセルフチェックとして毎回確認する。

## 変換方法（重要: 自動パーサーを使わない）

このプロジェクトではMarkdown→HTML変換にライブラリやスクリプトを使わない。**Claude自身が対象Markdownの内容を読み、意味を理解した上でHTMLを手書きする**（表現力・見た目の質を機械的パーサーより優先するため、2026-08-03に管理者と合意した方針）。

手順:

1. 変更された `docs/xxx.md` の全文を読む。
2. 対応する `docs/html/xxx.html` を読む（既存ファイルがあれば）。無ければ新規作成する。
3. 以下の変換規則で、Markdownの内容を過不足なくHTMLへ反映する。
   - `# 見出し` → `<h1>`〜`<h4>`（原文の見出しレベルをそのまま対応させる）。`##`のセクション番号がある場合は `id` 属性を付け、文書内リンク（`(#6)` 等）が機能するようにする。
   - 段落・強調（`**太字**` → `<strong>`）・インラインコード（`` `x` `` → `<code>`）・リンク（`[text](url)`）を保持する。
   - 箇条書き・番号付きリストはネストも含め `<ul>`/`<ol>`/`<li>` に変換する。
   - テーブルは `<table><thead><tbody>` に変換する。
   - コードフェンス（```` ``` ````）は `<pre><code>` に変換し、`<`/`>`/`&` はエスケープする。
   - 引用（`>`）は `<blockquote>` にする。
   - 同一 `docs/` 内の他Markdownファイルへの相対リンク（例: `GOVERNANCE.md`、`(AWS.md)`）は、対応するHTMLファイルへのリンク（例: `GOVERNANCE.html`）に張り替える。`docs/` の外（例: `../CLAUDE.md`）を指すリンクはMarkdownのまま残してよい。
4. 各HTMLファイルは `docs/html/style.css` を共有スタイルシートとして読み込む（`<link rel="stylesheet" href="style.css">`）。新規にスタイルを追加する場合もこのファイルに集約し、ページ個別の `<style>` は書かない。
5. `<title>` は原文の `# 見出し`（h1相当）と一致させる。
6. 変換後、生成したHTMLと元Markdownを見比べ、抜け落ちた節・箇条書き・表の行がないか確認する。

## 出力先

- `docs/html/<Markdownファイル名と同じbasename>.html`（例: `docs/REQUIREMENTS.md` → `docs/html/REQUIREMENTS.html`）
- 共有スタイル: `docs/html/style.css`
- 一覧ページ: `docs/html/index.html`（新規ファイル追加時のみ更新すればよい。既存ファイルの内容更新では触らない）

## 完了条件

- 変更した全ての `docs/*.md` について、対応する `docs/html/*.html` の内容が最新のMarkdownと一致している。
- 新規追加した `.md` があれば `docs/html/index.html` にリンクが追加されている。
- HTMLの構文が壊れていない（開始/終了タグの対応、テーブルの列数など）ことを目視で確認済み。
