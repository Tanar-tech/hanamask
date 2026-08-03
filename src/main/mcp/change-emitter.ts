import { EventEmitter } from "node:events";

// SPEC.mdの共有コントラクト ChangeEmitter は、オブジェクトではなく個別関数として公開する。
const NOTES_CHANGED_EVENT = "notes:changed";

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
