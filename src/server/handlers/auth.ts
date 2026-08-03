import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { json, parseJsonBody, type ApiRequest, type ApiResponse } from "../http";
import { getSessionUser, SESSION_COOKIE } from "../context";
import { SESSION_TTL_SECONDS, signSessionToken } from "../token";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/mailer";

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1時間

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Origin/Hostヘッダーから、リセットリンク生成用のアプリのオリジンを推定する。 */
function resolveAppOrigin(req: ApiRequest): string {
  const origin = req.headers["origin"];
  if (origin) {
    return origin;
  }
  const host = req.headers["host"] ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}

function sessionCookie(token: string, maxAgeSeconds: number): string {
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  // 本番（CloudFront経由のHTTPS）ではSecureを付与する。ローカル開発はhttpのため付けない。
  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

// POST /api/auth/register: サインアップ時にUser+Organization(個人用)+Membership(admin)を作成する。
// docs/REQUIREMENTS.md §3-1, §4.6, §4.7。
export async function register(req: ApiRequest): Promise<ApiResponse> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return json(400, { error: "リクエストボディが不正なJSONです。" });
  }
  const body = parsed.value as { email?: string; password?: string; name?: string };

  if (!body.email || !body.password) {
    return json(400, { error: "email, password は必須です。" });
  }
  if (body.password.length < MIN_PASSWORD_LENGTH) {
    return json(400, { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください。` });
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return json(409, { error: "既に登録済みのメールアドレスです。" });
  }

  const organizationName = body.name ? `${body.name}の組織` : "個人の組織";
  const passwordHash = await bcrypt.hash(body.password, BCRYPT_SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: body.email,
      name: body.name,
      passwordHash,
      memberships: {
        create: {
          role: "admin",
          organization: { create: { name: organizationName } },
        },
      },
    },
  });

  return json(201, { id: user.id, email: user.email });
}

// POST /api/auth/login: メール+パスワードを検証し、セッションCookie（HS256トークン）を発行する。
// 旧NextAuth Credentialsプロバイダ（lib/auth.ts）相当。docs/REQUIREMENTS.md §4.6。
export async function login(req: ApiRequest): Promise<ApiResponse> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return json(400, { error: "リクエストボディが不正なJSONです。" });
  }
  const body = parsed.value as { email?: string; password?: string };
  if (!body.email || !body.password) {
    return json(400, { error: "email, password は必須です。" });
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user?.passwordHash) {
    return json(401, { error: "メールアドレスまたはパスワードが正しくありません。" });
  }
  const passwordMatches = await bcrypt.compare(body.password, user.passwordHash);
  if (!passwordMatches) {
    return json(401, { error: "メールアドレスまたはパスワードが正しくありません。" });
  }

  const token = signSessionToken({ id: user.id, email: user.email, name: user.name });
  return json(
    200,
    { user: { id: user.id, email: user.email, name: user.name } },
    { setCookies: [sessionCookie(token, SESSION_TTL_SECONDS)] },
  );
}

// POST /api/auth/logout: セッションCookieを破棄する。
export async function logout(_req: ApiRequest): Promise<ApiResponse> {
  return json(200, { ok: true }, { setCookies: [sessionCookie("", 0)] });
}

// GET /api/auth/session: ログイン中ユーザーを返す（静的化したフロントの認証ガード用）。
export async function session(req: ApiRequest): Promise<ApiResponse> {
  const user = getSessionUser(req);
  if (!user) {
    return json(401, { error: "unauthorized" });
  }
  return json(200, { user });
}

// POST /api/auth/request-password-reset: リセットメール送信要求（docs/REQUIREMENTS.md §4.6、要求事項#4）。
// メールアドレスの実在有無を外部から判別できないよう、ユーザーが存在してもしなくても常に200を返す。
export async function requestPasswordReset(req: ApiRequest): Promise<ApiResponse> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return json(400, { error: "リクエストボディが不正なJSONです。" });
  }
  const body = parsed.value as { email?: string };
  if (!body.email) {
    return json(400, { error: "email は必須です。" });
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (user) {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = `${resolveAppOrigin(req)}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail({ to: user.email, resetUrl });
  }

  return json(200, {
    ok: true,
    message: "ご入力のメールアドレスが登録されている場合、パスワード再設定用のメールを送信しました。",
  });
}

// POST /api/auth/reset-password: トークンを検証しパスワードを再設定する（docs/REQUIREMENTS.md §4.6）。
export async function resetPassword(req: ApiRequest): Promise<ApiResponse> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return json(400, { error: "リクエストボディが不正なJSONです。" });
  }
  const body = parsed.value as { token?: string; password?: string };
  if (!body.token || !body.password) {
    return json(400, { error: "token, password は必須です。" });
  }
  if (body.password.length < MIN_PASSWORD_LENGTH) {
    return json(400, { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください。` });
  }

  const tokenHash = hashResetToken(body.token);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() <= Date.now()) {
    return json(400, { error: "リンクが無効か有効期限切れです。もう一度パスワード再設定をお試しください。" });
  }

  const passwordHash = await bcrypt.hash(body.password, BCRYPT_SALT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  return json(200, { ok: true });
}
