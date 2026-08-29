import { EventEmitter } from "node:events";
import type { ChatEntriesChange, ChatPresence } from "../../shared/preload-api.js";

// SPEC.mdの共有コントラクト ChangeEmitter は、オブジェクトではなく個別関数として公開する。
const NOTES_CHANGED_EVENT = "notes:changed";
const TASKS_CHANGED_EVENT = "tasks:changed";
// notes:changed に相乗りさせると、それを購読している意味検索の索引がノート（束）のIDを
// ページとして索引しようとする。索引のノート対応は T56 なので、チャンネルごと分ける。
const NOTEBOOKS_CHANGED_EVENT = "notebooks:changed";
// リンクはノートとタスクをまたぐため、どちらのチャンネルに載せても意味論がずれる。独立させる。
const LINKS_CHANGED_EVENT = "links:changed";
// チャットは対象を絞って取り直したいので、変更の中身の形が他と違う。相乗りさせない。
const CHAT_ENTRIES_CHANGED_EVENT = "chat:entries-changed";
// 在席は会話の中身と無関係に増減するため、発言の変更とも分ける。
const CHAT_PRESENCE_CHANGED_EVENT = "chat:presence-changed";

const emitter = new EventEmitter();

// 変更の中身。OS通知に何を出すかを決めるために載せる。通知に出せるのはタイトルまでなので、
// ノート本文はここにも入れない。
export interface EntityChange {
  entity: "note" | "task" | "notebook";
  action: "created" | "updated" | "deleted";
  id: string;
  title: string;
}

export type ChangeListener = (change?: EntityChange) => void;

export const emitNotesChanged = (change?: EntityChange): void => {
  emitter.emit(NOTES_CHANGED_EVENT, change);
};

export const onNotesChanged = (listener: ChangeListener): (() => void) => {
  emitter.on(NOTES_CHANGED_EVENT, listener);
  return () => {
    emitter.off(NOTES_CHANGED_EVENT, listener);
  };
};

export const emitTasksChanged = (change?: EntityChange): void => {
  emitter.emit(TASKS_CHANGED_EVENT, change);
};

export const onTasksChanged = (listener: ChangeListener): (() => void) => {
  emitter.on(TASKS_CHANGED_EVENT, listener);
  return () => {
    emitter.off(TASKS_CHANGED_EVENT, listener);
  };
};

export const emitNotebooksChanged = (change?: EntityChange): void => {
  emitter.emit(NOTEBOOKS_CHANGED_EVENT, change);
};

export const onNotebooksChanged = (listener: ChangeListener): (() => void) => {
  emitter.on(NOTEBOOKS_CHANGED_EVENT, listener);
  return () => {
    emitter.off(NOTEBOOKS_CHANGED_EVENT, listener);
  };
};

export const emitLinksChanged = (): void => {
  emitter.emit(LINKS_CHANGED_EVENT);
};

export const onLinksChanged = (listener: () => void): (() => void) => {
  emitter.on(LINKS_CHANGED_EVENT, listener);
  return () => {
    emitter.off(LINKS_CHANGED_EVENT, listener);
  };
};

export type ChatEntriesListener = (change: ChatEntriesChange) => void;

export const emitChatEntriesChanged = (change: ChatEntriesChange): void => {
  emitter.emit(CHAT_ENTRIES_CHANGED_EVENT, change);
};

export const onChatEntriesChanged = (listener: ChatEntriesListener): (() => void) => {
  emitter.on(CHAT_ENTRIES_CHANGED_EVENT, listener);
  return () => {
    emitter.off(CHAT_ENTRIES_CHANGED_EVENT, listener);
  };
};

export type ChatPresenceListener = (presence: ChatPresence) => void;

export const emitChatPresenceChanged = (presence: ChatPresence): void => {
  emitter.emit(CHAT_PRESENCE_CHANGED_EVENT, presence);
};

export const onChatPresenceChanged = (listener: ChatPresenceListener): (() => void) => {
  emitter.on(CHAT_PRESENCE_CHANGED_EVENT, listener);
  return () => {
    emitter.off(CHAT_PRESENCE_CHANGED_EVENT, listener);
  };
};
