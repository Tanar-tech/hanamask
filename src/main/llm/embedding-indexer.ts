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
  logger?: { warn(message: string): void };
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

// ノート（束）は索引対象外（対応は T56）。専用チャンネル購読なのでここへは来ないが、
// 万一混ざったときに黙ってページとして索引しないよう型で落とす。
const toQueueItem = (change: EntityChange): QueueItem | undefined =>
  change.entity === "notebook"
    ? undefined
    : { entityType: change.entity, entityId: change.id };

export const createEmbeddingIndexer = (deps: EmbeddingIndexerDeps): EmbeddingIndexer => {
  const debounceMs = deps.debounceMs ?? EMBEDDING_INDEX_DEBOUNCE_MS;
  const now = deps.now ?? (() => new Date().toISOString());
  const maxChars = maxCharsForContext(deps.contextSize);

  const queue = new Map<string, QueueItem>();
  const statusListeners = new Set<(status: EmbeddingIndexStatus) => void>();
  const unsubscribes: Array<() => void> = [];
  let status: EmbeddingIndexStatus = statusOf(deps.getAvailability(), 0);
  const warn = (message: string): void => {
    if (deps.logger === undefined) {
      console.warn(message);
      return;
    }
    deps.logger.warn(message);
  };
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let drainPromise: Promise<void> | null = null;
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
   * 索引更新が黙って止まらないよう、失敗は必ず記録する。本文・タイトル・エラー本文は
   * 記録に載せない（ログから記録の中身が漏れないようにするため。SPEC S4）。
   */
  const warnEmbedFailure = (item: QueueItem, error: unknown): void => {
    const kind = error instanceof Error ? error.name : "unknown";
    warn(`埋め込みに失敗しました: ${item.entityType} ${item.entityId} (${kind})`);
  };

  /*
   * node-llama-cpp の埋め込みは並列にしても速くならないため直列で回す。1件が throw しても
   * キューからは外す（その項目は次の変更で再試行される）。
   */
  const drainQueue = async (): Promise<void> => {
    for (const [key, item] of queue) {
      const availability = deps.getAvailability();
      if (availability.state !== "ready") break;
      queue.delete(key);
      try {
        await embedOne(availability.provider, item);
      } catch (error) {
        warnEmbedFailure(item, error);
      }
      publishStatus();
    }
  };

  // 進行中の drain を Promise で保持するのは、reindexAll がその完了を待てるようにするため。
  const drain = async (): Promise<void> => {
    if (drainPromise !== null) return drainPromise;
    drainPromise = drainQueue().finally(() => {
      drainPromise = null;
      publishStatus();
    });
    return drainPromise;
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
    /*
     * 削除はソフトデリートなので埋め込み行には触らない。検索は deleted_at IS NULL の
     * JOIN で除外するため結果に出ず、復元時は content_hash が一致して再計算も起きない。
     * 物理削除で行き場を失った行は purge の孤児掃除が落とす。
     */
    if (change.action === "deleted") return;
    const item = toQueueItem(change);
    if (item === undefined) return;
    enqueue([item]);
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

  /*
   * 進行中の drain があるとその周回はキューを取り切ってしまうので、待ってからもう1周する。
   * 待たないと reindexAll が「まだ埋めていない分」を残したまま resolve してしまう。
   */
  const reindexAll = async (): Promise<void> => {
    await drainPromise;
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
