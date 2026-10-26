import { useEffect } from "react";
import type { EntityType } from "../../shared/preload-api";

// version には記録の更新日時を渡す。開いている間にエージェントが更新しても、見えているので既読に戻す。
export const useMarkViewed = (entityType: EntityType, id: string, version?: string): void => {
  useEffect(() => {
    // 既読にできなくても画面は使えるため、失敗は印が残るだけにとどめる。
    window.hanamask.markViewed(entityType, id).catch(() => undefined);
  }, [entityType, id, version]);
};
