// メール送信の抽象化（パスワードリセット用、docs/REQUIREMENTS.md §4.6）。
// 現時点ではSES等のメール配信基盤が未構築のため、実送信は行わずログ出力に留める
// （インフラ変更を伴うため、実際のメール配信有効化はdocs/GOVERNANCE.md §6により管理者判断）。
// 将来SESを構築した際は、この関数の中身だけを差し替えれば呼び出し側（auth.ts）は変更不要。

export interface PasswordResetEmail {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({ to, resetUrl }: PasswordResetEmail): Promise<void> {
  // TODO(docs/REQUIREMENTS.md §4.6): SES等の実メール配信に差し替える。
  console.log(`[mailer] パスワードリセットメール(未接続のため送信されません) to=${to} url=${resetUrl}`);
}
