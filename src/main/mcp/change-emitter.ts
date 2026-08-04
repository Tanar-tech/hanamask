import { EventEmitter } from "node:events";

// SPEC.mdの共有コントラクト ChangeEmitter は、オブジェクトではなく個別関数として公開する。
const NOTES_CHANGED_EVENT = "notes:changed";
const TASKS_CHANGED_EVENT = "tasks:changed";
// リンクはノートとタスクをまたぐため、どちらのチャンネルに載せても意味論がずれる。独立させる。
const LINKS_CHANGED_EVENT = "links:changed";

const emitter = new EventEmitter();

export const emitNotesChanged = (): void => {
  emitter.emit(NOTES_CHANGED_EVENT);
};

export const onNotesChanged = (listener: () => void): (() => void) => {
  emitter.on(NOTES_CHANGED_EVENT, listener);
  return () => {
    emitter.off(NOTES_CHANGED_EVENT, listener);
  };
};

export const emitTasksChanged = (): void => {
  emitter.emit(TASKS_CHANGED_EVENT);
};

export const onTasksChanged = (listener: () => void): (() => void) => {
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
