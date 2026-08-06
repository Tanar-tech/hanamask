import { useEffect, useRef, useState } from "react";

/*
 * 変更通知のたびに一覧を丸ごと取り直す設計（docs/REQUIREMENTS.md §4.6「反映粒度は
 * 画面全体の再取得」）なので、素朴に入場アニメーションを付けると毎回すべての項目が
 * 動いてしまう。前回の描画に無かったidだけを「今回現れたもの」として返す。
 *
 * 覚えておくのは「前回並んでいたid」であり、これまでに見た全idではない。
 * そうしないと、削除して復元したノートが「現れた」と扱われなくなる。
 */
export const useNewlyArrived = (ids: readonly string[]): ReadonlySet<string> => {
  // idの配列は毎描画で作り直されるため、中身を表す文字列を比較の鍵にする。
  const key = ids.join(" ");
  // 初回の描画は対象にしない。開いた瞬間に一覧全体が動くと「いま増えた」の意味が薄れる。
  const previousKeyRef = useRef<string | null>(null);
  const [newlyArrived, setNewlyArrived] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const previousKey = previousKeyRef.current;
    previousKeyRef.current = key;
    if (previousKey === null) return;

    const before = new Set(previousKey === "" ? [] : previousKey.split(" "));
    setNewlyArrived(new Set(key === "" ? [] : key.split(" ").filter((id) => !before.has(id))));
  }, [key]);

  return newlyArrived;
};
