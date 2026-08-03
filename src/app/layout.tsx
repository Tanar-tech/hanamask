import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chocotto",
  description: "タスク管理のために、ちょこっとだけ時間をください。タスク管理と工数管理を一体化したWebアプリケーション。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
