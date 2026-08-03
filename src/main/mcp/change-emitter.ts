import { EventEmitter } from "node:events";

export interface ChangeEmitter {
  emitNotesChanged(): void;
  onNotesChanged(listener: () => void): () => void;
}

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

export const changeEmitter: ChangeEmitter = { emitNotesChanged, onNotesChanged };
