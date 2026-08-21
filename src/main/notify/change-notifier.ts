import type { NavigateTarget } from "../../shared/preload-api.js";
import type { EntityChange } from "../mcp/change-emitter.js";

// エージェントは1つの依頼で何度もツールを呼ぶため、その一連の書き込みが1通に収まる幅にする。
// 長くすると気づくのが遅れ、短くすると1回の作業が複数通に割れる。
export const CHANGE_NOTIFICATION_WINDOW_MS = 2000;

const MAX_LISTED_TITLES = 3;

const ENTITY_LABELS: Record<EntityChange["entity"], string> = {
  note: "ページ",
  task: "タスク",
  notebook: "ノート",
};

const ACTION_LABELS: Record<EntityChange["action"], string> = {
  created: "作成",
  updated: "更新",
  deleted: "削除",
};

export interface ChangeNotification {
  title: string;
  body: string;
  onClick: () => void;
}

export interface ChangeNotifierDeps {
  isWindowFocused: () => boolean;
  showNotification: (notification: ChangeNotification) => void;
  showWindow: () => void;
  navigate: (target: NavigateTarget) => void;
}

export interface ChangeNotifier {
  recordChange: (change: EntityChange) => void;
}

// 同じノートを続けて直しただけで「5件の変更」と出ると、実際より大ごとに見える。
const keepLatestPerEntity = (
  changes: readonly EntityChange[],
): EntityChange[] => {
  const byKey = new Map<string, EntityChange>();
  changes.forEach((change) => {
    byKey.set(`${change.entity}:${change.id}`, change);
  });
  return [...byKey.values()];
};

const buildTitle = (changes: readonly EntityChange[]): string => {
  const [only] = changes;
  if (changes.length === 1 && only !== undefined) {
    return `${ENTITY_LABELS[only.entity]}を${ACTION_LABELS[only.action]}しました`;
  }
  return `${changes.length}件の変更`;
};

// 載せるのはタイトルまで。本文を出すと通知を肩越しに読まれるだけで中身が漏れる。
const buildBody = (changes: readonly EntityChange[]): string => {
  const listed = changes
    .slice(0, MAX_LISTED_TITLES)
    .map((change) => change.title);
  const omitted = changes.length - listed.length;
  return omitted > 0
    ? `${listed.join("、")} ほか${omitted}件`
    : listed.join("、");
};

const toNavigateTarget = (change: EntityChange): NavigateTarget | undefined => {
  // 削除されたものは開けない。
  if (change.action === "deleted") return undefined;
  return { kind: change.entity, id: change.id };
};

export const createChangeNotifier = (
  deps: ChangeNotifierDeps,
): ChangeNotifier => {
  let pending: EntityChange[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const openChanges = (changes: readonly EntityChange[]): void => {
    const [only] = changes;
    const target = only === undefined ? undefined : toNavigateTarget(only);
    // 開き先が無いものは、まとめて通知したときと同じくウィンドウを出すだけにする。
    if (changes.length !== 1 || target === undefined) {
      deps.showWindow();
      return;
    }
    deps.navigate(target);
  };

  const flush = (): void => {
    flushTimer = undefined;
    const changes = keepLatestPerEntity(pending);
    pending = [];
    // 集約している間に利用者が画面へ戻ったなら、変更はもう画面上で見えている。
    if (changes.length === 0 || deps.isWindowFocused()) return;
    deps.showNotification({
      title: buildTitle(changes),
      body: buildBody(changes),
      onClick: () => {
        openChanges(changes);
      },
    });
  };

  // UI上で編集するにはウィンドウにフォーカスが要るため、フォーカス中の変更は利用者自身の操作
  // とみなして通知しない（変更の経路はエージェント由来と共通で、区別する情報がここには無い）。
  const recordChange = (change: EntityChange): void => {
    if (deps.isWindowFocused()) return;
    pending.push(change);
    flushTimer ??= setTimeout(flush, CHANGE_NOTIFICATION_WINDOW_MS);
  };

  return { recordChange };
};
