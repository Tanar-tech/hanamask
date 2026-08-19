import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_INDEX_DEBOUNCE_MS,
  createEmbeddingIndexer,
  type EmbeddingIndexStatus,
  type EmbeddingIndexerDeps,
} from "../../../src/main/llm/embedding-indexer";
import type { EmbeddingAvailability } from "../../../src/main/llm/embedding-provider";
import type { StaleEntity, StoredEmbedding } from "../../../src/main/db/embeddings-repo";
import type { ChangeListener, EntityChange } from "../../../src/main/mcp/change-emitter";
import { FakeEmbeddingProvider } from "./fake-embedding-provider";

const CONTEXT_SIZE = 512;

const noteChange = (overrides: Partial<EntityChange> = {}): EntityChange => ({
  entity: "note",
  action: "created",
  id: "note-1",
  title: "設計メモ",
  ...overrides,
});

interface Harness {
  deps: EmbeddingIndexerDeps;
  provider: FakeEmbeddingProvider;
  upserted: StoredEmbedding[];
  deleted: Array<{ entityType: string; entityId: string }>;
  emitNote: (change?: EntityChange) => void;
  emitTask: (change?: EntityChange) => void;
  noteListeners: ChangeListener[];
  taskListeners: ChangeListener[];
  setAvailability: (next: EmbeddingAvailability) => void;
  stale: StaleEntity[];
  bodies: Map<string, { title: string; body: string }>;
  embedFailures: Set<string>;
}

const createHarness = (): Harness => {
  const provider = new FakeEmbeddingProvider();
  const upserted: StoredEmbedding[] = [];
  const deleted: Array<{ entityType: string; entityId: string }> = [];
  const noteListeners: ChangeListener[] = [];
  const taskListeners: ChangeListener[] = [];
  const availabilityListeners: Array<() => void> = [];
  const stale: StaleEntity[] = [];
  const embedFailures = new Set<string>();
  const bodies = new Map<string, { title: string; body: string }>([
    ["note:note-1", { title: "設計メモ", body: "MCPの接続で詰まった" }],
    ["note:note-2", { title: "別のノート", body: "本文2" }],
    ["task:task-1", { title: "READMEを直す", body: "本文3" }],
  ]);
  let availability: EmbeddingAvailability = { state: "ready", provider };

  const originalEmbedDocument = provider.embedDocument.bind(provider);
  provider.embedDocument = async (text: string) => {
    if ([...embedFailures].some((marker) => text.includes(marker))) {
      throw new Error("埋め込み失敗");
    }
    return originalEmbedDocument(text);
  };

  const removeFrom = <T>(list: T[], item: T): void => {
    const index = list.indexOf(item);
    if (index >= 0) list.splice(index, 1);
  };

  const deps: EmbeddingIndexerDeps = {
    repo: {
      upsertEmbedding: (row) => {
        upserted.push(row);
      },
      deleteEmbedding: (entityType, entityId) => {
        deleted.push({ entityType, entityId });
      },
      listStaleEntities: () => [...stale],
      contentHashOf: (title, body) => `hash(${title}|${body})`,
    },
    getAvailability: () => availability,
    onAvailabilityChanged: (listener) => {
      availabilityListeners.push(listener);
      return () => {
        removeFrom(availabilityListeners, listener);
      };
    },
    subscribeNotes: (listener) => {
      noteListeners.push(listener);
      return () => {
        removeFrom(noteListeners, listener);
      };
    },
    subscribeTasks: (listener) => {
      taskListeners.push(listener);
      return () => {
        removeFrom(taskListeners, listener);
      };
    },
    readEntity: (entityType, id) => bodies.get(`${entityType}:${id}`),
    contextSize: CONTEXT_SIZE,
    now: () => "2026-08-19T00:00:00.000Z",
  };

  return {
    deps,
    provider,
    upserted,
    deleted,
    noteListeners,
    taskListeners,
    stale,
    bodies,
    embedFailures,
    emitNote: (change) => {
      [...noteListeners].forEach((listener) => {
        listener(change);
      });
    },
    emitTask: (change) => {
      [...taskListeners].forEach((listener) => {
        listener(change);
      });
    },
    setAvailability: (next) => {
      availability = next;
      [...availabilityListeners].forEach((listener) => {
        listener();
      });
    },
  };
};

// デバウンス待ちと、その後に走る非同期の埋め込みを最後まで進める。
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(EMBEDDING_INDEX_DEBOUNCE_MS);
  await vi.advanceTimersByTimeAsync(0);
};

describe("embedding indexer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("2秒以内に連続した作成・更新は1回だけ埋め込む", async () => {
    const harness = createHarness();
    const indexer = createEmbeddingIndexer(harness.deps);
    indexer.start();
    await settle();
    harness.upserted.length = 0;
    harness.provider.embeddedDocuments.length = 0;

    harness.emitNote(noteChange({ action: "created" }));
    await vi.advanceTimersByTimeAsync(EMBEDDING_INDEX_DEBOUNCE_MS / 2);
    harness.emitNote(noteChange({ action: "updated" }));
    await settle();

    expect(harness.provider.embeddedDocuments).toHaveLength(1);
    expect(harness.upserted).toHaveLength(1);
    expect(harness.upserted[0]?.entityId).toBe("note-1");
    expect(harness.upserted[0]?.entityType).toBe("note");
    expect(harness.upserted[0]?.modelId).toBe(harness.provider.modelId);
    expect(harness.upserted[0]?.contentHash).toBe("hash(設計メモ|MCPの接続で詰まった)");
    expect(harness.upserted[0]?.updatedAt).toBe("2026-08-19T00:00:00.000Z");
    indexer.stop();
  });

  it("削除はデバウンスを待たずに行を消す", () => {
    const harness = createHarness();
    const indexer = createEmbeddingIndexer(harness.deps);
    indexer.start();

    harness.emitNote(noteChange({ action: "deleted" }));

    expect(harness.deleted).toEqual([{ entityType: "note", entityId: "note-1" }]);
    indexer.stop();
  });

  it("削除された項目はキューから外れ埋め込まれない", async () => {
    const harness = createHarness();
    const indexer = createEmbeddingIndexer(harness.deps);
    indexer.start();
    await settle();
    harness.provider.embeddedDocuments.length = 0;

    harness.emitNote(noteChange({ action: "updated" }));
    harness.emitNote(noteChange({ action: "deleted" }));
    await settle();

    expect(harness.provider.embeddedDocuments).toHaveLength(0);
    indexer.stop();
  });

  it("change が undefined のときは stale 全件を埋める", async () => {
    const harness = createHarness();
    harness.stale.push(
      { entityType: "note", entityId: "note-2", title: "別のノート", body: "本文2" },
      { entityType: "task", entityId: "task-1", title: "READMEを直す", body: "本文3" },
    );
    const indexer = createEmbeddingIndexer(harness.deps);
    indexer.start();
    await settle();
    harness.upserted.length = 0;

    harness.emitTask(undefined);
    await settle();

    expect(harness.upserted.map((row) => row.entityId).sort()).toEqual(["note-2", "task-1"]);
    indexer.stop();
  });

  it("起動時に stale 全件を埋める", async () => {
    const harness = createHarness();
    harness.stale.push({
      entityType: "note",
      entityId: "note-2",
      title: "別のノート",
      body: "本文2",
    });
    const indexer = createEmbeddingIndexer(harness.deps);

    indexer.start();
    await settle();

    expect(harness.upserted.map((row) => row.entityId)).toEqual(["note-2"]);
    indexer.stop();
  });

  it("loading の間は保留し ready になったら処理する", async () => {
    const harness = createHarness();
    harness.setAvailability({ state: "loading" });
    const indexer = createEmbeddingIndexer(harness.deps);
    indexer.start();

    harness.emitNote(noteChange());
    await settle();

    expect(harness.upserted).toHaveLength(0);
    expect(indexer.getStatus()).toEqual({ state: "loading", pending: 1 });

    harness.setAvailability({ state: "ready", provider: harness.provider });
    await settle();

    expect(harness.upserted.map((row) => row.entityId)).toEqual(["note-1"]);
    expect(indexer.getStatus()).toEqual({ state: "ready", pending: 0 });
    indexer.stop();
  });

  it("unavailable のときは何もせず理由を status に載せる", async () => {
    const harness = createHarness();
    harness.setAvailability({ state: "unavailable", reason: "モデルが見つからない" });
    const indexer = createEmbeddingIndexer(harness.deps);
    indexer.start();

    harness.emitNote(noteChange());
    await settle();

    expect(harness.upserted).toHaveLength(0);
    expect(harness.provider.embeddedDocuments).toHaveLength(0);
    expect(indexer.getStatus()).toEqual({
      state: "unavailable",
      pending: 1,
      reason: "モデルが見つからない",
    });
    indexer.stop();
  });

  it("埋め込みが throw しても他の項目は続ける", async () => {
    const harness = createHarness();
    harness.embedFailures.add("MCPの接続で詰まった");
    const indexer = createEmbeddingIndexer(harness.deps);
    indexer.start();
    await settle();

    harness.emitNote(noteChange({ id: "note-1" }));
    harness.emitNote(noteChange({ id: "note-2" }));
    await settle();

    expect(harness.upserted.map((row) => row.entityId)).toEqual(["note-2"]);
    expect(indexer.getStatus().pending).toBe(0);
    indexer.stop();
  });

  it("次の変更で失敗した項目を再試行する", async () => {
    const harness = createHarness();
    harness.embedFailures.add("MCPの接続で詰まった");
    const indexer = createEmbeddingIndexer(harness.deps);
    indexer.start();
    await settle();

    harness.emitNote(noteChange());
    await settle();
    expect(harness.upserted).toHaveLength(0);

    harness.embedFailures.clear();
    harness.emitNote(noteChange({ action: "updated" }));
    await settle();

    expect(harness.upserted.map((row) => row.entityId)).toEqual(["note-1"]);
    indexer.stop();
  });

  it("読めなくなった項目は飛ばす", async () => {
    const harness = createHarness();
    const indexer = createEmbeddingIndexer(harness.deps);
    indexer.start();
    await settle();

    harness.bodies.delete("note:note-1");
    harness.emitNote(noteChange());
    await settle();

    expect(harness.upserted).toHaveLength(0);
    expect(indexer.getStatus().pending).toBe(0);
    indexer.stop();
  });

  it("status が変わるたびに通知する", async () => {
    const harness = createHarness();
    const indexer = createEmbeddingIndexer(harness.deps);
    const seen: EmbeddingIndexStatus[] = [];
    indexer.onStatusChanged((status) => {
      seen.push(status);
    });
    indexer.start();

    harness.emitNote(noteChange());
    await settle();

    expect(seen).toEqual([
      { state: "ready", pending: 1 },
      { state: "ready", pending: 0 },
    ]);
    indexer.stop();
  });

  it("同じ status では通知しない", async () => {
    const harness = createHarness();
    const indexer = createEmbeddingIndexer(harness.deps);
    const seen: EmbeddingIndexStatus[] = [];
    indexer.onStatusChanged((status) => {
      seen.push(status);
    });
    indexer.start();

    harness.emitNote(noteChange());
    harness.emitNote(noteChange({ action: "updated" }));
    await settle();

    expect(seen).toHaveLength(2);
    indexer.stop();
  });

  it("onStatusChanged の解除で通知が止まる", async () => {
    const harness = createHarness();
    const indexer = createEmbeddingIndexer(harness.deps);
    const seen: EmbeddingIndexStatus[] = [];
    const unsubscribe = indexer.onStatusChanged((status) => {
      seen.push(status);
    });
    indexer.start();
    unsubscribe();

    harness.emitNote(noteChange());
    await settle();

    expect(seen).toHaveLength(0);
    indexer.stop();
  });

  it("stop() で購読が外れる", async () => {
    const harness = createHarness();
    const indexer = createEmbeddingIndexer(harness.deps);
    indexer.start();
    await settle();
    expect(harness.noteListeners).toHaveLength(1);
    expect(harness.taskListeners).toHaveLength(1);

    indexer.stop();

    expect(harness.noteListeners).toHaveLength(0);
    expect(harness.taskListeners).toHaveLength(0);
  });

  it("stop() 後に届いた変更は処理しない", async () => {
    const harness = createHarness();
    const indexer = createEmbeddingIndexer(harness.deps);
    indexer.start();
    await settle();
    const listener = harness.noteListeners[0];
    indexer.stop();

    listener?.(noteChange());
    await settle();

    expect(harness.upserted).toHaveLength(0);
  });

  it("reindexAll() は stale 全件を待てる形で埋める", async () => {
    const harness = createHarness();
    harness.stale.push({
      entityType: "note",
      entityId: "note-2",
      title: "別のノート",
      body: "本文2",
    });
    const indexer = createEmbeddingIndexer(harness.deps);

    await indexer.reindexAll();

    expect(harness.upserted.map((row) => row.entityId)).toEqual(["note-2"]);
  });

  it("contextSize から決まる上限まで本文を切り詰める", async () => {
    const harness = createHarness();
    harness.bodies.set("note:note-1", { title: "長い", body: "あ".repeat(5000) });
    const indexer = createEmbeddingIndexer({ ...harness.deps, contextSize: 16 });
    indexer.start();
    await settle();

    harness.emitNote(noteChange());
    await settle();

    expect(harness.provider.embeddedDocuments[0]).toHaveLength(24);
    indexer.stop();
  });

  it("debounceMs は上書きできる", async () => {
    const harness = createHarness();
    const indexer = createEmbeddingIndexer({ ...harness.deps, debounceMs: 50 });
    indexer.start();
    await settle();

    harness.emitNote(noteChange());
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.upserted.map((row) => row.entityId)).toEqual(["note-1"]);
    indexer.stop();
  });
});
