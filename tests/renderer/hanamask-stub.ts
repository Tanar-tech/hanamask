import { vi } from "vitest";
import type {
  AppSettings,
  EmbeddingStatus,
  HanamaskPreloadApi,
} from "../../src/shared/preload-api";

const CHAT_SETTINGS = { apiKeyMask: null, model: "claude-sonnet-4-5" };

const notStubbed = (name: string) => (): never => {
  throw new Error(`${name} is not stubbed`);
};

const UNAVAILABLE_STATUS: EmbeddingStatus = {
  state: "unavailable",
  pending: 0,
};

/** 何もしない既定のpreload API。関心のある口だけを差し替えて使う。 */
export const stubHanamask = (overrides: Partial<HanamaskPreloadApi>): void => {
  const base: HanamaskPreloadApi = {
    listNotebooks: vi.fn(async () => []),
    getNotebook: vi.fn(async () => ({ notebook: null, notes: [] })),
    deleteTask: vi.fn(async () => {}),
    listDeletedTasks: vi.fn(async () => []),
    restoreTask: vi.fn(async () => null),
    listNotes: vi.fn(async () => []),
    searchNotes: vi.fn(async () => []),
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
    setNotePinned: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    onNotebooksChanged: vi.fn(() => () => undefined),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    listDeletedNotebooks: vi.fn(async () => []),
    updateNotebook: vi.fn(async () => null),
    restoreNotebook: vi.fn(async () => true),
    setNotebookPinned: vi.fn(async () => null),
    readActivity: vi.fn(async () => ({ lastRecordedAt: null, recentCount: 0 })),
    readMcpEndpoint: vi.fn(async () => ({
      port: 39217,
      url: "http://127.0.0.1:39217/mcp",
    })),
    readAppSettings: vi.fn(async () => ({
      closeToTray: true,
      openAtLogin: false,
    })),
    saveAppSettings: vi.fn(async (settings: AppSettings) => settings),
    readChatSettings: vi.fn(async () => CHAT_SETTINGS),
    sendChatMessage: vi.fn(async () => []),
    abortChat: vi.fn(async () => {}),
    onChatEvent: vi.fn(() => () => {}),
    saveChatApiKey: vi.fn(async () => CHAT_SETTINGS),
    clearChatApiKey: vi.fn(async () => CHAT_SETTINGS),
    saveChatModel: vi.fn(async (model: string) => ({
      apiKeyMask: null,
      model,
    })),
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
    semanticSearch: vi.fn(async () => ({ notes: [], tasks: [], notebooks: [] })),
    relatedNotes: vi.fn(async () => ({ notes: [] })),
    readEmbeddingStatus: vi.fn(async () => UNAVAILABLE_STATUS),
    onEmbeddingStatusChanged: vi.fn(() => () => {}),
  };
  const api: HanamaskPreloadApi = { ...base, ...overrides };
  window.hanamask = api;
};
