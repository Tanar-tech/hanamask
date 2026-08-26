# SPEC: ローカルLLMチャット（T49）

要求定義: `docs/REQUIREMENTS.md` §4.8-2（チャットのローカルモデル）。タスク: `docs/TASKS-local-llm.md` T49（issue #181）。管理者追加要件（2026-08-21）: 配布を「通常版」と「チャット同梱版」に分ける／チャット用モデルのOSSライセンス確認／デザイン確定時にモックアップを提示する。

## Part 1: 利用者向け

### 何を・なぜ

チャットを、Anthropic APIキーが無くても使えるようにします。設定画面からチャット用のローカルモデルを取得（または同梱版を導入）すると、**PCの中だけで動くAIとの日本語チャット**が使えます。会話は外部に送信されません。ローカルモデルも、ノートの検索やタスクの作成といった操作（MCPツール）を会話の中から実行できます。

### モデルの選定（停止条件への回答: 候補と根拠）

想定環境は GPU の無い一般的な Windows PC（CPU推論）。基準は §4.8（**再配布可能なOSSライセンス**・**日本語主体の品質評価**）と tool use 対応。2026-08-26 に WSL 上で node-llama-cpp 3.20 による実測を行った。

| 候補 | ライセンス | サイズ | 実測結果 | 判定 |
| --- | --- | --- | --- | --- |
| **Qwen3-4B**（Q4_K_M） | Apache-2.0 | 2.50GB | 日本語流暢。検索語の立て方・要約・応答とも良好。ツール呼び出し成功 | **標準（推奨）** |
| **Qwen3-1.7B**（Q8_0） | Apache-2.0 | 1.83GB | ツール呼び出しは成功するが検索語が下手で取りこぼし。文面は硬い | **軽量版** |
| Gemma 4 E4B | Apache-2.0（2026-04〜） | 3.5GB〜 | 未実測。GGUF最小3.5GBで同梱不可 | 取得型の将来候補 |
| TinySwallow-1.5B / sarashina2.2-3b | Apache-2.0 / MIT | 1〜2GB | tool use 非対応系 | 劣化モード専用となるため見送り |
| LLM-jp-4 / Swallow系 | Apache-2.0 | 5GB〜 | tool calling が弱い報告・サイズ超過 | 除外 |

- 応答速度は実測で1ターン30秒〜70秒（思考モード込み・CPU）。**ストリーミング表示と「考えています…」の明示が必須**（§4.8-2の要件どおり）
- 思考モードを無効化するとツール実行後の最終応答が欠落する現象を確認したため、**思考モードは有効のまま**とし、思考部分はUI上で折りたたむ

### 配布の2系統（管理者要件への回答）

| 系統 | 内容 | 配布 |
| --- | --- | --- |
| **通常版**(現行) | 埋め込みモデルのみ同梱（77MB）。チャットは設定画面からモデルを取得すると使える | GitHub Releases（現行どおり） |
| **チャット同梱版** | 上記 + **Qwen3-1.7B Q8_0（1.83GB）を同梱**。導入直後からローカルチャットが動く | GitHub Releases（**2GB上限内に収まる1.7Bのみ同梱可能**） |

- 標準モデル（4B、2.50GB）は GitHub Releases のアセット上限（2GB）を超えるため**同梱できない**。どちらの版でも設定画面から取得できる（取得先は通常版と同じ、HTTPS固定URL + sha256検証）
- モデルの取得元は、埋め込みモデルと同様に**本リポジトリの GitHub Releases に自前で再アップロードしたもの**を使う（Apache-2.0 のため再配布可。LICENSE と改変の有無を添付）

### 画面イメージ・操作フロー

モックアップ: 停止①と同時に artifact として提示（📸 実装後に e2e-runner で実物に差し替え）

1. **設定画面「チャット」**: プロバイダを「Anthropic API」「ローカルモデル」から選択。ローカルモデル欄には取得済みモデルの一覧（名前・サイズ・削除ボタン）と「モデルを取得」ボタン（進捗バー付き。中断・再開可）
2. **チャットパネル**: 既存のチャットUIを共用。ローカルモデル使用中はヘッダーにモデル名を表示。応答はストリーミングで流れ、思考部分は「考えています…」として折りたたみ表示
3. **ツール実行の権限**: ローカルモデルには**読み取り系ツールと、作成・更新系ツールのみ**を渡す（削除系・復元系は渡さない）。実行されたツールはチャット内に逐次表示（既存のイベント表示を共用）
4. モデル未取得でローカルを選んだ場合は、チャット欄にモデル取得への導線を表示

### 受け入れ条件

- [ ] 設定画面でプロバイダを Anthropic API ⇔ ローカルモデルで切り替えられ、再起動後も保持される
- [ ] 設定画面からチャット用モデルをダウンロードできる（進捗表示・中断・再開・失敗時の後始末・削除）
- [ ] sha256 が一致しないダウンロードは破棄され、エラーが表示される
- [ ] ローカルモデルで日本語チャットができ、応答がストリーミング表示される
- [ ] ローカルモデルがチャットから `search_notes` 等を実行でき、結果が応答に反映される
- [ ] ローカルモデルに削除系・復元系ツールが渡っていない（会話から削除を指示しても実行されない）
- [ ] Anthropic API 経路が従来どおり動く（回帰なし）
- [ ] チャット同梱版インストーラーで、導入直後（追加ダウンロードなし）にローカルチャットが動く
- [ ] 通常版のサイズが現行から実質増えない（±10MB以内）
- [ ] モデル未導入・ロード失敗時にアプリ本体（ノート・タスク・MCPサーバー）が巻き込まれない

### 未決定・要確認事項（管理者確認）

1. **T12（チャットUI）の凍結解除**が前提になる（`CHAT_ENABLED` を有効へ）。本SPECの承認をもって解除と扱ってよいか
2. チャット同梱版のモデルは 1.7B（品質は標準4Bに劣る）。「同梱版=軽量、標準は後から取得」という整理で良いか
3. REQUIREMENTS §4.8 の「チャット用モデルは後から取得」に同梱版の選択肢を追記する改定を本タスクに含めてよいか
4. リリース作業（2系統のビルド・添付）は release.yml の拡張が必要。リリース自体は従来どおり管理者承認

---

## Part 2: AI用（実装セット定義）

前提: 調査済みの実装事実（2026-08-26、main `02b113b`）。`ChatModelClient`（`src/main/chat/agent-loop.ts`）が切替の器。凍結フラグは `CHAT_ENABLED`。ブランチは main ベースの1本（`feat/t49-local-chat`）、PR は draft 1本。

### 共有契約（Phase 3 開始前に開発管理者が先行コミットする）

- `ChatModelClient.send` にストリーミングの口を追加する（`onDelta?: (text: string) => void`、思考は `onThinking?`）。Anthropic 実装は当面 onDelta 未使用（全文後出し）でよい
- `src/shared/preload-api.ts`: チャット設定型に `provider: "anthropic" | "local"`、ローカルモデルの `LocalModelState`（未取得/取得中{progress}/取得済み{path,size}）を追加
- ローカルモデルに渡すツールの許可リスト定数（`src/main/chat/local-tool-allowlist.ts`、読み取り系 + create_page/create_task/update_page/update_task。delete_*/restore_* を含めない）
- チャットモデルのマニフェスト（`resources/models/chat-models.json`: id・URL・sha256・サイズ・ライセンス。埋め込みの `sources.json` と同形式）

### セット A: ローカル推論クライアント（main）

- 目的: 受け入れ条件 4・5・6・10
- 触るファイル: `src/main/chat/llama-client.ts`（新規、`ChatModelClient` 実装。node-llama-cpp の session functions で tool use）、`src/main/llm/chat-model-manager.ts`（新規、ダウンロード・sha256検証・削除。`fetch-embedding-model.mjs` のロジックを main 内に移植）
- 読み取りのみ: `agent-loop.ts`、`llama-embedding-provider.ts`（getLlama 共有パターン）
- テスト: `tests/main/chat/llama-client.test.ts`、`chat-model-manager.test.ts`（推論はモック。ダウンロードはローカルHTTPスタブ）

### セット B: 設定UIとIPC

- 目的: 受け入れ条件 1・2・3
- 触るファイル: `src/renderer/components/ChatSettings.tsx`（プロバイダ選択・モデル管理UI追加）、`src/main/settings/chat-settings.ts`（provider・モデル状態の保存）
- テスト: `tests/renderer/ChatSettings.test.tsx`、`tests/main/settings/chat-settings.test.ts`

### セット C: チャットパネルのストリーミング表示

- 目的: 受け入れ条件 4（表示側）・モデル未取得導線
- 触るファイル: `src/renderer/components/ChatPanel.tsx`（ストリーミング差分表示・思考折りたたみ・モデル名表示・未取得導線）
- テスト: `tests/renderer/ChatPanel.test.tsx`

### Phase 4（統合ゲートでのみ編集）

- `src/main/index.ts`（IPCハンドラ結線・CHAT_ENABLED）、`src/preload/index.ts`、`tests/renderer/hanamask-stub.ts`、`electron-builder.yml` + `electron-builder-chat.yml`（同梱版）、`.github/workflows/release.yml`（2系統ビルド）、`docs/REQUIREMENTS.md` §4.8、`docs/TASKS-local-llm.md`、README、CHANGELOG

### 並列グループ宣言

- A・B・C は編集ファイルが重複せず並列可
- 共有契約ファイル（`preload-api.ts` 等）は契約コミット後、Phase 4 でのみ再編集可

### 完了条件（機械判定）

- `npm test`・`npm run lint`・`npm run typecheck`・`npm run check:readme` 全緑。各セットの追加テスト緑
- PR は main base の draft 1本（マージは管理者）

### セーフティ

- 各セットの自己修正は3回まで。テストの削除・緩和でのグリーン化は禁止
- 実モデルを CI で走らせない（推論層はモックで検証、§4.8 の制約どおり)
- 停止②（/structured-review）まで自律で進め、確認を求めるのは停止①（本 Part 1）のみ
