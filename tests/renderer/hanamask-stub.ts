import { vi } from "vitest";
import type { HanamaskPreloadApi } from "../../src/shared/preload-api";

const CHAT_SETTINGS = { apiKeyMask: null, model: "claude-sonnet-4-5" };

const notStubbed = (name: string) => (): never => {
  throw new Error(`${name} is not stubbed`);
};

/** 何もしない既定のpreload API。関心のある口だけを差し替えて使う。 */
export const stubHanamask = (overrides: Partial<HanamaskPreloadApi>): void => {
  window.hanamask = {
    listNotes: vi.fn(async () => []),
    searchNotes: vi.fn(async () => []),
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    readChatSettings: vi.fn(async () => CHAT_SETTINGS),
    sendChatMessage: vi.fn(async () => []),
    abortChat: vi.fn(async () => {}),
    onChatEvent: vi.fn(() => () => {}),
    saveChatApiKey: vi.fn(async () => CHAT_SETTINGS),
    clearChatApiKey: vi.fn(async () => CHAT_SETTINGS),
    saveChatModel: vi.fn(async (model: string) => ({ apiKeyMask: null, model })),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    updateTask: vi.fn(async () => null),
    onTasksChanged: vi.fn(() => () => {}),
    onNavigate: vi.fn(() => () => {}),
    attachImage: vi.fn(notStubbed("attachImage")),
    listImages: vi.fn(async () => []),
    listLinks: vi.fn(async () => []),
    createLink: vi.fn(notStubbed("createLink")),
    deleteLink: vi.fn(async () => true),
    onLinksChanged: vi.fn(() => () => {}),
    exportBackup: vi.fn(notStubbed("exportBackup")),
    importBackup: vi.fn(notStubbed("importBackup")),
    ...overrides,
  };
};
