import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRAY_ANNOUNCEMENT,
  createTray,
  decideOnWindowClose,
  shouldAnnounceTray,
} from "../../src/main/tray";

interface FakeTray {
  setToolTip: ReturnType<typeof vi.fn>;
  setContextMenu: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

interface MenuItemTemplate {
  label: string;
  click: () => void;
}

// vi.mock のファクトリは import より先に走るため、モックは vi.hoisted で用意する。
const { createdTrays, trayIconPaths, builtMenuTemplates, TrayMock, buildFromTemplate } = vi.hoisted(
  () => {
    const trays: FakeTray[] = [];
    const iconPaths: string[] = [];
    const templates: MenuItemTemplate[][] = [];
    // Declared as a function expression because the module under test calls it with `new`.
    const trayConstructor = vi.fn(function createFakeTray(iconPath: string): FakeTray {
      iconPaths.push(iconPath);
      const tray: FakeTray = {
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      };
      trays.push(tray);
      return tray;
    });
    const menuBuilder = vi.fn((template: MenuItemTemplate[]) => {
      templates.push(template);
      return { template };
    });
    return {
      createdTrays: trays,
      trayIconPaths: iconPaths,
      builtMenuTemplates: templates,
      TrayMock: trayConstructor,
      buildFromTemplate: menuBuilder,
    };
  },
);

vi.mock("electron", () => ({
  Tray: TrayMock,
  Menu: { buildFromTemplate },
}));

const findMenuItem = (label: string): MenuItemTemplate => {
  const [template] = builtMenuTemplates;
  const item = template?.find((entry) => entry.label === label);
  if (item === undefined) throw new Error(`Menu item not found: ${label}`);
  return item;
};

const findClickHandler = (tray: FakeTray): (() => void) => {
  const registered = tray.on.mock.calls.find(([event]) => event === "click");
  const handler = registered?.[1];
  if (typeof handler !== "function") throw new Error("click handler not registered");
  return handler;
};

describe("decideOnWindowClose", () => {
  it("keeps the app in the tray when closing to tray is enabled", () => {
    expect(decideOnWindowClose({ closeToTray: true, isQuitting: false })).toBe("keep-in-tray");
  });

  it("quits when closing to tray is disabled", () => {
    expect(decideOnWindowClose({ closeToTray: false, isQuitting: false })).toBe("quit");
  });

  it("quits on an explicit quit even when closing to tray is enabled", () => {
    expect(decideOnWindowClose({ closeToTray: true, isQuitting: true })).toBe("quit");
  });

  it("quits on an explicit quit when closing to tray is disabled", () => {
    expect(decideOnWindowClose({ closeToTray: false, isQuitting: true })).toBe("quit");
  });
});

describe("shouldAnnounceTray", () => {
  it("announces the first time the window is closed to the tray", () => {
    expect(shouldAnnounceTray({ closeToTray: true, alreadyAnnounced: false })).toBe(true);
  });

  it("stays silent from the second time onwards", () => {
    expect(shouldAnnounceTray({ closeToTray: true, alreadyAnnounced: false })).toBe(true);
    expect(shouldAnnounceTray({ closeToTray: true, alreadyAnnounced: true })).toBe(false);
  });

  it("stays silent when the app quits on close instead of staying in the tray", () => {
    expect(shouldAnnounceTray({ closeToTray: false, alreadyAnnounced: false })).toBe(false);
  });

  it("has an announcement text to show", () => {
    expect(TRAY_ANNOUNCEMENT.title.length).toBeGreaterThan(0);
    expect(TRAY_ANNOUNCEMENT.body.length).toBeGreaterThan(0);
  });
});

describe("createTray", () => {
  const onOpen = vi.fn();
  const onQuit = vi.fn();
  const iconPath = "/tmp/hanamask/icon.png";

  beforeEach(() => {
    createdTrays.length = 0;
    trayIconPaths.length = 0;
    builtMenuTemplates.length = 0;
    onOpen.mockClear();
    onQuit.mockClear();
    TrayMock.mockClear();
    buildFromTemplate.mockClear();
  });

  it("creates the tray with the given icon", () => {
    createTray({ onOpen, onQuit, iconPath });
    expect(trayIconPaths).toEqual([iconPath]);
  });

  it("offers exactly two menu items: open and quit", () => {
    createTray({ onOpen, onQuit, iconPath });
    const [template] = builtMenuTemplates;
    expect(template?.map((item) => item.label)).toEqual(["hanamask を開く", "終了"]);
  });

  it("opens the window from the menu", () => {
    createTray({ onOpen, onQuit, iconPath });
    findMenuItem("hanamask を開く").click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onQuit).not.toHaveBeenCalled();
  });

  it("quits from the menu", () => {
    createTray({ onOpen, onQuit, iconPath });
    findMenuItem("終了").click();
    expect(onQuit).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("opens the window when the icon itself is clicked", () => {
    createTray({ onOpen, onQuit, iconPath });
    const [tray] = createdTrays;
    if (tray === undefined) throw new Error("tray was not created");
    findClickHandler(tray)();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("returns the created tray so it can be destroyed on quit", () => {
    const tray = createTray({ onOpen, onQuit, iconPath });
    tray.destroy();
    expect(createdTrays[0]?.destroy).toHaveBeenCalledTimes(1);
  });
});
