/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import { hasEntryOffset, renderWithMotion as render, settleMotion } from "./motion-render";
import { stubHanamask } from "./hanamask-stub";
import { Home } from "../../src/renderer/components/Home";
import { NoteList } from "../../src/renderer/components/NoteList";
import { TaskList } from "../../src/renderer/components/TaskList";
import type { Note, Task } from "../../src/shared/preload-api";

/*
 * 変更のたびに一覧を丸ごと取り直すため（docs/REQUIREMENTS.md §4.6）、これが効いていないと
 * 毎回すべての項目がアニメーションする。「増えたものだけを対象にする」判定の正しさは
 * useNewlyArrived.test.tsx が網羅しており、ここでは各画面がそれを使って実際に描画できて
 * いること——増えた1件だけが動くこと——を確かめる。
 *
 * 各画面のテストと別ファイルにしているのは、偽のタイマーを使うテストと同居できないため。
 * motion はフレームループを実時間で回すので、時計を進めたあとは入場が完了せず、
 * 「動いた項目」と「動いていない項目」を区別できなくなる。
 */

const AT_REST = "2026-08-03T00:00:00.000Z";

const makeNote = (id: string, title: string): Note => ({
  id,
  title,
  body: "本文",
  tags: [],
  createdAt: AT_REST,
  updatedAt: AT_REST,
});

const makeTask = (id: string, title: string): Task => ({
  id,
  title,
  status: "todo",
  dueDate: null,
  createdAt: AT_REST,
  updatedAt: AT_REST,
});

/** 1回目の取得では既存分だけを、通知後の2回目で1件増えた一覧を返す。 */
const feed = <T,>(calls: T[][]): (() => Promise<T[]>) => {
  const list = vi.fn(async () => calls[Math.min(list.mock.calls.length - 1, calls.length - 1)] ?? []);
  return list;
};

const collect =
  (listeners: Array<() => void>) =>
  (callback: () => void): (() => void) => {
    listeners.push(callback);
    return () => {};
  };

/** 一覧が最初に出るときの入場を終わらせてから通知を流す。前の動きが残ると区別できない。 */
const notifyAfterSettling = async (listeners: Array<() => void>): Promise<void> => {
  await settleMotion();
  await act(async () => {
    listeners.forEach((listener) => listener());
  });
};

const itemOf = (title: string): HTMLElement => {
  const item = screen.getByText(title).closest("li");
  if (item === null) throw new Error(`no list item for ${title}`);
  return item;
};

const expectOnlyArrivedMoves = (arrivedTitle: string, existingTitle: string): void => {
  expect(hasEntryOffset(itemOf(arrivedTitle))).toBe(true);
  expect(hasEntryOffset(itemOf(existingTitle))).toBe(false);
};

const NOTE_TITLES = { existing: "元からあるノート", arrived: "いま増えたノート" };
const TASK_TITLES = { existing: "元からあるタスク", arrived: "いま増えたタスク" };

const stubNoteFeed = (listeners: Array<() => void>): void => {
  const existing = makeNote("note-1", NOTE_TITLES.existing);
  const arrived = makeNote("note-2", NOTE_TITLES.arrived);
  stubHanamask({
    listNotes: feed([[existing], [arrived, existing]]),
    onNotesChanged: collect(listeners),
  });
};

const stubTaskFeed = (listeners: Array<() => void>): void => {
  const existing = makeTask("task-1", TASK_TITLES.existing);
  const arrived = makeTask("task-2", TASK_TITLES.arrived);
  stubHanamask({
    listTasks: feed([[existing], [arrived, existing]]),
    onTasksChanged: collect(listeners),
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("新しく現れた項目の入場アニメーション", () => {
  it("ノート一覧では増えたノートだけが動く", async () => {
    const listeners: Array<() => void> = [];
    stubNoteFeed(listeners);

    render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText(NOTE_TITLES.existing);
    await notifyAfterSettling(listeners);
    await screen.findByText(NOTE_TITLES.arrived);

    expectOnlyArrivedMoves(NOTE_TITLES.arrived, NOTE_TITLES.existing);
  });

  it("タスク一覧では増えたタスクだけが動く", async () => {
    const listeners: Array<() => void> = [];
    stubTaskFeed(listeners);

    render(<TaskList onSelectTask={vi.fn()} />);
    await screen.findByText(TASK_TITLES.existing);
    await notifyAfterSettling(listeners);
    await screen.findByText(TASK_TITLES.arrived);

    expectOnlyArrivedMoves(TASK_TITLES.arrived, TASK_TITLES.existing);
  });

  it("ホームの最近のノートでは増えたノートだけが動く", async () => {
    const listeners: Array<() => void> = [];
    stubNoteFeed(listeners);

    render(<Home onSelectNote={vi.fn()} onSelectTask={vi.fn()} onSearch={vi.fn()} />);
    await screen.findByText(NOTE_TITLES.existing);
    await notifyAfterSettling(listeners);
    await screen.findByText(NOTE_TITLES.arrived);

    expectOnlyArrivedMoves(NOTE_TITLES.arrived, NOTE_TITLES.existing);
  });

  it("ホームの進行中のタスクでは増えたタスクだけが動く", async () => {
    const listeners: Array<() => void> = [];
    stubTaskFeed(listeners);

    render(<Home onSelectNote={vi.fn()} onSelectTask={vi.fn()} onSearch={vi.fn()} />);
    await screen.findByText(TASK_TITLES.existing);
    await notifyAfterSettling(listeners);
    await screen.findByText(TASK_TITLES.arrived);

    expectOnlyArrivedMoves(TASK_TITLES.arrived, TASK_TITLES.existing);
  });
});
