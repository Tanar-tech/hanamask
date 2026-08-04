import { useCallback, useEffect, useState, type JSX } from "react";
import type { EntityType, Link } from "../../shared/preload-api";

interface EntityLinksProps {
  entityType: EntityType;
  entityId: string;
}

interface LinkEndpoint {
  type: EntityType;
  id: string;
}

const HEADING = "リンク";
const EMPTY_MESSAGE = "リンクはありません";
const CREATE_LABEL = "リンクする";
const UNLINK_LABEL = "解除";
const UNLINK_CONFIRM_MESSAGE = "このリンクを解除しますか？";
const LINK_MISSING_MESSAGE = "対象のリンクが見つかりません";
const TARGET_TYPE_LABEL = "リンク先の種別";
const TARGET_ID_LABEL = "リンク先のID";
const TYPE_LABELS: Record<EntityType, string> = { note: "ノート", task: "タスク" };
const ENTITY_TYPES: readonly EntityType[] = ["note", "task"];
const DEFAULT_TARGET_TYPE: EntityType = "note";

const toEntityType = (value: string): EntityType | null =>
  ENTITY_TYPES.find((type) => type === value) ?? null;

// リンクは無向に扱うため、一覧では自分ではない側の端点だけを見せる。
const toCounterpart = (link: Link, self: LinkEndpoint): LinkEndpoint =>
  link.fromType === self.type && link.fromId === self.id
    ? { type: link.toType, id: link.toId }
    : { type: link.fromType, id: link.fromId };

const describeEndpoint = (endpoint: LinkEndpoint): string =>
  `${TYPE_LABELS[endpoint.type]}: ${endpoint.id}`;

interface LinkCreateFormProps {
  targetType: EntityType;
  targetId: string;
  onTargetTypeChange: (type: EntityType) => void;
  onTargetIdChange: (id: string) => void;
  onSubmit: () => void;
}

const LinkCreateForm = ({
  targetType,
  targetId,
  onTargetTypeChange,
  onTargetIdChange,
  onSubmit,
}: LinkCreateFormProps): JSX.Element => (
  <div>
    <select
      aria-label={TARGET_TYPE_LABEL}
      value={targetType}
      onChange={(event) => {
        const type = toEntityType(event.target.value);
        if (type !== null) onTargetTypeChange(type);
      }}
    >
      {ENTITY_TYPES.map((type) => (
        <option key={type} value={type}>
          {TYPE_LABELS[type]}
        </option>
      ))}
    </select>
    <input
      aria-label={TARGET_ID_LABEL}
      value={targetId}
      onChange={(event) => {
        onTargetIdChange(event.target.value);
      }}
    />
    <button type="button" onClick={onSubmit}>
      {CREATE_LABEL}
    </button>
  </div>
);

export const EntityLinks = ({ entityType, entityId }: EntityLinksProps): JSX.Element => {
  const [links, setLinks] = useState<Link[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<EntityType>(DEFAULT_TARGET_TYPE);
  const [targetId, setTargetId] = useState("");

  const reload = useCallback(async (): Promise<void> => {
    setLinks(await window.hanamask.listLinks(entityType, entityId));
  }, [entityType, entityId]);

  useEffect(() => {
    // 対象切替時に古い取得結果が後から届いて上書きするのを防ぐ。
    let current = true;
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.listLinks(entityType, entityId);
        if (!current) return;
        setLinks(loaded);
        setError(null);
      } catch (cause) {
        if (current) setError(`リンクの読み込みに失敗しました: ${String(cause)}`);
      }
    };
    void load();
    const unsubscribe = window.hanamask.onLinksChanged(() => {
      void load();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [entityType, entityId]);

  const create = async (): Promise<void> => {
    const toId = targetId.trim();
    if (toId === "") return;
    try {
      setError(null);
      await window.hanamask.createLink({
        fromType: entityType,
        fromId: entityId,
        toType: targetType,
        toId,
      });
      setTargetId("");
      // links:changed はMCPツール経由の操作だけが出すため、UI操作の後は自分で取り直す。
      await reload();
    } catch (cause) {
      setError(`リンクの作成に失敗しました: ${String(cause)}`);
    }
  };

  const unlink = async (id: string): Promise<void> => {
    if (!window.confirm(UNLINK_CONFIRM_MESSAGE)) return;
    try {
      setError(null);
      if (!(await window.hanamask.deleteLink(id))) {
        setError(LINK_MISSING_MESSAGE);
        return;
      }
      await reload();
    } catch (cause) {
      setError(`リンクの解除に失敗しました: ${String(cause)}`);
    }
  };

  return (
    <section>
      <h3>{HEADING}</h3>
      {error !== null && <p role="alert">{error}</p>}
      {links.length === 0 && <p>{EMPTY_MESSAGE}</p>}
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            <span>{describeEndpoint(toCounterpart(link, { type: entityType, id: entityId }))}</span>
            <button
              type="button"
              onClick={() => {
                void unlink(link.id);
              }}
            >
              {UNLINK_LABEL}
            </button>
          </li>
        ))}
      </ul>
      <LinkCreateForm
        targetType={targetType}
        targetId={targetId}
        onTargetTypeChange={setTargetType}
        onTargetIdChange={setTargetId}
        onSubmit={() => {
          void create();
        }}
      />
    </section>
  );
};
