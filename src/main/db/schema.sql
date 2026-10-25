CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- NULL は「どのノートにも属さないページ」。notebooks.id を指すが FK は張らない（links と同じ方針）。
  notebook_id TEXT,
  -- NULL ならピン留めなし。留めた時刻を持つのは、ピン欄を留めた順に並べるため。
  pinned_at TEXT
);

-- ページを束ねるノート（docs/REQUIREMENTS.md §4.9）。summary が利用者から見た「概要」。
CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- NULL ならピン留めなし。notes.pinned_at と同じ意味。
  pinned_at TEXT
);

-- Snapshot of a note's content taken immediately before each update. Rows are never
-- updated or trimmed, so the table doubles as the note's edit history.
CREATE TABLE IF NOT EXISTS note_versions (
  id TEXT PRIMARY KEY,
  -- 対象エンティティのID。entity_type が 'notebook' のときは notebooks.id が入る
  -- （列名を entity_id へ改名すると表の作り直しになるため、名前は据え置いている）。
  note_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL,
  created_at TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'note'
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  due_date TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- file_path points at a copy stored under the app's user-data directory, so the
-- attachment survives the user moving or deleting the file they picked.
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL
);

-- No foreign keys to notes/tasks: a link's endpoints can be either entity type,
-- so a single FK column can't target both tables. Orphaned links (endpoint
-- deleted) are tolerated for now; docs/REQUIREMENTS.md doesn't require
-- referential integrity here, and cleanup can be added later if it matters.
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  from_type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL
);

-- Semantic search index. One vector per record, keyed by which model produced it: swapping the
-- bundled model invalidates every vector, and content_hash lets a restart re-embed only the
-- records whose text actually changed.
CREATE TABLE IF NOT EXISTS embeddings (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('note','task','notebook')),
  entity_id   TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  vector      BLOB NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

-- 利用者が最後に詳細を見た時刻（§4.11）。記録の表に列を足すと、見ただけで行が更新されて
-- 更新日時や索引の判定を巻き込むので、別の表に持つ。既読は利用者の状態で、MCPには出さない。
CREATE TABLE IF NOT EXISTS views (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('note','task','notebook')),
  entity_id   TEXT NOT NULL,
  viewed_at   TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

-- レビューコメント（§4.12）。parent_id が NULL の行がスレッドの先頭で、引用（quote と前後の文字）と
-- 状態を持つ。返信は先頭の id を parent_id に持つ。links と同じく記録への外部キーは張らない。
CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('note','task')),
  entity_id   TEXT NOT NULL,
  parent_id   TEXT,
  author      TEXT NOT NULL CHECK (author IN ('user','agent')),
  body        TEXT NOT NULL,
  quote       TEXT,
  prefix      TEXT,
  suffix      TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  resolved_at TEXT,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS comments_entity ON comments (entity_type, entity_id);

-- アプリ全体で1つだけ持つ値。views_baseline（既読の記録を始めた時刻）など。
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
