# WSLからWindowsアプリのMCPサーバーへ接続する

WSL上でClaude Code等のAIエージェントを動かし、Windows上でhanamaskアプリを起動している構成で、**エージェントが作ったノートをアプリで参照できるようにする**ための設定手順。`docs/TASKS.md` T31に対応する。

## なぜ設定が必要か

hanamaskのMCPサーバーは`127.0.0.1`にのみ待ち受ける（`src/main/mcp/server.ts`）。**WSL2は既定でWindowsとは別のネットワークを持つため、WSL側から見た`127.0.0.1`はWSL自身**であり、Windows側のアプリには届かない。

Windows→WSLの方向だけは転送が用意されている（WSLで立てたサーバーにWindowsのブラウザから`localhost`でアクセスできるのはこのため）が、**逆方向の転送は無い。**

## なぜミラーモードを使うのか

待ち受けアドレスを`0.0.0.0`等に広げれば届くようになるが、**MCPサーバーには認証もOrigin検証も無く、接続できた相手はノート・タスクの全読み書き（削除を含む）ができる。** ローカルネットワークへ露出させる選択は取らない。

ミラーモードはWSLがWindowsのネットワークを写し取る仕組みで、**両者で`localhost`が同じものを指すようになる。** アプリは`127.0.0.1`のまま変更不要で、ネットワークへの露出も増えない。

## 設定手順

1. `C:\Users\<ユーザー名>\.wslconfig` を作成する（既にあれば`[wsl2]`セクションに追記する）。

   ```ini
   [wsl2]
   networkingMode=mirrored
   ```

2. **Windows側の PowerShell / コマンドプロンプトから** WSLを再起動する。

   ```
   wsl --shutdown
   ```

   **この操作はWSL上で動いているプロセス（開発用のClaude Codeセッションを含む）をすべて終了させる。** 作業中のものが無いことを確認してから実行する。

3. WSLを起動し直す。

## 動作確認

Windows側でhanamaskアプリを起動したうえで、WSLから次を実行する。

```bash
curl -s -m 5 http://127.0.0.1:39217/mcp -o /dev/null -w '%{http_code}\n'
```

接続できていれば応答が返る（到達できない場合は`000`）。**最終的な確認は、WSL側のAIエージェントから`create_note`を実行し、Windowsアプリの画面に手動リロードなしでノートが現れること。**

## 前提バージョン

- Windows 11 22H2 以降（build 22621 以上）
- WSL 2.0.0 以降

`wsl.exe --version` と `winver` で確認できる。

## 切り戻し

`.wslconfig` から `networkingMode=mirrored` の行を消す（またはファイルごと削除する）。その後もう一度 `wsl --shutdown` を実行すれば既定のNATモードに戻る。

## 既知の副作用: Windows実行ファイルの呼び出しが止まることがある

`/etc/wsl.conf` で `systemd=true` を使っている環境で、ミラーモード適用後に **WSLからWindows実行ファイル（`cmd.exe` / `powershell.exe` 等）を呼び出せなくなる**ことを実測した（2026-08-06）。`/proc/sys/fs/binfmt_misc/WSLInterop` が登録されず、実行しようとすると `exit 126` になる。

WSL自体のネットワークはミラーモードで動作している（`ip addr` がWindows側と同じセグメントを示す）ため、**MCPサーバーへの到達性という本来の目的には影響しない。** 影響を受けるのは、WSL側からWindowsのコマンドを起動する用途（このリポジトリでは `docs/PACKAGING.md` のインストーラービルド手順）。

対処が必要な場合は次を試す。

1. `/etc/wsl.conf` に interop を明示する。

   ```ini
   [interop]
   enabled=true
   appendWindowsPath=true
   ```

2. `wsl --shutdown` して再起動する。

これで解消しない場合は、インストーラーのビルドをWindows側のターミナルから直接実行する（`docs/PACKAGING.md` の手順はWindows側で実行する前提なので、手順自体は変わらない）。

## 注意点

ミラーモードはWSLのネットワーク挙動を全体的に変える。他のプロジェクトでポート転送やコンテナのネットワークに依存している場合、挙動が変わる可能性がある。
