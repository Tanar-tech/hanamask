import type { UpdateState } from "../../shared/preload-api.js";

// 失敗の原因（オフライン・GitHub側の障害など）は利用者に打てる手が無いので一律の文言にし、詳細はログに回す。
export const UPDATE_ERROR_MESSAGE = "更新を確認できませんでした";

export type UpdaterEvent =
  | { type: "checking-for-update" }
  | { type: "update-available"; version: string }
  | { type: "update-not-available" }
  | { type: "download-progress"; percent: number }
  | { type: "update-downloaded"; version: string }
  | { type: "error" };

export const initialUpdateState = (isSupported: boolean): UpdateState =>
  isSupported ? { kind: "idle", lastCheckedAt: null } : { kind: "unsupported" };

const withProgress = (current: UpdateState, percent: number): UpdateState =>
  current.kind === "downloading"
    ? {
        kind: "downloading",
        version: current.version,
        percent: Math.floor(percent),
      }
    : current;

const applyEvent = (
  current: UpdateState,
  event: UpdaterEvent,
  nowIso: string,
): UpdateState => {
  switch (event.type) {
    case "checking-for-update":
      return { kind: "checking" };
    case "update-available":
      return { kind: "downloading", version: event.version, percent: 0 };
    case "update-not-available":
      return { kind: "idle", lastCheckedAt: nowIso };
    case "download-progress":
      return withProgress(current, event.percent);
    case "update-downloaded":
      return { kind: "downloaded", version: event.version };
    case "error":
      return { kind: "error", message: UPDATE_ERROR_MESSAGE };
  }
};

// 準備済みのインストーラーは終了時に必ず適用されるので、後から来たイベントで「準備ができました」を消さない。
export const nextUpdateState = (
  current: UpdateState,
  event: UpdaterEvent,
  nowIso: string,
): UpdateState => {
  if (current.kind === "unsupported" || current.kind === "downloaded")
    return current;
  return applyEvent(current, event, nowIso);
};
