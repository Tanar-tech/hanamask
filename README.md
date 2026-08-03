# hanamask

AI開発（AIエージェントとの協働）に最適化された、ローカル完結のノート・タスク管理アプリ。MCPサーバーとして自身のツール群を公開し、Claude Code等のCLIエージェントが直接ノート・タスクを読み書きできる。詳細な要求定義は [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) を参照。

現在は要求定義確定直後の段階で、実装（Electron本体・MCPサーバー・SQLiteスキーマ・デスクトップUI）はこれから行う。基盤実装のセットアップ手順・コマンドは実装着手後にここへ追記する。

## 技術スタック（確定）

- 実行形態: Electron製ネイティブデスクトップアプリ（ローカル動作、ネットワーク接続なしでノート・タスク管理が完結）
- MCPサーバー: Electronのmainプロセスに内蔵、localhost向けHTTPトランスポートで待ち受け
- データ保存: SQLite（メタデータ）+ ローカルファイルシステム（画像）
- AIチャット: 利用者自身のAnthropic APIキーでClaude APIを直接呼び出す（BYO Agent、hanamask自前のAIモデルは持たない）

## ドキュメント

- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md): 機能要件・非機能要件・データモデル・MCPツール一覧
- [docs/GOVERNANCE.md](docs/GOVERNANCE.md): 体制・運用ルール
- [CLAUDE.md](CLAUDE.md): 開発時のセッション指示
