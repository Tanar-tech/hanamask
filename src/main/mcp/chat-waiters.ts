import {
  listUndeliveredChatEntries,
  markChatEntriesDelivered,
  type ChatEntryWithTitle,
} from "../db/chat-repo.js";
import { emitChatPresenceChanged, onChatEntriesChanged } from "./change-emitter.js";
import type { ChatPresence } from "../../shared/preload-api.js";

let waitingAgents = 0;

export const getChatPresence = (): ChatPresence => ({ waitingAgents });

const changeWaitingAgents = (delta: number): void => {
  waitingAgents += delta;
  emitChatPresenceChanged(getChatPresence());
};

/*
 * 同じ指示に複数のエージェントが答えないよう、配送は先着1体に限る。resolve より先に
 * 同期で配信済みへ倒すので、Electron main が単一スレッドである限り二重配送は起きない。
 */
const takeUndeliveredEntries = (): ChatEntryWithTitle[] => {
  const entries = listUndeliveredChatEntries();
  if (entries.length === 0) return [];
  const deliveredAt = new Date().toISOString();
  markChatEntriesDelivered(
    entries.map((entry) => entry.id),
    deliveredAt,
  );
  return entries.map((entry) => ({ ...entry, deliveredAt }));
};

const listenForAbort = (signal: AbortSignal, onAbort: () => void): (() => void) => {
  signal.addEventListener("abort", onAbort);
  return () => signal.removeEventListener("abort", onAbort);
};

const waitForNextEntries = (
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ChatEntryWithTitle[]> =>
  new Promise((resolve, reject) => {
    const cleanups: (() => void)[] = [];
    let settled = false;
    const settle = (): boolean => {
      if (settled) return false;
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
      return true;
    };
    const finish = (entries: ChatEntryWithTitle[]): void => {
      if (settle()) resolve(entries);
    };
    cleanups.push(
      onChatEntriesChanged(() => {
        // 配信済みへ倒す書き込みが失敗しても、投稿側（保存は済んでいる）へ例外を逆流させず
        // 待ち受け側の失敗として返す。
        try {
          // 先を越されて手ぶらになったときは、まだ待ち続ける（空で返すのは時間切れだけ）。
          const entries = takeUndeliveredEntries();
          if (entries.length > 0) finish(entries);
        } catch (error: unknown) {
          if (settle()) reject(error instanceof Error ? error : new Error(String(error)));
        }
      }),
    );
    const timer = setTimeout(() => finish([]), timeoutMs);
    cleanups.push(() => clearTimeout(timer));
    if (signal !== undefined) cleanups.push(listenForAbort(signal, () => finish([])));
  });

// 中断は異常ではなくエージェント側の都合なので、reject ではなく空の結果（時間切れ扱い）で返す。
export const waitForChatEntries = async (
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ChatEntryWithTitle[]> => {
  const immediate = takeUndeliveredEntries();
  if (immediate.length > 0) return immediate;
  if (signal?.aborted === true) return [];
  changeWaitingAgents(1);
  try {
    return await waitForNextEntries(timeoutMs, signal);
  } finally {
    changeWaitingAgents(-1);
  }
};
