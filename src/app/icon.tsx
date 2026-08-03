// Next.js App Routerの動的favicon（既定/待機中カラー）。
// docs/REQUIREMENTS.md §4.1、SPEC.md Set A（機能1）に対応。
// 実行中/休憩中への実行時の切替は、静的生成では対応できないため
// src/lib/use-document-title.ts のDOM操作（link[rel="icon"]の書き換え）で行う。
import { ImageResponse } from "next/og";

// 静的エクスポート（output: export）ではプリレンダー方式の明示が必須（docs/AWS.md）。
export const dynamic = "force-static";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          background: "#9ca3af",
        }}
      />
    ),
    { ...size },
  );
}
