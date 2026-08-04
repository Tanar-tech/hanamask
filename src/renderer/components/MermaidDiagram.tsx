import { useEffect, useId, useState, type JSX } from "react";
import mermaid from "mermaid";

interface MermaidDiagramProps {
  code: string;
}

const RENDER_FAILED_PREFIX = "図の描画に失敗しました";

// mermaid.render は要素IDをDOM/CSSセレクタとして扱うため、useIdが含む ":" を除去する。
const toDiagramId = (rawId: string): string => `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

export const MermaidDiagram = ({ code }: MermaidDiagramProps): JSX.Element => {
  const diagramId = toDiagramId(useId());
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // code切替時に古い描画結果が後から届いて上書きするのを防ぐ。
    let current = true;
    const draw = async (): Promise<void> => {
      if (code.trim() === "") {
        setSvg(null);
        setError(null);
        return;
      }
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
        const { svg: rendered } = await mermaid.render(diagramId, code);
        if (!current) return;
        setSvg(rendered);
        setError(null);
      } catch (cause) {
        if (!current) return;
        setSvg(null);
        setError(`${RENDER_FAILED_PREFIX}: ${String(cause)}`);
      }
    };
    void draw();
    return () => {
      current = false;
    };
  }, [code, diagramId]);

  if (error !== null) {
    return <p role="alert">{error}</p>;
  }
  if (svg === null) {
    return <figure aria-busy="true" />;
  }
  // mermaidが生成したSVG文字列を描画する唯一の手段。securityLevel:"strict" でmermaid側がサニタイズする。
  return <figure dangerouslySetInnerHTML={{ __html: svg }} />;
};
