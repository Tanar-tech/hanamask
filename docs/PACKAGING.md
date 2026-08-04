# 配布パッケージング手順（Windowsインストーラー）

hanamask を Windows 向けインストーラー（`.exe`）としてビルドする手順と、`electron-builder.yml` の設定意図をまとめる。対象読者は管理者・開発管理者。要求定義上の位置づけは [REQUIREMENTS.md](REQUIREMENTS.md) §5（配布形態）、運用上の位置づけは [GOVERNANCE.md](GOVERNANCE.md) §3.1（デプロイ・配布）を参照。

## 1. 前提: ビルドには Windows 実機が必要

**パッケージングは Windows 実機（またはWindows CI ランナー）で行う。Linux / WSL 上ではビルドを完走できない。**

理由は `better-sqlite3` がネイティブアドオン（`.node`）であることによる。Linux から `electron-builder --win` を実行すると、Windows 向けバイナリを用意する段階で `node-gyp` が

```
node-gyp does not support cross-compiling native modules from source
```

で停止する。`better-sqlite3` のソースからのクロスコンパイル（Linux → Windows）は `node-gyp` がサポートしていないため、Linux 側での回避策はない。開発・テスト（`npm run dev` / `npm test`）は WSL 上でも可能だが、インストーラー生成だけは Windows 実機で行うこと。

## 2. ビルド手順

Windows 実機のリポジトリ作業ツリーで実行する。

1. 依存をインストールする。

   ```
   npm ci
   ```

   `better-sqlite3` の Windows 向けバイナリはこの時点で取得・ビルドされる。

2. インストーラーをビルドする。

   ```
   npm run package:win
   ```

   `package:win` は `package.json` に定義されており、実体は `npm run build && electron-builder --win`。`build` はさらに次の2段階に分かれる。

   - `build:renderer`: `vite build`。レンダラー（React）を `dist/renderer` に出力する。
   - `build:main`: `tsc -p tsconfig.main.json && tsc -p tsconfig.preload.json && node scripts/copy-main-assets.mjs`。main / preload プロセスを `dist/main`・`dist/preload` にコンパイルし、その後 `scripts/copy-main-assets.mjs` が (a) `tsc` がコピーしない `src/main/db/schema.sql` を `dist/main/db/` に複製し、(b) `dist/preload/index.js` を `index.cjs` にリネームする（`package.json` の `"type": "module"` 下で、Electron のサンドボックス preload ローダーが CommonJS として確実に読めるようにするため）。

3. 生成物は `release/` 配下に出力される（`electron-builder.yml` の `directories.output`）。`release/` は `.gitignore` 済みでリポジトリには入らない。

## 3. `electron-builder.yml` の設定内容

| 項目 | 値 | 意図 |
| --- | --- | --- |
| `appId` | `dev.tanar.hanamask` | Windows でのアプリ識別子。 |
| `productName` | `hanamask` | インストーラー名・インストール先ディレクトリ名・スタートメニュー表示名の元になる。 |
| `directories.output` | `release` | ビルド成果物の出力先。 |
| `win.target` | `nsis` | NSIS 形式のインストーラー（`.exe`）を生成する。 |

### `files`

同梱対象は `dist/**` と `package.json` のみを列挙している。`node_modules` の本番依存は `electron-builder` が `package.json` の `dependencies` から自動的に同梱するため、明示的な列挙はしていない。

その上で `react` / `react-dom` / `mermaid` を `!node_modules/...` で除外している。これらはレンダラーのバンドル（`dist/renderer`）に取り込み済みで実行時に `node_modules` から解決されることがなく、そのまま同梱するとインストーラーサイズを無駄に増やすだけであるため。

### `asarUnpack`

```yaml
asarUnpack:
  - "**/node_modules/better-sqlite3/**"
```

Electron は既定でアプリのファイルを `app.asar` という単一アーカイブにまとめるが、ネイティブアドオンの `.node` はアーカイブ内から `dlopen` できない。`better-sqlite3` を `asarUnpack` で `app.asar.unpacked/` 側に展開して同梱することで、パッケージ後も SQLite が読み込める状態にしている。

### `nsis`

| 設定 | 値 | 意味 |
| --- | --- | --- |
| `oneClick` | `false` | ワンクリックインストールではなく、ウィザード形式のインストーラーにする。 |
| `perMachine` | `false` | ユーザー単位のインストール（管理者権限を要求しない）。単一利用者のローカルアプリという前提（REQUIREMENTS.md §5）に合わせている。 |
| `allowToChangeInstallationDirectory` | `true` | インストール先をユーザーが変更できるようにする。 |

### インストール後のデータ配置

DB（`hanamask.sqlite3`）と画像ファイル（`images/`）は、インストール先ではなく Electron の `userData` ディレクトリ（Windows では `%APPDATA%\hanamask\`）配下に作られる。したがってアプリを上書きインストール・アンインストールしてもユーザーデータは保持される。

## 4. スコープ外の事項

自動更新機構とOS対応方針は [REQUIREMENTS.md](REQUIREMENTS.md) §5 で確定済み。コード署名は要求定義に記載がないが、証明書を用意していないため現時点では未対応とする。

- **自動更新機構なし**: `electron-updater` 等は導入していない。更新は新しいインストーラーを配布し、利用者が再インストールする運用とする。
- **コード署名なし**: 署名証明書を用意していないため、生成した `.exe` は署名されない。ダウンロード実行時に Windows SmartScreen の警告（「WindowsによってPCが保護されました」）が表示される可能性があり、利用者は「詳細情報」→「実行」で進める必要がある。
- **macOS / Linux 非対応**: 対応OSはWindows優先の方針に従い、`win` ターゲットのみを設定している。他OSは将来必要になった時点で追加する。

## 5. 未検証事項

**Windows 実機での `.exe` 生成は未検証である。** `electron-builder.yml` と `package:win` スクリプトは整備済みだが、1. の制約により設定を追加した環境（Linux/WSL）では実行できていない。以下は Windows 実機で初回ビルドする際に確認すること。

- `npm run package:win` が完走し、`release/` に `.exe` が生成されること
- 生成されたインストーラーでインストールし、アプリが起動すること
- パッケージ後の状態で SQLite（`better-sqlite3`）が正しく読み込まれ、ノートの作成・参照ができること（`asarUnpack` 設定が効いているかの確認）
- MCPサーバーがパッケージ後も起動し、外部AIエージェントから接続できること

確認手順は `.claude/skills/e2e-runner/SKILL.md` の方針に従い手動で行う（インストーラー検証の自動化は行わない）。

## 6. リリース時の注意

[GOVERNANCE.md](GOVERNANCE.md) §6 により、**リリース・タグ付け・公開リポジトリへの push は管理者の承認が必要**である。ビルド設定の整備やローカルでのインストーラー生成・動作確認はここまでの手順で進めてよいが、生成物を配布物として公開する行為は開発管理者の裁量では行わず、必ず事前に管理者の承認を得ること。
