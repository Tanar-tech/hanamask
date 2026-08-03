"use client";

import { useState } from "react";
import Link from "next/link";

// パスワード再設定メールの送信要求画面（docs/REQUIREMENTS.md §4.6、要求事項#4）。
// メールアドレスの実在有無を外部から判別できないよう、成功時は常に同じメッセージを表示する。
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError("送信に失敗しました。時間をおいて再度お試しください。");
      return;
    }
    setDone(true);
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-bold">パスワード再設定</h1>
      {done ? (
        <p className="text-sm text-gray-700">
          ご入力のメールアドレスが登録されている場合、パスワード再設定用のメールを送信しました。
          メール内のリンクから再設定してください。
        </p>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <p className="text-sm text-gray-600">登録済みのメールアドレスを入力してください。</p>
          <input
            type="email"
            placeholder="メールアドレス"
            required
            className="rounded border border-gray-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {submitting ? "送信中..." : "再設定メールを送信"}
          </button>
        </form>
      )}
      <Link href="/sign-in" className="text-sm text-gray-600 underline hover:text-gray-900">
        ログイン画面に戻る
      </Link>
    </main>
  );
}
