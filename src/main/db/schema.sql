CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Snapshot of a note's content taken immediately before each update. Rows are never
-- updated or trimmed, so the table doubles as the note's edit history.
CREATE TABLE IF NOT EXISTS note_versions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL,
  created_at TEXT NOT NULL
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
  entity_type TEXT NOT NULL CHECK (entity_type IN ('note','task')),
  entity_id   TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  vector      BLOB NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);
