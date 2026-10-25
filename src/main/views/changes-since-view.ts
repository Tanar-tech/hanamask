export interface VersionContent {
  createdAt: string;
  title: string;
  body: string;
}

export interface ContentAtView {
  title: string;
  body: string;
}

const earlierOf = (a: VersionContent, b: VersionContent): VersionContent =>
  b.createdAt < a.createdAt ? b : a;

/*
 * 版は更新の直前に撮られるので、見た時刻より後に撮られた最初の版が「見た時点の内容」を持つ。
 * それより前の版は見る前の内容で、後の版は見たあとの途中経過。
 */
export const pickContentAtView = (
  versions: readonly VersionContent[],
  viewedAt: string,
): ContentAtView | null => {
  const afterView = versions.filter((version) => version.createdAt > viewedAt);
  if (afterView.length === 0) return null;
  const { title, body } = afterView.reduce(earlierOf);
  return { title, body };
};
