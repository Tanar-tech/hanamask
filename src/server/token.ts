import { createHmac, timingSafeEqual } from "node:crypto";

// セッショントークン（JWT互換のHS256）。静的エクスポート化に伴いNextAuthを廃止したため、
// 依存を増やさずnode:cryptoのみで署名・検証する（docs/AWS.md）。
// ペイロードに機密情報は含めない。Cookieの属性は handlers/auth.ts 側で付与する。

export interface SessionPayload {
  /** ユーザーID */
  sub: string;
  email: string;
  name: string | null;
  /** UNIX秒 */
  exp: number;
}

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // NextAuth既定と同じ30日

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function getSessionSecret(): string {
  // AUTH_SECRET を正とし、旧 .env.local（NextAuth時代）との互換のため NEXTAUTH_SECRET も受け付ける
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET が未設定です。.env.local または本番Secretsに設定してください。");
  }
  return secret;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signSessionToken(
  user: { id: string; email: string; name: string | null },
  secret: string = getSessionSecret(),
  now: Date = new Date(),
): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    exp: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = base64url(JSON.stringify(payload));
  const signature = sign(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string = getSessionSecret(),
  now: Date = new Date(),
): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [header, body, signature] = parts as [string, string, string];
  const expected = sign(`${header}.${body}`, secret);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const candidate = payload as Partial<SessionPayload>;
  if (
    typeof candidate.sub !== "string" ||
    typeof candidate.email !== "string" ||
    (typeof candidate.name !== "string" && candidate.name !== null) ||
    typeof candidate.exp !== "number"
  ) {
    return null;
  }
  if (candidate.exp * 1000 <= now.getTime()) {
    return null;
  }
  return candidate as SessionPayload;
}
