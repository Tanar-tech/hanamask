import { useEffect, useId, useState, type JSX } from "react";
import mermaid from "mermaid";

interface MermaidDiagramProps {
  code: string;
}

const RENDER_FAILED_PREFIX = "図の描画に失敗しました";

const ALERT =
  "m-0 rounded-md border border-crit bg-paper-raised px-4 py-3 font-body text-sm text-crit";
// preflight を入れていないため figure の既定マージンを打ち消す。図は横に長くなりうるので枠内でスクロールさせる。
const FIGURE = "m-0 overflow-x-auto rounded-lg border border-line bg-paper-raised p-3";

// mermaidは自前の配色でSVGを描くため、地色に合わせて明暗を選ばないと図の文字が読めなくなる。
// jsdomはmatchMediaを実装しないので、判定できないときは明るい方に倒す。
const mermaidThemeOf = (view: Window): "dark" | "default" =>
  view.matchMedia?.("(prefers-color-scheme: dark)").matches === true ? "dark" : "default";

// mermaid.render は要素IDをDOM/CSSセレクタとして扱うため、useIdが含む ":" を除去する。
const toDiagramId = (rawId: string): string => `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

// mermaid.render は描画用の一時要素をdocument.body直下へ挿入し、成功時のみ自分で撤去する。
// 失敗時（構文エラー等）はエラーSVGを載せたまま例外を投げるため、React管理外の要素として残り続ける。
// 描画結果のSVGは #root 配下のfigureに入るので、body直下のものだけを対象にすれば巻き添えにしない。
const removeMermaidBodyLeftovers = (diagramId: string): void => {
  [diagramId, `d${diagramId}`, `i${diagramId}`].forEach((id) => {
    const element = document.getElementById(id);
    if (element?.parentElement === document.body) element.remove();
  });
};

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
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: mermaidThemeOf(window),
        });
        const { svg: rendered } = await mermaid.render(diagramId, code);
        if (!current) return;
        setSvg(rendered);
        setError(null);
      } catch (cause) {
        removeMermaidBodyLeftovers(diagramId);
        if (!current) return;
        setSvg(null);
        setError(`${RENDER_FAILED_PREFIX}: ${String(cause)}`);
      }
    };
    void draw();
    return () => {
      current = false;
      removeMermaidBodyLeftovers(diagramId);
    };
  }, [code, diagramId]);

  if (error !== null) {
    return (
      <p role="alert" className={ALERT}>
        {error}
      </p>
    );
  }
  if (svg === null) {
    return <figure aria-busy="true" className={`${FIGURE} h-24`} />;
  }
  // mermaidが生成したSVG文字列を描画する唯一の手段。securityLevel:"strict" でmermaid側がサニタイズする。
  return <figure className={FIGURE} dangerouslySetInnerHTML={{ __html: svg }} />;
};
