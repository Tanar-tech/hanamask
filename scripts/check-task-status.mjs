/*
 * docs/TASKS.md のステータスが実態から取り残されるのを見つける。
 *
 * 完了したのに「実装中」のまま残る漏れを、今日だけで3回起こしている（T22・T34/T35・T36）。
 * ステータス欄は他のドキュメントやPRから参照されるので、ずれると「まだ終わっていない」
 * と読まれる。
 *
 * 判定できるのは形式だけ。**完了したかどうかは機械には分からない**ので、
 * 「実装中」のタスクが増えすぎていないかを見て、棚卸しを促すに留める。
 */

import { readFileSync } from "node:fs";

const STATUS_LINE = /^### (T\d+): (.+)\n\n- ステータス: (.+)$/gm;

// 同時に進行しているタスクがこれを超えたら、たいてい更新漏れが混ざっている。
const MAX_IN_PROGRESS = 3;

const taskDocument = readFileSync("docs/TASKS.md", "utf8");

const tasks = [...taskDocument.matchAll(STATUS_LINE)].map(([, id, title, status]) => ({
  id,
  title,
  status,
}));

/*
 * 見出しの数と突き合わせる。件数の下限だけでは、書式が一部だけ変わったときに
 * 取りこぼしたぶんが黙って消える（45件中24件が読めなくなっても下限20件は上回る）。
 */
const headings = [...taskDocument.matchAll(/^### (T\d+): /gm)];

if (headings.length !== tasks.length) {
  const unreadable = headings
    .map(([, id]) => id)
    .filter((id) => !tasks.some((task) => task.id === id));
  console.error(
    `見出しは ${headings.length} 件ありますが、ステータスを読めたのは ${tasks.length} 件です。`,
  );
  console.error(`読めなかったタスク: ${unreadable.join(", ")}`);
  console.error("\n見出しの直後に空行を挟んで「- ステータス: 」を置く形になっているか確かめてください。");
  process.exit(1);
}

/*
 * IDの重複を検出する。2026-08-19、別セッションが並行してタスクを起票し、同じ T48 が
 * 「ローカルLLM(1)」と「ブランチ保護と自動マージ」の 2つを指す状態になりかけた。
 * 件数の突き合わせでは両方カウントされるだけで気付けない。
 */
const duplicated = [...new Set(tasks.map((task) => task.id))].filter(
  (id) => tasks.filter((task) => task.id === id).length > 1,
);

if (duplicated.length > 0) {
  console.error(`同じタスクIDが複数あります: ${duplicated.join(", ")}`);
  console.error("\n別々の作業が同じIDを採番した可能性があります。採番前に main の最新を確認してください。");
  process.exit(1);
}

// 見出しごと消えた場合は上の突き合わせでは気付けないので、下限も見る。
const MINIMUM_EXPECTED_TASKS = 20;
if (tasks.length < MINIMUM_EXPECTED_TASKS) {
  console.error(
    `タスクを ${tasks.length} 件しか見つけられていません。抽出の仕方が実態と合っているか確かめてください。`,
  );
  process.exit(1);
}

const inProgress = tasks.filter((task) => task.status.startsWith("実装中"));

if (inProgress.length > MAX_IN_PROGRESS) {
  console.error(`「実装中」のタスクが ${inProgress.length} 件あります（上限 ${MAX_IN_PROGRESS}）。`);
  inProgress.forEach((task) => {
    console.error(`  ${task.id}: ${task.title}`);
  });
  console.error("\n終わっているものが混ざっていないか確かめ、ステータスを更新してください。");
  process.exit(1);
}

console.log(
  `docs/TASKS.md: ${tasks.length}件（実装中 ${inProgress.length}件 / 上限 ${MAX_IN_PROGRESS}）。`,
);
