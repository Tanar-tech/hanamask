import { useCallback, useEffect, useId, useState, type JSX } from "react";
import type {
  ChatEntry,
  ChatPresence,
  EntityType,
} from "../../shared/preload-api";
import { MarkdownBody } from "./MarkdownBody";
import { SECTION, SECTION_HEADING, SECTION_LIST, SECTION_NOTE_MESSAGE } from "./SemanticSection";

interface ChatSectionProps {
  entityType: EntityType;
  entityId: string;
}

const HEADING = "チャット";
const LIST_LABEL = "チャット履歴";
const EMPTY_MESSAGE = "まだメッセージはありません";
const INPUT_LABEL = "メッセージ";
const INPUT_PLACEHOLDER = "メッセージを入力（Ctrl+Enter で送信）";
const SEND_LABEL = "送信";
const USER_LABEL = "あなた";
const AGENT_LABEL = "エージェント";
const UNDELIVERED_LABEL = "未配信";
const PRESENT_MESSAGE = "エージェントが待機中";
const ABSENT_MESSAGE = "接続中のエージェントがいません";
const ABSENT_NOTICE =
  "接続中のエージェントがいません。メッセージは保存され、次に待ち受けたときに届きます。";
const LOAD_ERROR_PREFIX = "チャットの読み込みに失敗しました: ";
const POST_ERROR_PREFIX = "メッセージの送信に失敗しました: ";

/* preflight を入れていないため、ブラウザ既定のマージン・フォーム外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const SEND_BUTTON = `${FOCUS_RING} m-0 shrink-0 cursor-pointer appearance-none self-end rounded-md border border-solid border-ink-aqua bg-transparent px-3 py-1.5 font-body text-sm text-ink-aqua-text transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-ink-aqua/10 disabled:cursor-not-allowed disabled:border-line disabled:text-text-faint`;
const DRAFT_FIELD = `${FOCUS_RING} m-0 min-h-16 w-full flex-1 resize-y rounded-md border border-solid border-line bg-paper-raised px-3 py-2 font-body text-sm text-text`;
const SENDER_LABEL = "font-mono text-[0.625rem] tracking-[0.1em] uppercase";
const TIME_LABEL = "font-mono text-[0.625rem] tabular-nums text-text-faint";
const UNDELIVERED_PILL =
  "rounded-full border border-solid border-warn px-2 py-0.5 font-body text-[0.625rem] text-warn";

// 発言者の色分けは既存画面の「利用者の操作＝水色 / エージェントの操作＝桃色」に合わせる。
const senderBarClass = (sender: ChatEntry["sender"]): string =>
  sender === "user" ? "border-l-ink-aqua" : "border-l-ink-pink";
const senderTextClass = (sender: ChatEntry["sender"]): string =>
  sender === "user" ? "text-ink-aqua-text" : "text-ink-pink";
const senderName = (sender: ChatEntry["sender"]): string =>
  sender === "user" ? USER_LABEL : AGENT_LABEL;

const HOUR_MINUTE_LENGTH = 5;

const formatTime = (createdAt: string): string => {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return "";
  return at.toTimeString().slice(0, HOUR_MINUTE_LENGTH);
};

export const ChatSection = ({ entityType, entityId }: ChatSectionProps): JSX.Element => {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [presence, setPresence] = useState<ChatPresence>({ waitingAgents: 0 });
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const draftFieldId = useId();

  const reload = useCallback(async (): Promise<void> => {
    setEntries(await window.hanamask.listChatEntries(entityType, entityId));
  }, [entityType, entityId]);

  useEffect(() => {
    // 対象切替時に古い取得結果が後から届いて上書きするのを防ぐ。
    let current = true;
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.listChatEntries(entityType, entityId);
        if (!current) return;
        setEntries(loaded);
        setError(null);
      } catch (cause) {
        if (current) setError(`${LOAD_ERROR_PREFIX}${String(cause)}`);
      }
    };
    void load();
    const unsubscribeEntries = window.hanamask.onChatEntriesChanged((change) => {
      // 会話は対象ごとに分かれているので、自分の対象の変更だけを取り直す。
      if (change.entityType !== entityType || change.entityId !== entityId) return;
      void load();
    });
    return () => {
      current = false;
      unsubscribeEntries();
    };
  }, [entityType, entityId]);

  useEffect(() => {
    let current = true;
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.getChatPresence();
        if (current) setPresence(loaded);
      } catch {
        // 在席表示は補助的なので、取れなければ不在のまま見せる。
      }
    };
    void load();
    const unsubscribePresence = window.hanamask.onChatPresenceChanged((next) => {
      setPresence(next);
    });
    return () => {
      current = false;
      unsubscribePresence();
    };
  }, []);

  const send = async (): Promise<void> => {
    const body = draft.trim();
    if (body === "") return;
    try {
      setError(null);
      await window.hanamask.postChatEntry(entityType, entityId, body);
      setDraft("");
      // chat:entries-changed はMCP経由の操作だけが出すため、UI操作の後は自分で取り直す。
      await reload();
    } catch (cause) {
      setError(`${POST_ERROR_PREFIX}${String(cause)}`);
    }
  };

  const waiting = presence.waitingAgents > 0;

  return (
    <section aria-label={HEADING} className={SECTION}>
      <h3 className={SECTION_HEADING}>{HEADING}</h3>
      <p
        className={`m-0 font-body text-xs ${waiting ? "text-ink-aqua-text" : "text-text-faint"}`}
      >
        {waiting ? PRESENT_MESSAGE : ABSENT_MESSAGE}
      </p>
      {!waiting && <p className={SECTION_NOTE_MESSAGE}>{ABSENT_NOTICE}</p>}
      {error !== null && (
        <p
          role="alert"
          className="m-0 rounded-md border border-solid border-crit bg-paper-raised px-4 py-3 text-sm text-crit"
        >
          {error}
        </p>
      )}
      {entries.length === 0 ? (
        <p className={SECTION_NOTE_MESSAGE}>{EMPTY_MESSAGE}</p>
      ) : (
        <ul aria-label={LIST_LABEL} className={SECTION_LIST}>
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`flex flex-col gap-1 border-0 border-l-[3px] border-solid bg-paper-raised py-2 pr-4 pl-3 ${senderBarClass(entry.sender)}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${SENDER_LABEL} ${senderTextClass(entry.sender)}`}>
                  {senderName(entry.sender)}
                </span>
                <span className={TIME_LABEL}>{formatTime(entry.createdAt)}</span>
                {entry.sender === "user" && entry.deliveredAt === null && (
                  <span className={UNDELIVERED_PILL}>{UNDELIVERED_LABEL}</span>
                )}
              </div>
              {entry.sender === "agent" ? (
                <MarkdownBody content={entry.body} />
              ) : (
                <p className="m-0 font-body text-sm leading-relaxed whitespace-pre-wrap text-text">
                  {entry.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-stretch gap-2">
        <label htmlFor={draftFieldId} className="sr-only">
          {INPUT_LABEL}
        </label>
        <textarea
          id={draftFieldId}
          aria-label={INPUT_LABEL}
          placeholder={INPUT_PLACEHOLDER}
          value={draft}
          rows={2}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !event.ctrlKey) return;
            event.preventDefault();
            void send();
          }}
          className={DRAFT_FIELD}
        />
        <button
          type="button"
          disabled={draft.trim() === ""}
          onClick={() => {
            void send();
          }}
          className={SEND_BUTTON}
        >
          {SEND_LABEL}
        </button>
      </div>
    </section>
  );
};
