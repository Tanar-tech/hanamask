import { listEmbeddings, type StoredEmbedding } from "../db/embeddings-repo.js";
import { getNote } from "../db/notes-repo.js";
import { getTask } from "../db/tasks-repo.js";
import { getEmbeddingRuntime } from "./index.js";
import { rankBySimilarity, type Ranked } from "./semantic-search.js";
import type {
  RelatedNotesResult,
  ScoredNote,
  ScoredTask,
  SemanticSearchResult,
} from "../../shared/preload-api.js";

export const EMBEDDING_LOADING_REASON = "埋め込みモデルの準備中です";

// 実体が消えている・ゴミ箱に入ったものは索引に残っていても結果から落とす。
const attachEntities = (ranked: readonly Ranked[]): SemanticSearchResult => {
  const notes: ScoredNote[] = [];
  const tasks: ScoredTask[] = [];
  ranked.forEach(({ entityType, entityId, score }) => {
    if (entityType === "note") {
      const note = getNote(entityId);
      if (note !== null) notes.push({ ...note, score });
      return;
    }
    const task = getTask(entityId);
    if (task !== null) tasks.push({ ...task, score });
  });
  return { notes, tasks };
};

interface ReadyRuntime {
  modelId: string;
  embedQuery: (text: string) => Promise<Float32Array>;
}

// 使えない理由は文字列で返す。呼び出し側はそれをそのまま `unavailable` に載せる。
const readReadyRuntime = (): ReadyRuntime | string => {
  const availability = getEmbeddingRuntime().availability();
  if (availability.state === "loading") return EMBEDDING_LOADING_REASON;
  if (availability.state === "unavailable") return availability.reason;
  const { provider } = availability;
  return { modelId: provider.modelId, embedQuery: (text) => provider.embedQuery(text) };
};

export const searchSemanticEntities = async (
  query: string,
  limit: number,
): Promise<SemanticSearchResult> => {
  const runtime = readReadyRuntime();
  if (typeof runtime === "string") return { notes: [], tasks: [], unavailable: runtime };
  const vector = await runtime.embedQuery(query);
  return attachEntities(rankBySimilarity(vector, listEmbeddings(runtime.modelId), limit));
};

const isNoteEmbedding = (embedding: StoredEmbedding): boolean => embedding.entityType === "note";

/*
 * 開いているノートを埋め込み直さず、索引済みのベクトルをそのままクエリにする。本文を
 * 読み直して推論するより速く、索引と同じ基準で並ぶ。まだ索引が無いノートは結果なしになる。
 */
export const findRelatedNotes = (noteId: string, limit: number): RelatedNotesResult => {
  const runtime = readReadyRuntime();
  if (typeof runtime === "string") return { notes: [], unavailable: runtime };
  const embeddings = listEmbeddings(runtime.modelId).filter(isNoteEmbedding);
  const own = embeddings.find((embedding) => embedding.entityId === noteId);
  if (own === undefined) return { notes: [] };
  const others = embeddings.filter((embedding) => embedding.entityId !== noteId);
  return { notes: attachEntities(rankBySimilarity(own.vector, others, limit)).notes };
};
