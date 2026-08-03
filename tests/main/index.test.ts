import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../../src/main/db/notes-repo";

const ipcHandle = vi.fn();
const getAllWindows = vi.fn();
const searchNotes = vi.fn();
const openDb = vi.fn();

vi.mock("electron", () => ({
  app: {
    // whenReady never resolves so importing the module under test does not create windows.
    whenReady: () => new Promise<void>(() => {}),
    on: vi.fn(),
    quit: vi.fn(),
    getPath: vi.fn(() => "/tmp/hanamask-userdata"),
  },
  BrowserWindow: Object.assign(vi.fn(), { getAllWindows }),
  ipcMain: { handle: ipcHandle },
}));

vi.mock("../../src/main/db/db", () => ({ openDb, closeDb: vi.fn() }));
vi.mock("../../src/main/db/notes-repo", () => ({ searchNotes }));

const importMain = async (): Promise<typeof import("../../src/main/index")> =>
  import("../../src/main/index");

const findListNotesHandler = (): (() => Note[]) => {
  const registration = ipcHandle.mock.calls.find((call) => call[0] === "notes:list");
  if (registration === undefined) {
    throw new Error("notes:list handler was not registered");
  }
  return registration[1];
};

const sampleNote: Note = {
  id: "note-1",
  title: "title",
  body: "body",
  tags: ["a"],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

describe("main process entry", () => {
  // The module registers its handlers as an import side effect, so it is imported once.
  let main: typeof import("../../src/main/index");

  beforeAll(async () => {
    main = await importMain();
  });

  beforeEach(() => {
    searchNotes.mockReset();
    getAllWindows.mockReset();
  });

  it("registers a notes:list IPC handler", () => {
    expect(ipcHandle).toHaveBeenCalledWith("notes:list", expect.any(Function));
  });

  it("returns every note from the notes:list handler", () => {
    searchNotes.mockReturnValue([sampleNote]);

    expect(findListNotesHandler()()).toEqual([sampleNote]);
    expect(searchNotes).toHaveBeenCalledWith("");
  });

  it("broadcasts notes:changed to every open window", () => {
    const send = vi.fn();
    getAllWindows.mockReturnValue([{ webContents: { send } }, { webContents: { send } }]);

    main.broadcastNotesChanged();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith("notes:changed");
  });
});
