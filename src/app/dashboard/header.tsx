"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// アプリヘッダー（/goal指示）。アプリ名「Chocotto」＝タスク管理のためにちょこっとだけ時間を、
// というゆるめのブランディング。右部はハンバーガーメニューでログアウトを含む。
export function Header() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/sign-in");
  }

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-amber-100 bg-white px-4 py-3 sm:px-6">
      <Link href="/dashboard" className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>
          🍫
        </span>
        <div className="leading-tight">
          <p className="text-lg font-bold tracking-tight text-amber-900">Chocotto</p>
          <p className="hidden text-xs text-gray-500 sm:block">
            タスク管理のために、ちょこっとだけ時間をください。
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            aria-label="メニュー"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-md p-2 text-gray-700 hover:bg-amber-50"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {menuOpen && (
            <>
              {/* メニュー外クリックで閉じるための透明オーバーレイ */}
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {loggingOut ? "ログアウト中..." : "ログアウト"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
