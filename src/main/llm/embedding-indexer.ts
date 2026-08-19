import type {
  EmbeddedEntityType,
  StaleEntity,
  StoredEmbedding,
} from "../db/embeddings-repo.js";
import type { ChangeListener, EntityChange } from "../mcp/change-emitter.js";
import type { EmbeddingAvailability, EmbeddingProvider } from "./embedding-provider.js";
import { buildDocumentText, maxCharsForContext } from "./text-for-embedding.js";

// 書き込みが立て続けに来たときにまとめて処理する幅。OS通知の集約窓と同じ理由で2秒。
export const EMBEDDING_INDEX_DEBOUNCE_MS = 2000;

export interface EmbeddingIndexStatus {
  state: EmbeddingAvailability["state"];
  pending: number;
  reason?: string;
}

export interface EmbeddingIndexerRepo {
  upsertEmbedding: (row: StoredEmbedding) => void;
  deleteEmbedding: (entityType: EmbeddedEntityType, entityId: string) => void;
  listStaleEntities: (modelId: string) => StaleEntity[];
  contentHashOf: (title: string, body: string) => string;
}

export interface EmbeddingIndexerDeps {
  repo: EmbeddingIndexerRepo;
  getAvailability: () => EmbeddingAvailability;
  onAvailabilityChanged?: (listener: () => void) => () => void;
  subscribeNotes: (listener: ChangeListener) => () => void;
  subscribeTasks: (listener: ChangeListener) => () => void;
  readEntity: (
    entityType: EmbeddedEntityType,
    entityId: string,
  ) => { title: string; body: string } | undefined;
  contextSize: number;
  now?: () => string;
  debounceMs?: number;
}

export interface EmbeddingIndexer {
  start: () => void;
  stop: () => void;
  getStatus: () => EmbeddingIndexStatus;
  onStatusChanged: (listener: (status: EmbeddingIndexStatus) => void) => () => void;
  reindexAll: () => Promise<void>;
}

interface QueueItem {
  entityType: EmbeddedEntityType;
  entityId: string;
}

const keyOf = (item: QueueItem): string => `${item.entityType}:${item.entityId}`;

const statusOf = (availability: EmbeddingAvailability, pending: number): EmbeddingIndexStatus =>
  availability.state === "unavailable"
    ? { state: "unavailable", pending, reason: availability.reason }
    : { state: availability.state, pending };

const isSameStatus = (left: EmbeddingIndexStatus, right: EmbeddingIndexStatus): boolean =>
  left.state === right.state && left.pending === right.pending && left.reason === right.reason;

const toQueueItem = (change: EntityChange): QueueItem => ({
  entityType: change.entity,
  entityId: change.id,
});

export const createEmbeddingIndexer = (deps: EmbeddingIndexerDeps): EmbeddingIndexer => {
  const debounceMs = deps.debounceMs ?? EMBEDDING_INDEX_DEBOUNCE_MS;
  const now = deps.now ?? (() => new Date().toISOString());
  const maxChars = maxCharsForContext(deps.contextSize);

  const queue = new Map<string, QueueItem>();
  const statusListeners = new Set<(status: EmbeddingIndexStatus) => void>();
  const unsubscribes: Array<() => void> = [];
  let status: EmbeddingIndexStatus = statusOf(deps.getAvailability(), 0);
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;
  let started = false;

  const publishStatus = (): void => {
    const next = statusOf(deps.getAvailability(), queue.size);
    if (isSameStatus(status, next)) return;
    status = next;
    statusListeners.forEach((listener) => {
      listener(next);
    });
  };

  const embedOne = async (provider: EmbeddingProvider, item: QueueItem): Promise<void> => {
    const entity = deps.readEntity(item.entityType, item.entityId);
    if (entity === undefined) return;
    const vector = await provider.embedDocument(
      buildDocumentText(entity.title, entity.body, maxChars),
    );
    deps.repo.upsertEmbedding({
      entityType: item.entityType,
      entityId: item.entityId,
      modelId: provider.modelId,
      contentHash: deps.repo.contentHashOf(entity.title, entity.body),
      vector,
      updatedAt: now(),
    });
  };

  /*
   * node-llama-cpp の埋め込みは並列にしても速くならないため直列で回す。1件が throw しても
   * キューからは外す（その項目は次の変更で再試行される）。
   */
  const drain = async (): Promise<void> => {
    if (flushing) return;
    flushing = true;
    try {
      for (const [key, item] of queue) {
        const availability = deps.getAvailability();
        if (availability.state !== "ready") break;
        queue.delete(key);
        try {
          await embedOne(availability.provider, item);
        } catch {
          // 1件の失敗で索引更新全体を止めない。
        }
        publishStatus();
      }
    } finally {
      flushing = false;
      publishStatus();
    }
  };

  const scheduleFlush = (): void => {
    flushTimer ??= setTimeout(() => {
      flushTimer = undefined;
      void drain();
    }, debounceMs);
  };

  const enqueue = (items: readonly QueueItem[]): void => {
    items.forEach((item) => {
      queue.set(keyOf(item), item);
    });
    publishStatus();
    scheduleFlush();
  };

  const enqueueStale = (): void => {
    const availability = deps.getAvailability();
    if (availability.state !== "ready") return;
    enqueue(deps.repo.listStaleEntities(availability.provider.modelId));
  };

  const handleChange = (change?: EntityChange): void => {
    // 購読解除と行き違いで届いた変更を、停止後の書き込みにしない。
    if (!started) return;
    if (change === undefined) {
      enqueueStale();
      return;
    }
    if (change.action === "deleted") {
      queue.delete(keyOf(toQueueItem(change)));
      deps.repo.deleteEmbedding(change.entity, change.id);
      publishStatus();
      return;
    }
    enqueue([toQueueItem(change)]);
  };

  const start = (): void => {
    if (started) return;
    started = true;
    unsubscribes.push(deps.subscribeNotes(handleChange), deps.subscribeTasks(handleChange));
    // 読み込み完了をポーリングせずに待つため、availability の変化で保留分を流す。
    const unsubscribeAvailability = deps.onAvailabilityChanged?.(() => {
      publishStatus();
      enqueueStale();
      scheduleFlush();
    });
    if (unsubscribeAvailability !== undefined) unsubscribes.push(unsubscribeAvailability);
    enqueueStale();
    scheduleFlush();
  };

  const stop = (): void => {
    started = false;
    unsubscribes.splice(0).forEach((unsubscribe) => {
      unsubscribe();
    });
    if (flushTimer !== undefined) clearTimeout(flushTimer);
    flushTimer = undefined;
    queue.clear();
    publishStatus();
  };

  const reindexAll = async (): Promise<void> => {
    enqueueStale();
    await drain();
  };

  return {
    start,
    stop,
    getStatus: () => status,
    onStatusChanged: (listener) => {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    reindexAll,
  };
};
