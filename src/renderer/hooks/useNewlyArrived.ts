import { useState } from "react";

/*
 * 変更通知のたびに一覧を丸ごと取り直す設計（docs/REQUIREMENTS.md §4.6「反映粒度は
 * 画面全体の再取得」）なので、素朴に入場アニメーションを付けると毎回すべての項目が
 * 動いてしまう。前回の描画に無かったidだけを「今回現れたもの」として返す。
 *
 * 覚えておくのは「前回並んでいたid」であり、これまでに見た全idではない。
 * そうしないと、削除して復元したノートが「現れた」と扱われなくなる。
 *
 * 判定を effect ではなく描画中に行うのは、motion が `initial` を適用するのがマウントの
 * 瞬間だけだから。effect で1描画遅らせると項目は既に静止状態でDOMに入っており、
 * 入場アニメーションが一度も再生されない。
 */

const NOTHING: ReadonlySet<string> = new Set();

const idsOf = (key: string): Set<string> => new Set(key === "" ? [] : key.split(" "));

const arrivedBetween = (previousKey: string | null, key: string): ReadonlySet<string> => {
  // 初回の描画は対象にしない。開いた瞬間に一覧全体が動くと「いま増えた」の意味が薄れる。
  if (previousKey === null) return NOTHING;
  const before = idsOf(previousKey);
  return new Set([...idsOf(key)].filter((id) => !before.has(id)));
};

interface Seen {
  key: string | null;
  arrived: ReadonlySet<string>;
}

const FIRST_RENDER: Seen = { key: null, arrived: NOTHING };

export const useNewlyArrived = (ids: readonly string[]): ReadonlySet<string> => {
  // idの配列は毎描画で作り直されるため、中身を表す文字列を比較の鍵にする。
  const key = ids.join(" ");
  const [seen, setSeen] = useState<Seen>(FIRST_RENDER);

  if (seen.key === key) return seen.arrived;

  const arrived = arrivedBetween(seen.key, key);
  // 描画中の更新はコミット前に再描画されるので、項目は最初から入場の状態でマウントされる。
  setSeen({ key, arrived });
  return arrived;
};
