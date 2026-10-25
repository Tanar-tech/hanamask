import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import type { CommentAnchor, CommentEntityType, CommentThread } from "../../shared/preload-api";
import { useTextQuoteHighlight } from "../hooks/useTextQuoteHighlight";
import { CommentPanel } from "./CommentPanel";
import { SelectionCommentButton } from "./SelectionCommentButton";

interface ReviewableBodyProps {
  entityType: CommentEntityType;
  entityId: string;
  children: ReactNode;
}

// 引用は描画後の文字から作るので、比べる相手も Markdown の原文ではなく描画後の文字にする。
const useRenderedText = (ref: React.RefObject<HTMLElement | null>): string => {
  const [text, setText] = useState("");
  useEffect(() => {
    const next = ref.current?.textContent ?? "";
    if (next !== text) setText(next);
  });
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
  const bodyText = useRenderedText(bodyRef);
  useTextQuoteHighlight(bodyRef, activeThread?.anchor ?? null);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      {/* コメント欄やボタンの文字を本文として拾わないよう、本文だけを包む */}
      <div ref={bodyRef} className="min-w-0">
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
