import { describe, expect, it, vi } from "vitest";
import {
  emitNotebooksChanged,
  emitNotesChanged,
  emitTasksChanged,
  onNotebooksChanged,
  onNotesChanged,
  onTasksChanged,
  type EntityChange,
} from "../../../src/main/mcp/change-emitter";

const notebookChange = (): EntityChange => ({
  entity: "notebook",
  action: "created",
  id: "notebook-1",
  title: "案件A",
});

describe("change emitter", () => {
  it("ノート（束）の変更は専用チャンネルの購読者に届く", () => {
    const listener = vi.fn();
    const unsubscribe = onNotebooksChanged(listener);

    const change = notebookChange();
    emitNotebooksChanged(change);
    unsubscribe();

    expect(listener).toHaveBeenCalledWith(change);
  });

  it("購読を解除した後は届かない", () => {
    const listener = vi.fn();
    onNotebooksChanged(listener)();

    emitNotebooksChanged(notebookChange());

    expect(listener).not.toHaveBeenCalled();
  });

  // 受け入れ条件11: notes:changed を購読している意味検索の索引がノート（束）に反応しないこと。
  it("ノート（束）の変更はページ・タスクのチャンネルに漏れない", () => {
    const noteListener = vi.fn();
    const taskListener = vi.fn();
    const unsubscribeNotes = onNotesChanged(noteListener);
    const unsubscribeTasks = onTasksChanged(taskListener);

    emitNotebooksChanged(notebookChange());
    unsubscribeNotes();
    unsubscribeTasks();

    expect(noteListener).not.toHaveBeenCalled();
    expect(taskListener).not.toHaveBeenCalled();
  });

  it("ページ・タスクの変更はノート（束）のチャンネルに漏れない", () => {
    const listener = vi.fn();
    const unsubscribe = onNotebooksChanged(listener);

    emitNotesChanged();
    emitTasksChanged();
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });
});
