import { useEffect } from "react";
import type { EntityType } from "../../shared/preload-api";

export const useMarkViewed = (entityType: EntityType, id: string): void => {
  useEffect(() => {
    // 既読にできなくても画面は使えるため、失敗は印が残るだけにとどめる。
    window.hanamask.markViewed(entityType, id).catch(() => undefined);
  }, [entityType, id]);
};
