import Link from "next/link";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "¥0",
    description: "個人での利用に。",
    features: ["メンバー1名まで", "グループ管理", "週/月カレンダー表示"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "要確認", // docs/REQUIREMENTS.md §7: 価格未確定
    description: "チーム・組織での利用に。",
    features: ["メンバー無制限", "工数エクスポート（予定）", "優先サポート"],
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-16 px-6 py-16">
      <section className="flex flex-col gap-4 text-center">
        <h1 className="flex items-center justify-center gap-2 text-4xl font-bold tracking-tight text-amber-900">
          <span aria-hidden>🍫</span>Chocotto
        </h1>
        <p className="text-lg text-gray-600">
          タスク管理のために、ちょこっとだけ時間をください。
          <br />
          タスクを始めるだけで、工数が自動で記録される。チームの時間管理を最小労力で。
        </p>
        <div className="mt-4 flex justify-center gap-4">
          <Link
            href="/sign-up"
            className="rounded-md bg-gray-900 px-6 py-3 text-white hover:bg-gray-700"
          >
            無料で始める
          </Link>
          <Link
            href="/sign-in"
            className="rounded-md border border-gray-300 px-6 py-3 hover:bg-gray-50"
          >
            ログイン
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div key={plan.id} className="rounded-lg border border-gray-200 p-6">
            <h2 className="text-xl font-semibold">{plan.name}</h2>
            <p className="mt-1 text-2xl font-bold">{plan.price}</p>
            <p className="mt-2 text-sm text-gray-600">{plan.description}</p>
            <ul className="mt-4 flex flex-col gap-2 text-sm text-gray-700">
              {plan.features.map((feature) => (
                <li key={feature}>・{feature}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
