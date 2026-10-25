import { useEffect, useState } from "react";
import type { UpdateStatus } from "../../shared/preload-api";

export const useUpdateStatus = (): [UpdateStatus | null, (status: UpdateStatus) => void] => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    const unsubscribe = window.hanamask.onUpdateStatusChanged(setStatus);
    void window.hanamask.readUpdateStatus().then(setStatus, () => undefined);
    return unsubscribe;
  }, []);

  return [status, setStatus];
};
