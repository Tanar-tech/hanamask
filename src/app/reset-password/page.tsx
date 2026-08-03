"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const MIN_PASSWORD_LENGTH = 8;

// パスワード再設定画面（docs/REQUIREMENTS.md §4.6、要求事項#4）。
// メール内のリンク（?token=...）からアクセスされ、新しいパスワードを設定する。
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください。`);
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません。");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "パスワードの再設定に失敗しました。");
      return;
    }
    setDone(true);
  }

  if (!token) {
    return (
      <p className="text-sm text-red-600">
        リンクが無効です。パスワード再設定をもう一度お試しください。
      </p>
    );
  }

  if (done) {
    return (
      <>
        <p className="text-sm text-gray-700">パスワードを再設定しました。ログインしてください。</p>
        <Link href="/sign-in" className="text-sm text-gray-600 underline hover:text-gray-900">
          ログイン画面へ
        </Link>
      </>
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <input
        type="password"
        placeholder="新しいパスワード"
        required
        className="rounded border border-gray-300 px-3 py-2"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        type="password"
        placeholder="新しいパスワード（確認）"
        required
        className="rounded border border-gray-300 px-3 py-2"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "再設定中..." : "パスワードを再設定"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-bold">パスワード再設定</h1>
      <Suspense fallback={<p className="text-sm text-gray-500">読み込み中...</p>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
