import { useCallback, useEffect, useRef, useState } from "react";
import type { EntityType, UnreadEntry } from "../../shared/preload-api";

export interface UnreadState {
  isUnread(entityType: EntityType, id: string): boolean;
  markAllViewed(): Promise<void>;
}

const keyOf = (entityType: EntityType, id: string): string =>
  `${entityType}:${id}`;

const toKeys = (entries: UnreadEntry[]): ReadonlySet<string> =>
  new Set(entries.map((entry) => keyOf(entry.entityType, entry.id)));

const subscribeAll = (reload: () => void): (() => void) => {
  // 記録が更新されれば未読が増え、既読にすれば減るため、どちらの通知でも取り直す。
  const unsubscribes = [
    window.hanamask.onViewsChanged(reload),
    window.hanamask.onNotesChanged(reload),
    window.hanamask.onNotebooksChanged(reload),
    window.hanamask.onTasksChanged(reload),
  ];
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
};

export const useUnread = (): UnreadState => {
  const [unreadKeys, setUnreadKeys] = useState<ReadonlySet<string>>(new Set());
  const latestRequest = useRef(0);

  const reload = useCallback(async (): Promise<void> => {
    // 通知が続けて届くと応答の順が入れ替わりうるため、最後に出した取得の結果だけを採る。
    latestRequest.current += 1;
    const request = latestRequest.current;
    try {
      const entries = await window.hanamask.listUnread();
      if (request === latestRequest.current) setUnreadKeys(toKeys(entries));
    } catch {
      // 印が出ないだけで操作は妨げないため、前回の状態を保つ。
    }
  }, []);

  useEffect(() => {
    const reloadInBackground = (): void => void reload();
    reloadInBackground();
    const unsubscribe = subscribeAll(reloadInBackground);
    return () => {
      // アンマウント後に届いた結果で状態を更新しないよう、以後の応答を古いものとして捨てる。
      latestRequest.current += 1;
      unsubscribe();
    };
  }, [reload]);

  const isUnread = useCallback(
    (entityType: EntityType, id: string): boolean =>
      unreadKeys.has(keyOf(entityType, id)),
    [unreadKeys],
  );

  const markAllViewed = useCallback(async (): Promise<void> => {
    await window.hanamask.markAllViewed();
    await reload();
  }, [reload]);

  return { isUnread, markAllViewed };
};
