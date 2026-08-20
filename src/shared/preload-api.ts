// main/preload/rendererが共有するSPEC.mdの共有コントラクト型の唯一の定義元。
export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/*
 * ソフトデリート済みノート。Note に deletedAt を足すと通常の一覧・詳細まで
 * 影響するため、ゴミ箱でだけ使う派生型として分けている。
 */
export interface DeletedNote extends Note {
  deletedAt: string;
}

// ゴミ箱のパージ猶予期間。ノートとタスクの両方に同じ値を使う。
// mainのパージバッチとゴミ箱の残り日数表示が同じ値を見るよう
// ここを唯一の定義元にする（片方だけ変わると表示と実際の削除時期がずれる）。
export const TRASH_RETENTION_DAYS = 30;

/*
 * AIチャットの設定。APIキーそのものはレンダラーへ渡さず、保存済みかどうかと
 * 末尾4文字（利用者が「どのキーか」を見分けるため）だけを渡す。
 */
/*
 * AIチャットは動作しないため、2026-08-10 に利用者から見えない状態にした。
 * 画面に出さず、mainプロセスのIPCも登録しない。将来つなぎ直すときのために
 * 実装（src/main/chat/・ChatPanel.tsx・ChatSettings.tsx）はそのまま残してある。
 *
 * ここを true に戻すと、UI・IPC・設定画面がまとめて復活する。
 */
export const CHAT_ENABLED = false;

/*
 * 常駐まわりの設定。closeToTray はウィンドウを閉じたときにトレイへ残すか、
 * openAtLogin はログイン時に自動起動するか。openAtLogin の既定は false。
 */
export interface Activity {
  lastRecordedAt: string | null;
  recentCount: number;
}

export interface McpEndpoint {
  port: number;
  url: string;
}

export interface AppSettings {
  closeToTray: boolean;
  openAtLogin: boolean;
}

export interface ChatSettings {
  apiKeyMask: string | null;
  model: string;
}

export const DEFAULT_CHAT_MODEL = "claude-sonnet-4-5";

/** チャット1往復の経過。UIはこれを順に積んで見せる。 */
export interface ChatEvent {
  kind: "assistant-text" | "tool-started" | "tool-finished" | "tool-failed" | "aborted";
  text?: string;
  toolName?: string;
  detail?: string;
}

export type ChatContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean };

export interface ChatMessage {
  role: "user" | "assistant";
  content: ChatContentBlock[];
}

export interface NoteInput {
  title: string;
  body: string;
  tags: string[];
}

/*
 * ページを束ねるノート（docs/REQUIREMENTS.md §4.9）。summary が「概要」で、
 * ページ側の body にあたる。所属ページは notes.notebook_id が指す。
 */
export interface Notebook {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** DeletedNote と同じ理由で、ゴミ箱でだけ使う派生型として分けている。 */
export interface DeletedNotebook extends Notebook {
  deletedAt: string;
}

/** 版の対象。ページとノートの版は同じ表に entity_type で同居する。 */
export type VersionEntityType = "note" | "notebook";

export interface NoteVersion {
  id: string;
  /** 対象エンティティのID。entityType が 'notebook' ならノートのID。 */
  noteId: string;
  entityType: VersionEntityType;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
}

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  body: string;
  tags: string[];
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/*
 * ソフトデリート済みタスク。DeletedNote と同じ理由で、通常の一覧・カンバンに
 * deletedAt を持ち込まないようゴミ箱専用の派生型として分けている。
 */
export interface DeletedTask extends Task {
  deletedAt: string;
}

// 本文なしのタスク作成を許すため、bodyだけ任意にしている。
export interface TaskInput {
  title: string;
  body?: string;
  tags?: string[];
  status: TaskStatus;
  dueDate: string | null;
}

/* 意味検索の結果。score は正規化済みベクトルのコサイン類似度（大きいほど近い）。 */
export interface ScoredNote extends Note {
  score: number;
}

export interface ScoredTask extends Task {
  score: number;
}

/* unavailable が入っているときは中身が空。理由をUIとエージェントに同じ形で伝える。 */
export interface SemanticSearchResult {
  notes: ScoredNote[];
  tasks: ScoredTask[];
  unavailable?: string;
}

export interface RelatedNotesResult {
  notes: ScoredNote[];
  unavailable?: string;
}

export interface EmbeddingStatus {
  state: "ready" | "loading" | "unavailable";
  pending: number;
  reason?: string;
}

export type EntityType = "note" | "task" | "notebook";

export interface Link {
  id: string;
  fromType: EntityType;
  fromId: string;
  toType: EntityType;
  toId: string;
}

export interface Image {
  id: string;
  noteId: string;
  filePath: string;
  // Derived from filePath by the main process: only there is node:url available to turn a
  // Windows backslash path into a valid file:// URL the renderer can put in an <img src>.
  fileUrl: string;
  mimeType: string;
}

/** 書き出し・取り込みで運んだ件数。利用者に「何が移ったか」を数で見せるために使う。 */
export interface BackupCounts {
  notes: number;
  tasks: number;
  images: number;
}

/* ファイル選択はmain側のダイアログで行うため、利用者が選ばずに閉じた場合が結果に含まれる。 */
export type BackupExportResult =
  | { status: "saved"; filePath: string; counts: BackupCounts }
  | { status: "cancelled" };

export type BackupImportResult =
  | { status: "imported"; counts: BackupCounts; safetyCopyPath: string }
  | { status: "cancelled" };

// Which screen the renderer should show. MCP UI tools (open_note 等) drive this from the
// main process, so the shape has to stay serializable over IPC.
export type NavigateTarget =
  | { kind: "list" }
  | { kind: "note"; id: string }
  | { kind: "task"; id: string }
  | { kind: "search"; query: string }
  | { kind: "trash" };

export interface HanamaskPreloadApi {
  listNotes(): Promise<Note[]>;
  searchNotes(query: string): Promise<Note[]>;
  getNote(id: string): Promise<Note | null>;
  updateNote(
    id: string,
    input: { title?: string; body?: string; tags?: string[] },
  ): Promise<Note | null>;
  deleteNote(id: string): Promise<void>;
  onNotesChanged(callback: () => void): () => void;
  listNoteVersions(noteId: string): Promise<NoteVersion[]>;
  restoreNoteVersion(versionId: string): Promise<Note | null>;
  listDeletedNotes(): Promise<DeletedNote[]>;
  restoreNote(id: string): Promise<Note | null>;
  readActivity(): Promise<Activity>;
  readMcpEndpoint(): Promise<McpEndpoint>;
  readAppSettings(): Promise<AppSettings>;
  saveAppSettings(settings: AppSettings): Promise<AppSettings>;
  readChatSettings(): Promise<ChatSettings>;
  sendChatMessage(history: ChatMessage[], userText: string): Promise<ChatMessage[]>;
  abortChat(): Promise<void>;
  onChatEvent(callback: (event: ChatEvent) => void): () => void;
  saveChatApiKey(apiKey: string): Promise<ChatSettings>;
  clearChatApiKey(): Promise<ChatSettings>;
  saveChatModel(model: string): Promise<ChatSettings>;
  listTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  updateTaskStatus(id: string, status: TaskStatus): Promise<void>;
  updateTask(
    id: string,
    input: { title?: string; body?: string; status?: TaskStatus; dueDate?: string | null },
  ): Promise<Task | null>;
  deleteTask(id: string): Promise<void>;
  listDeletedTasks(): Promise<DeletedTask[]>;
  restoreTask(id: string): Promise<Task | null>;
  onTasksChanged(callback: () => void): () => void;
  onNavigate(callback: (view: NavigateTarget) => void): () => void;
  // The renderer cannot read a picked file from disk under contextIsolation, so it hands
  // the bytes over as Base64 and the main process owns the file copy.
  attachImage(
    noteId: string,
    fileName: string,
    dataBase64: string,
    mimeType: string,
  ): Promise<Image>;
  listImages(noteId: string): Promise<Image[]>;
  listLinks(entityType: EntityType, entityId: string): Promise<Link[]>;
  createLink(input: {
    fromType: EntityType;
    fromId: string;
    toType: EntityType;
    toId: string;
  }): Promise<Link>;
  deleteLink(id: string): Promise<boolean>;
  onLinksChanged(callback: () => void): () => void;
  // 保存先・読み込み元の選択はmain側のOSダイアログで行う。レンダラーはパスを組み立てない。
  exportBackup(): Promise<BackupExportResult>;
  importBackup(): Promise<BackupImportResult>;
  semanticSearch(query: string, limit?: number): Promise<SemanticSearchResult>;
  relatedNotes(noteId: string, limit?: number): Promise<RelatedNotesResult>;
  readEmbeddingStatus(): Promise<EmbeddingStatus>;
  onEmbeddingStatusChanged(callback: (status: EmbeddingStatus) => void): () => void;
}
