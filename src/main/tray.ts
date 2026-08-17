import { Menu, Tray } from "electron";

const TRAY_TOOLTIP = "hanamask";
const OPEN_MENU_LABEL = "hanamask を開く";
const QUIT_MENU_LABEL = "終了";

// 閉じた直後は「消えた」と誤解されるため、居残り先を一度だけ伝える。
export const TRAY_ANNOUNCEMENT = {
  title: "hanamask は通知領域で動いています",
  body: "アイコンをクリックすると開きます。終了は右クリックのメニューから。",
} as const;

export type WindowCloseAction = "keep-in-tray" | "quit";

export interface WindowCloseState {
  closeToTray: boolean;
  isQuitting: boolean;
}

// メニューの「終了」など明示的な終了操作は、常駐設定より優先する。
export const decideOnWindowClose = ({
  closeToTray,
  isQuitting,
}: WindowCloseState): WindowCloseAction => (isQuitting || !closeToTray ? "quit" : "keep-in-tray");

export interface TrayAnnouncementState {
  closeToTray: boolean;
  alreadyAnnounced: boolean;
}

export const shouldAnnounceTray = ({
  closeToTray,
  alreadyAnnounced,
}: TrayAnnouncementState): boolean => closeToTray && !alreadyAnnounced;

export interface CreateTrayOptions {
  onOpen: () => void;
  onQuit: () => void;
  iconPath: string;
}

export const createTray = ({ onOpen, onQuit, iconPath }: CreateTrayOptions): Tray => {
  const tray = new Tray(iconPath);
  tray.setToolTip(TRAY_TOOLTIP);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: OPEN_MENU_LABEL, click: onOpen },
      { label: QUIT_MENU_LABEL, click: onQuit },
    ]),
  );
  tray.on("click", onOpen);
  return tray;
};
