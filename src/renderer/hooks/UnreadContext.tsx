import { createContext, useContext, type JSX, type ReactNode } from "react";
import type { EntityType } from "../../shared/preload-api";
import { UnreadMark } from "../components/UnreadMark";
import { useUnread, type UnreadState } from "./useUnread";

// Provider の外（部品単体のテストなど）では、印を出さないだけで動くようにしておく。
const NO_UNREAD: UnreadState = {
  hasUnread: false,
  isUnread: () => false,
  markAllViewed: async () => {},
};

const UnreadContext = createContext<UnreadState>(NO_UNREAD);

export const UnreadProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const unread = useUnread();
  return <UnreadContext.Provider value={unread}>{children}</UnreadContext.Provider>;
};

export const useUnreadState = (): UnreadState => useContext(UnreadContext);

export const UnreadMarkFor = ({
  entityType,
  id,
}: {
  entityType: EntityType;
  id: string;
}): JSX.Element | null => (useUnreadState().isUnread(entityType, id) ? <UnreadMark /> : null);
