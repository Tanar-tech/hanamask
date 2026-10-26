import { useLayoutEffect, useRef, useState, type JSX, type ReactNode, type RefObject } from "react";
import type { CommentAnchor, CommentEntityType, CommentThread } from "../../shared/preload-api";
import { useTextQuoteHighlight } from "../hooks/useTextQuoteHighlight";
import { CommentPanel } from "./CommentPanel";
import { SelectionCommentButton } from "./SelectionCommentButton";

// 差分パネルにも同じ文が出るため、本文を指したいときはこの名前で絞る（E2E もこれを使う）。
export const BODY_REGION_LABEL = "本文の表示";

interface ReviewableBodyProps {
  entityType: CommentEntityType;
  entityId: string;
  children: ReactNode;
}

// 引用は描画後の文字から作るので、比べる相手も Markdown の原文ではなく描画後の文字にする。
// 描画の前に読むので、読めるまでの null が画面に出ることはない（「元の箇所が変わりました」のちらつきを防ぐ）。
const useRenderedText = (ref: RefObject<HTMLElement | null>, content: ReactNode): string | null => {
  const [text, setText] = useState<string | null>(null);
  useLayoutEffect(() => {
    setText(ref.current?.textContent ?? "");
  }, [ref, content]);
  return text;
};

export const ReviewableBody = ({
  entityType,
  entityId,
  children,
}: ReviewableBodyProps): JSX.Element => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pendingAnchor, setPendingAnchor] = useState<CommentAnchor | null>(null);
  const [activeThread, setActiveThread] = useState<CommentThread | null>(null);
  const bodyText = useRenderedText(bodyRef, children);
  useTextQuoteHighlight(bodyRef, activeThread?.anchor ?? null);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      {/* コメント欄やボタンの文字を本文として拾わないよう、本文だけを包む */}
      <div ref={bodyRef} role="region" aria-label={BODY_REGION_LABEL} className="min-w-0">
        {children}
      </div>
      <CommentPanel
        entityType={entityType}
        entityId={entityId}
        bodyText={bodyText}
        pendingAnchor={pendingAnchor}
        onClearPending={() => {
          setPendingAnchor(null);
        }}
        activeThreadId={activeThread?.id ?? null}
        onSelectThread={setActiveThread}
      />
      <SelectionCommentButton containerRef={bodyRef} onRequestComment={setPendingAnchor} />
    </div>
  );
};
