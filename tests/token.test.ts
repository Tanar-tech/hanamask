import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from "@/server/token";

const SECRET = "test-secret";
const USER = { id: "user_1", email: "user@example.com", name: "テスト太郎" };

describe("signSessionToken / verifySessionToken", () => {
  it("署名したトークンを検証するとペイロードが取り出せる", () => {
    const now = new Date("2026-07-24T00:00:00Z");
    const token = signSessionToken(USER, SECRET, now);
    const payload = verifySessionToken(token, SECRET, now);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe(USER.id);
    expect(payload?.email).toBe(USER.email);
    expect(payload?.name).toBe(USER.name);
    expect(payload?.exp).toBe(Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS);
  });

  it("nameがnullのユーザーも扱える", () => {
    const token = signSessionToken({ ...USER, name: null }, SECRET);
    expect(verifySessionToken(token, SECRET)?.name).toBeNull();
  });

  it("異なるシークレットで署名されたトークンは拒否する", () => {
    const token = signSessionToken(USER, "other-secret");
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("ペイロードが改ざんされたトークンは拒否する", () => {
    const token = signSessionToken(USER, SECRET);
    const [header, body, signature] = token.split(".") as [string, string, string];
    const tampered = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), sub: "attacker" }),
    ).toString("base64url");
    expect(verifySessionToken(`${header}.${tampered}.${signature}`, SECRET)).toBeNull();
  });

  it("期限切れのトークンは拒否する", () => {
    const issuedAt = new Date("2026-01-01T00:00:00Z");
    const token = signSessionToken(USER, SECRET, issuedAt);
    const afterExpiry = new Date(issuedAt.getTime() + (SESSION_TTL_SECONDS + 1) * 1000);
    expect(verifySessionToken(token, SECRET, afterExpiry)).toBeNull();
    const beforeExpiry = new Date(issuedAt.getTime() + (SESSION_TTL_SECONDS - 1) * 1000);
    expect(verifySessionToken(token, SECRET, beforeExpiry)).not.toBeNull();
  });

  it("形式が不正な文字列は拒否する", () => {
    expect(verifySessionToken("", SECRET)).toBeNull();
    expect(verifySessionToken("abc", SECRET)).toBeNull();
    expect(verifySessionToken("a.b", SECRET)).toBeNull();
    expect(verifySessionToken("a.b.c", SECRET)).toBeNull();
  });
});
