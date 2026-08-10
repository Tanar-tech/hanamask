# 配布パッケージング手順（Windowsインストーラー）

hanamask を Windows 向けインストーラー（`.exe`）としてビルドする手順と、`electron-builder.yml` の設定意図をまとめる。対象読者は管理者・開発管理者。要求定義上の位置づけは [REQUIREMENTS.md](REQUIREMENTS.md) §5（配布形態）、運用上の位置づけは [GOVERNANCE.md](GOVERNANCE.md) §3.1（デプロイ・配布）を参照。

## 1. 前提: ビルドは Windows のツールチェーンで行う（WSL からでも可）

**パッケージングには Windows 側の Node.js と Visual Studio Build Tools（C++ ワークロード）が必要。WSL を使っている場合、WSL から Windows 側の `npm` を呼び出す形でビルドできる（Windows 実機に移動する必要はない）。**

> **ミラーモードを有効にしている場合の注意（2026-08-06 追記）**
> `docs/WSL.md` の手順で WSL のミラーモードを有効にし、かつ `/etc/wsl.conf` で `systemd=true` を使っていると、**WSL から Windows 実行ファイル（`cmd.exe` / `npm.cmd` 等）を呼び出せなくなる**（`/proc/sys/fs/binfmt_misc/WSLInterop` が未登録になり `exit 126`）。この状態では下記「WSL から実行する場合」の手順は動かない。
>
> 対処は次のいずれか。
> 1. `/etc/wsl.conf` に `[interop]` セクション（`enabled=true` / `appendWindowsPath=true`）を明示して `wsl --shutdown` する。
> 2. **Windows 側のターミナルから直接ビルドする**（下記の手順は元々 Windows 側で実行する前提なので、コマンド自体は変わらない）。
>
> 現在の状態は `cat /proc/sys/fs/binfmt_misc/WSLInterop` で確認できる（出力があれば呼び出せる）。

`better-sqlite3` がネイティブアドオン（`.node`）であることが制約の理由。以下は 2026-08-04 に実測した結果である。

| 実行環境 | 結果 |
|---|---|
| WSL(Linux) の Node で `electron-builder --win` | ❌ `node-gyp does not support cross-compiling native modules from source`。Linux → Windows のクロスコンパイルは `node-gyp` が非対応で、Linux 側での回避策はない |
| Windows の Node（VS Build Tools なし） | ❌ `Could not find any Visual Studio installation to use` |
| Windows の Node（VS Build Tools あり） | ✅ `.exe` の生成に成功 |

補足:

- `npm ci --ignore-scripts` でソースコンパイルを回避しても解決しない。`electron-builder` は `@electron/rebuild` で Electron の ABI に合わせたリビルドを行うため、そこで結局 `node-gyp` が動く。`buildFromSource=false` でも `better-sqlite3` には Electron 43 向けの prebuilt バイナリが存在しないため、必ずソースコンパイルにフォールバックする。
- 開発・テスト（`npm run dev` / `npm test` / `npm run test:e2e`）は WSL 上の Linux ネイティブで問題なく動く。Windows 側のツールチェーンが要るのはインストーラー生成のときだけ。

### 必要なもの

- **Windows 側の Node.js**（実測: v24.15.0 / npm 11.12.1）
- **Visual Studio Build Tools 2022 の C++ ワークロード**。未導入なら管理者権限で以下を実行する（実測: 17.14.37516.0、MSVC 14.44.35207、Windows SDK 10.0.26100）:

  ```
  winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```

  ダウンロード完了後もインストール処理がしばらく続く。`vswhere.exe -all -products * -format json` の `isComplete` が `true` になるまで待つこと。`false` の間は `node-gyp` が VS を見つけられず失敗する。

## 2. ビルド手順

Windows のリポジトリ作業ツリーで実行する。WSL で開発している場合は、**ソースを Windows ネイティブパス（例: `C:\Users\<user>\hanamask-build`）にコピーしてから実行すること。** `\\wsl$` / `\\wsl.localhost` の UNC パス上では `npm` や `electron-builder` が正しく動作しない。

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

## 5. 検証済み事項と未検証事項

### 検証済み（2026-08-04）

WSL から Windows 側のツールチェーンを使い、`npm ci && npm run package:win` が完走することを確認した。生成物:

```
release/hanamask Setup 0.1.0.exe            約 118 MB
release/hanamask Setup 0.1.0.exe.blockmap
release/win-unpacked/
```

`better-sqlite3` のネイティブビルド、`@electron/rebuild` による Electron ABI へのリビルド、NSIS インストーラーの生成まで一通り通っている。

### 未検証

**生成した `.exe` を実際にインストールして動作させる検証は未実施。** 初回配布前に以下を確認すること。

- 生成されたインストーラーでインストールし、アプリが起動すること
- パッケージ後の状態で SQLite（`better-sqlite3`）が正しく読み込まれ、ノートの作成・参照ができること（`asarUnpack` 設定が効いているかの確認）
- MCPサーバーがパッケージ後も起動し、外部AIエージェントから接続できること
- コード署名が無いため、初回起動時に SmartScreen の警告が出る想定。その挙動の確認

確認手順は `.claude/skills/e2e-runner/SKILL.md` の方針に従い手動で行う（インストーラー検証の自動化は行わない）。

## 6. リリース手順（GitHub Actions）

**配布物は手元のWindowsで作らず、タグを打ってCIに作らせる。**手元で作ると、どのコミットから生成されたものかが残らない。

1. `package.json` の `version` を上げ、`CHANGELOG.md` の `Unreleased` を新しいバージョン見出しに変える。この2つは同じPRに含める
2. `main` にマージする
3. タグを打って push する

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. `.github/workflows/release.yml` が Windows ランナーで lint・typecheck・テストを通してからインストーラーをビルドし、GitHub Releases に添付する

**タグと `package.json` の `version` が食い違っているとワークフローは失敗する。**「タグは打ったがバージョンを上げ忘れた」リリースを防ぐため意図的にそうしている。

タグを打ち直したい場合、または過去のタグでビルドし直したい場合は、Actions から `Release` ワークフローを手動実行してタグ名を渡す（`workflow_dispatch`）。

### 添付されるもの

| ファイル | 用途 |
|---|---|
| `hanamask Setup <version>.exe` | インストーラー本体 |
| `*.exe.blockmap` | 差分ダウンロード用 |
| `latest.yml` | 自動更新のフィード（`electron-builder.yml` の `publish` 設定により生成される） |

**`latest.yml` は現時点では使われていない。**アプリ側に自動更新の仕組み（`electron-updater` 等）はまだ入れていないため、生成しているだけ。

## 7. リリース時の注意

[GOVERNANCE.md](GOVERNANCE.md) §6 により、**リリース・タグ付け・公開リポジトリへの push は管理者の承認が必要**である。ビルド設定の整備やローカルでのインストーラー生成・動作確認はここまでの手順で進めてよいが、生成物を配布物として公開する行為は開発管理者の裁量では行わず、必ず事前に管理者の承認を得ること。
