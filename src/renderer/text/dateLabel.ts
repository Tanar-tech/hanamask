const pad = (value: number): string => String(value).padStart(2, "0");

// 利用者のタイムゾーンでの日付にする。ISO文字列の先頭10文字だとUTC日付になり、日本では日をまたぐ。
export const toDateLabel = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};

export const toUpdatedLabel = (iso: string): string => {
  const date = toDateLabel(iso);
  return date === "" ? "" : `更新 ${date}`;
};
