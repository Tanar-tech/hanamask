# SPEC: 双方向コミュニケーション（ノート・ページ・タスクのチャット欄）— T62

- issue: #230 / 要求定義: `docs/REQUIREMENTS.md` §4.11（PR #231） / タスク: `docs/TASKS.md` T62
- 作成: 2026-08-29（Phase 1 調査結果は hanamask ノート「T62: 双方向コミュニケーション（チャット欄）」参照）

---

## Part 1: 利用者向け（管理者レビュー対象）

### 1. 何を・なぜ

ノート（束）・ページ・タスクの詳細画面の下に **チャット欄** を付ける。利用者はそこに書くだけで、MCP で接続している自分の AI（Claude Code など）にメッセージが届き、返信が同じ欄に自動で現れる。AI 側のターミナルを開いて指示を打つ必要がなくなり、hanamask が「エージェントが書く場所」から「エージェントと話す場所」になる。

会話は対象（そのページ・タスク・ノート）に紐付いて保存されるので、後から「このタスクについて何を頼んで、AI が何と答えたか」を対象を開くだけで辿れる。

### 2. 仕組み（利用者が知っておくこと）

- AI が hanamask に「待ち受け」ている間だけ、メッセージは即座に届く。待ち受けは AI 側が MCP ツールを呼び続けることで成り立つ（1回の待ち受けは最長45秒で、AI が繰り返し呼ぶ）。
- **誰も待ち受けていないとき**は、チャット欄に「接続中のエージェントがいません」と表示される。メッセージは保存され、次に AI が待ち受けたときにまとめて届く。
- AI が待ち受けを始めるきっかけは**常設指示**（設定画面「エージェントに書く習慣を持たせる」の文面）に追記する。「作業の区切りで待ち受けツールを呼び、利用者からの指示を待つ」という一文が加わる。
- AI の返信や、その後の操作（ページ更新・タスク作成など）はすべて従来どおり MCP ツール経由で行われる。チャットだから特別な権限が付くことはない。

### 3. 画面イメージ・操作フロー

📸 ページ詳細（リンク・関連ページ・編集履歴の下にチャット欄）

```
┌ チャット ────────────────────────────────────────┐
│ ● エージェントが待機中                             │  ← 誰もいないときは
│                                                  │     「接続中のエージェントがいません。
│  [あなた 10:02]  この節をもう少し短くして         │      メッセージは保存され、次に待ち受けた
│                  ・未配信                        │      ときに届きます」
│  [エージェント 10:02]  3段落を1段落にまとめました。 │
│  更新は編集履歴から戻せます。                      │
│                                                  │
│ ┌──────────────────────────────────────┐ [送信]  │
│ │ メッセージを入力（Ctrl+Enter で送信）   │        │
│ └──────────────────────────────────────┘        │
└──────────────────────────────────────────────────┘
```

- 利用者の発言は水色系（既存の「利用者の操作」の色）、エージェントの発言は桃色系（既存の「エージェントの操作」の色）で、既存画面の色の使い分けと揃える。
- エージェントの返信は Markdown として表示される（ページ本文と同じ表示部品）。
- 利用者のメッセージには、AI がまだ受け取っていない間だけ「未配信」の印が付く。
- 送信は「送信」ボタンまたは Ctrl+Enter。空文字は送れない。
- 返信は手動リロードなしで現れる（既存のリアルタイム反映と同じ経路）。
- チャット欄はタスク詳細・ノート（束）詳細にも同じ形で付く。📸

### 4. AI 側の使い方（常設指示に追記する文面・案）

> - **対話する**: 作業の区切りでは `wait_for_chat_message` を呼び、利用者がアプリのチャット欄から送った指示を待つ。届いたメッセージには、対象のページ・タスク・ノートを読んだうえで `reply_chat_message` で返信し、必要な操作は従来のツールで行う。タイムアウト（空の結果）は異常ではないので、手を止めるべき理由がなければもう一度待つ

（文面は管理者確認事項。§7 参照）

### 5. 受け入れ条件

- [ ] ページ・タスク・ノート（束）の各詳細画面にチャット欄が表示される
- [ ] メッセージを送ると欄に即座に表示され、アプリを再起動しても残っている
- [ ] AI が待ち受けていない状態で送ると「接続中のエージェントがいません…」の表示と、メッセージの「未配信」印が出る
- [ ] AI が `wait_for_chat_message` を呼ぶと、未配信メッセージが（対象の種別・ID・タイトル付きで）即座に返り、「未配信」印が消える
- [ ] 未配信メッセージが無い状態で待ち受け中に送ると、待ち受け中の呼び出しがそのメッセージを受け取って返る
- [ ] 待ち受け中は「エージェントが待機中」と表示され、待ち受けが終わる（タイムアウト・切断）と表示が戻る
- [ ] AI が `reply_chat_message` で返信すると、開いている詳細画面に手動リロードなしで表示される
- [ ] 待ち受けが指定秒数（既定30秒、最大45秒）で空の結果として返り、エラー扱いにならない
- [ ] 待ち受け中に AI 側が切断・中断しても、次の待ち受けや他のツール呼び出しに影響しない
- [ ] チャット欄がついても、既存の詳細画面の編集・外部更新の扱い・リンク・履歴は従来どおり動く（既存テスト全緑）
- [ ] 既存利用者の DB を開いてもデータが失われず、チャット表が追加される（`docs/MIGRATIONS.md` §5 の5条件を満たすテスト）
- [ ] 対象（ページ・タスク・ノート）がゴミ箱から完全削除されたとき、そのチャットも消える
- [ ] 常設指示の文面に「対話する」の項が追加され、コピーできる。`site/index.html` の複製も同じ文面になる
- [ ] README の MCP ツール一覧に新ツール3つが載る（`npm run check:readme` が通る）

### 6. スコープ外

- AI から利用者への「問いかけ」の待ち合わせ（AI が返信して待ち受けに戻れば会話は続くので、専用の仕組みは作らない）
- 会話の検索・意味検索への取り込み（索引しない。理由は Part 2）
- 会話の編集・個別削除（表示と送信のみ。削除は対象の完全削除に連動）
- 未読バッジ・OS 通知（AI の返信を OS 通知に出すのは別タスクで検討）
- T12（アプリ内蔵 Anthropic API チャット）の凍結解除。既存経路は壊さないが触らない

### 7. 管理者確認事項（停止①）

1. **複数エージェントが同時に待ち受けている場合の配送**: 案は「先着1体にだけ届ける」（重複返信を避ける）。全員に届ける方式にすると同じ指示に複数の AI が答える。→ 先着でよいか
2. **会話の保存期間・削除**: 案は「無期限保存、対象の完全削除時に一緒に消す」。UI からの個別削除は作らない。→ これでよいか
3. **常設指示の追記文面**: §4 の案でよいか。`~/.claude/CLAUDE.md` に配布済みの文面も更新が要る（管理者作業）
4. **待ち受けの秒数**: 既定30秒・上限45秒。根拠は MCP クライアント側の既定タイムアウトが60秒であること（Part 2 参照）。→ これでよいか
5. **バックアップ**: チャット本文はバックアップ zip に含まれる（DB ファイル丸ごと書き出しのため）。除外は作らない。→ これでよいか
6. 関連: PR #231（§4.11 追記）が未マージ。本 SPEC は同 PR の文面を前提にしている

---

## Part 2: AI 用（実装セット定義）

### 2.0 共有コントラクト（全セット共通の「正」。Phase 3 前に確定、変更は Phase 4 のみ）

#### DB: `chat_messages` 表（`src/main/db/schema.sql` に追加、`src/main/db/migrations.ts` に `createTableMigration` を append）

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,        -- 'note' | 'task' | 'notebook'。CHECK は付けない（embeddings の T56 表再構築の前例を避ける）
  entity_id TEXT NOT NULL,
  sender TEXT NOT NULL,             -- 'user' | 'agent'
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,         -- ISO-8601 UTC
  delivered_at TEXT                 -- user 発言のみ。エージェントが受け取った時刻。agent 発言は created_at と同値を入れる
);
```

- FK 無し（`links` と同じ）。存在確認はコード側（`entity-lookup.ts` の共有ヘルパー1箇所。links-repo と共用）
- 意味検索（`embeddings`）・活動ストリーク・バックアップ件数には**含めない**。`REQUIRED_TABLE_NAMES`（import-backup.ts）にも足さない
- `purgeSoftDeletedRecords` で親が完全削除された行を `deleteOrphanChatMessages()`（親の表に無い行を一括削除、`deleteOrphanEmbeddings` と同型）で消す（Phase 4）

#### 共有型（`src/shared/preload-api.ts` に追加）

```ts
export type ChatSender = "user" | "agent";
export interface ChatEntry {           // 既存の ChatMessage（T12, Anthropic wire 形）とは別物
  id: string;
  entityType: EntityType;              // 既存 EntityType を再利用
  entityId: string;
  sender: ChatSender;
  body: string;
  createdAt: string;
  deliveredAt: string | null;
}
export interface ChatEntriesChange { entityType: EntityType; entityId: string }
export interface ChatPresence { waitingAgents: number }

// HanamaskPreloadApi に追加
listChatEntries(entityType: EntityType, entityId: string): Promise<ChatEntry[]>;
postChatEntry(entityType: EntityType, entityId: string, body: string): Promise<ChatEntry>;
getChatPresence(): Promise<ChatPresence>;
onChatEntriesChanged(callback: (change: ChatEntriesChange) => void): () => void;
onChatPresenceChanged(callback: (presence: ChatPresence) => void): () => void;
```

IPC チャネル名（preload と main の両方に定数を書く）: `chat:list-entries` / `chat:post-entry` / `chat:presence` / イベント `chat:entries-changed` / `chat:presence-changed`。既存 T12 の `chat:send` 等とは衝突しない名前にする。

#### DB リポジトリ（`src/main/db/chat-repo.ts`）

```ts
createChatEntry(input: { entityType; entityId; sender; body }): ChatEntry   // 親の存在（deleted_at IS NULL）を検査、無ければ throw
listChatEntries(entityType, entityId): ChatEntry[]                          // created_at 昇順
listUndeliveredChatEntries(): ChatEntry[]                                   // sender='user' AND delivered_at IS NULL、created_at 昇順、対象タイトル付き（ChatEntryWithTitle）
markChatEntriesDelivered(ids: string[], deliveredAt: string): void
deleteOrphanChatMessages(): number
```

#### 変更通知（`src/main/mcp/change-emitter.ts` に追加）

```ts
emitChatEntriesChanged(change: ChatEntriesChange); onChatEntriesChanged(listener)
emitChatPresenceChanged(presence: ChatPresence); onChatPresenceChanged(listener)
```

チャット専用チャネルを追加する（既存4チャネルに相乗りしない。notebooks を分けた理由と同じ）。

#### 待ち受けレジストリ（`src/main/mcp/chat-waiters.ts`）

```ts
waitForChatEntries(timeoutMs: number, signal?: AbortSignal): Promise<ChatEntryWithTitle[]>
```

- 未配信があれば即 resolve。無ければ `onChatEntriesChanged` を一回だけ購読し、`setTimeout` で timeout。resolve/timeout/abort のいずれでも購読解除・タイマー解除・待ち受け数デクリメントを**必ず**行う（`finally`）
- 配送は**先着1体**: resolve 直前に `markChatEntriesDelivered` を同期的に呼ぶ（Electron main は単一スレッドなので競合しない）
- 待ち受け数の増減で `emitChatPresenceChanged({ waitingAgents })` を発火
- Busy loop 禁止。`extra.signal` は `server.ts:66` で `callTool(name, args, extra.signal)` として渡す

#### MCP ツール（`src/main/mcp/tools/chat.ts`）— 全て `McpTool`、JSON Schema 手書き、`toToolHandler`

| name | 引数 | 戻り |
|---|---|---|
| `wait_for_chat_message` | `timeout_seconds?: integer 1..45`（既定30） | `{ messages: ChatEntryWithTitle[], timed_out: boolean }`。タイムアウトは `isError` にしない |
| `reply_chat_message` | `entity_type`(ENTITY_TYPE_SCHEMA), `entity_id`, `body` | `{ message: ChatEntry }`（`link_entities` の `{ link }` と同じ包み方） |
| `list_chat_messages` | `entity_type`, `entity_id`, `limit?: integer 1..200`（既定50、新しい順に切って昇順で返す） | `{ messages: ChatEntry[] }` |

`ChatEntryWithTitle = ChatEntry & { entityTitle: string }`。description は既存ツールと同じ英語のなびかせ文（`tool-descriptions.test.ts` の対象）。登録箇所4つ: `server.ts allTools` / `chat/agent-loop.ts allTools` / `tests/main/mcp/tool-descriptions.test.ts` / `README.md` 表。

#### タイムアウトの根拠

MCP SDK 1.30.0 クライアント既定 `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000`。`resetTimeoutOnProgress` はクライアント opt-in でサーバーから強制できない。よって上限45秒。サーバー側（`node:http` 既定 `server.timeout=0`、SSE keep-alive 15秒）に競合する期限は無い。

### 2.1 実装セット

#### Set A: 永続化と共有契約（**先行実行**。B/C が型を参照するため、A 完了後に B/C/D を並列起動）
- 目的: 受け入れ条件「再起動しても残る」「既存 DB のマイグレーション」
- 触ってよいファイル: `src/main/db/schema.sql`, `src/main/db/migrations.ts`（append のみ）, `src/main/db/chat-repo.ts`（新規）, `src/shared/preload-api.ts`（2.0 の型と API 追加のみ）, `src/main/mcp/change-emitter.ts`（2.0 の2チャネル追加のみ）, `tests/main/db/chat-repo.test.ts`（新規）, `tests/main/db/migrations.test.ts`（chat_messages のケース追加）
- 読み取りのみ: `docs/MIGRATIONS.md`（着手前必読）, `src/main/db/links-repo.ts`, `src/main/db/notes-repo.ts`, `src/main/db/tags.ts`
- テスト: MIGRATIONS §5 の5条件（旧形 DB → openDb で表が増え行が無傷 / 2回開ける / apply 直呼び / マイグレーション除去で赤くなることの確認 / 新規 DB が同形）＋ repo の CRUD・親不在 throw・delivered 更新・親削除

#### Set B: MCP ツールと待ち受け
- 目的: 受け入れ条件の `wait_for_chat_message` / `reply_chat_message` 系・タイムアウト・切断耐性
- 触ってよいファイル: `src/main/mcp/chat-waiters.ts`（新規）, `src/main/mcp/tools/chat.ts`（新規）, `src/main/mcp/server.ts`（`allTools` 追加と `extra.signal` の受け渡しのみ）, `src/main/chat/agent-loop.ts`（`allTools` 追加のみ）, `tests/main/mcp/chat-tools.test.ts`（新規）, `tests/main/mcp/tool-descriptions.test.ts`（配列追加のみ）, `README.md`（ツール表に3行追加のみ）
- 読み取りのみ: `src/main/mcp/tools/shared.ts`, `src/main/mcp/tools/links.ts`, `src/main/db/chat-repo.ts`, `tests/main/mcp/tools.test.ts`
- テスト: 未配信あり→即返却＋delivered 更新 / 未配信なし→後から post で resolve / timeout で `timed_out: true` 空配列・非エラー / AbortSignal で解除され待ち受け数が戻る / 2待ち受け同時に1件届く→片方だけ受け取る / reply が親不在で errorResult / `npm run check:readme` 緑

#### Set C: チャット欄 UI
- 目的: 受け入れ条件の画面表示・送信・未配信印・在席表示・リアルタイム反映
- 触ってよいファイル: `src/renderer/components/ChatSection.tsx`（新規）, `src/renderer/components/NoteDetail.tsx` / `TaskDetail.tsx` / `NotebookDetail.tsx`（`<ChatSection entityType entityId />` を `EntityLinks` の後に1行差し込むのみ）, `src/preload/index.ts`（チャネル定数と api の追加）, `tests/renderer/ChatSection.test.tsx`（新規）
- 読み取りのみ: `src/renderer/components/EntityLinks.tsx`（自己完結セクションの雛形）, `ChatPanel.tsx`（行の見た目）, `MarkdownBody.tsx`（エージェント返信の描画）, `SemanticSection.tsx`（見出し・リストのクラス定数）, `src/renderer/styles/theme.css`
- 規約: Tailwind ユーティリティのみ、日本語 SCREAMING_SNAKE 定数、利用者=aqua / エージェント=pink、`aria-label`、`window.hanamask.*` は preload-api の型に従う。`onChatEntriesChanged` は自分の entity に一致するときだけ再取得
- テスト: 一覧描画 / 送信で `postChatEntry` が呼ばれ入力が空になる / 空文字は送れない / 在席 0 で不在メッセージ / `deliveredAt: null` で未配信印 / 変更イベントで再取得（他 entity のイベントでは再取得しない）

#### Set D: 常設指示
- 目的: 受け入れ条件「常設指示に『対話する』が加わる」
- 触ってよいファイル: `src/renderer/components/StandingInstruction.tsx`（`STANDING_INSTRUCTION` への箇条書き追記のみ）, `site/index.html`（複製箇所の同文面追記）, `tests/renderer/StandingInstruction.test.tsx`（`wait_for_chat_message` / `reply_chat_message` / `対話する` のキーワード断言追加）
- 文面は Part 1 §4（管理者確認後の確定版）をそのまま使う。穴埋めプレースホルダ禁止（既存の負テスト）

### 2.2 並列グループ宣言

- グループ 0（先行・単独）: Set A
- グループ 1（A 完了後に並列）: Set B, Set C, Set D — 触るファイルに重複なし
- **Phase 4 統合ゲートでのみ編集**: `src/main/index.ts`（`ipcMain.handle` 3本、`chat:entries-changed` / `chat:presence-changed` の broadcast、emitter 購読）, `src/main/db/purge.ts`（`deleteOrphanChatMessages` の呼び出し）, `docs/REQUIREMENTS.md` §7（ツール3つを追記）, `docs/TASKS.md` T62 ステータス, `docs/MIGRATIONS.md` §6（実データ検証はリリース前・管理者と実施）

### 2.3 完了条件（機械判定）

- `npm test` 全緑（新規テスト含む）、`npm run lint`、`npm run typecheck`、`npm run build`、`npm run check:readme` が全て成功
- `docs/MIGRATIONS.md` §5 の5条件を満たすテストが存在し、マイグレーションを一時的に外すと赤くなることを Phase 4 で確認
- e2e-runner で受け入れ条件の 📸 箇所を実機確認（Phase 5 の後）
