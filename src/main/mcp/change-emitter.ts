import { EventEmitter } from "node:events";

// SPEC.mdの共有コントラクト ChangeEmitter は、オブジェクトではなく個別関数として公開する。
const NOTES_CHANGED_EVENT = "notes:changed";
const TASKS_CHANGED_EVENT = "tasks:changed";
// リンクはノートとタスクをまたぐため、どちらのチャンネルに載せても意味論がずれる。独立させる。
const LINKS_CHANGED_EVENT = "links:changed";

const emitter = new EventEmitter();

// 変更の中身。OS通知に何を出すかを決めるために載せる。通知に出せるのはタイトルまでなので、
// ノート本文はここにも入れない。
export interface EntityChange {
  entity: "note" | "task";
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

export const emitLinksChanged = (): void => {
  emitter.emit(LINKS_CHANGED_EVENT);
};

export const onLinksChanged = (listener: () => void): (() => void) => {
  emitter.on(LINKS_CHANGED_EVENT, listener);
  return () => {
    emitter.off(LINKS_CHANGED_EVENT, listener);
  };
};
