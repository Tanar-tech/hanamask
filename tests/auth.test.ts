import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "@/server/http";

// auth.tsのハンドラテスト（register/login/logout/session/requestPasswordReset/resetPassword）。
// prisma・bcryptjs・mailerをモックし、認証・認可・バリデーション・
// メール列挙攻撃対策（requestPasswordResetは常に200を返す）を検証する。

process.env.AUTH_SECRET = "test-auth-secret";

const { mockHash, mockCompare } = vi.hoisted(() => ({
  mockHash: vi.fn(async (password: string) => `hashed:${password}`),
  mockCompare: vi.fn(async (password: string, hash: string) => hash === `hashed:${password}`),
}));
vi.mock("bcryptjs", () => ({
  default: { hash: mockHash, compare: mockCompare },
  hash: mockHash,
  compare: mockCompare,
}));

const {
  mockUserFindUnique,
  mockUserCreate,
  mockUserUpdate,
  mockResetTokenCreate,
  mockResetTokenFindUnique,
  mockResetTokenUpdate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockResetTokenCreate: vi.fn(),
  mockResetTokenFindUnique: vi.fn(),
  mockResetTokenUpdate: vi.fn(),
  mockTransaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique, create: mockUserCreate, update: mockUserUpdate },
    passwordResetToken: {
      create: mockResetTokenCreate,
      findUnique: mockResetTokenFindUnique,
      update: mockResetTokenUpdate,
    },
    $transaction: mockTransaction,
  },
}));

const { mockSendPasswordResetEmail } = vi.hoisted(() => ({
  mockSendPasswordResetEmail: vi.fn(async (_args: { to: string; resetUrl: string }) => {}),
}));
vi.mock("@/lib/mailer", () => ({
  sendPasswordResetEmail: mockSendPasswordResetEmail,
}));

const { login, logout, register, requestPasswordReset, resetPassword, session } = await import(
  "@/server/handlers/auth"
);
const { signSessionToken } = await import("@/server/token");

function makeRequest(body: unknown, extra?: Partial<ApiRequest>): ApiRequest {
  return {
    method: "POST",
    path: "/api/auth/x",
    query: new URLSearchParams(),
    headers: {},
    cookies: {},
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...extra,
  };
}

beforeEach(() => {
  mockHash.mockClear();
  mockCompare.mockClear();
  mockUserFindUnique.mockReset();
  mockUserCreate.mockReset();
  mockUserUpdate.mockReset();
  mockResetTokenCreate.mockReset();
  mockResetTokenFindUnique.mockReset();
  mockResetTokenUpdate.mockReset();
  mockTransaction.mockClear();
  mockSendPasswordResetEmail.mockClear();
});

describe("register", () => {
  it("正常なメール・パスワードでユーザーと組織(admin)を作成する", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: "u1", email: "new@example.com" });

    const res = await register(makeRequest({ email: "new@example.com", password: "password123" }));

    expect(res.status).toBe(201);
    expect(mockUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "new@example.com",
        passwordHash: "hashed:password123",
        memberships: { create: { role: "admin", organization: { create: { name: "個人の組織" } } } },
      }),
    });
  });

  it("nameを指定すると組織名に反映される", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: "u1", email: "new@example.com" });

    await register(makeRequest({ email: "new@example.com", password: "password123", name: "太郎" }));

    expect(mockUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memberships: { create: { role: "admin", organization: { create: { name: "太郎の組織" } } } },
      }),
    });
  });

  it("email/passwordが無ければ400", async () => {
    const res = await register(makeRequest({ email: "new@example.com" }));
    expect(res.status).toBe(400);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("パスワードが7文字（境界未満）は400", async () => {
    const res = await register(makeRequest({ email: "a@example.com", password: "short12" }));
    expect(res.status).toBe(400);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("パスワードがちょうど8文字（境界）は許可される", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: "u1", email: "a@example.com" });
    const res = await register(makeRequest({ email: "a@example.com", password: "exactly8" }));
    expect(res.status).toBe(201);
  });

  it("既に登録済みのメールアドレスは409", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "existing", email: "dup@example.com" });
    const res = await register(makeRequest({ email: "dup@example.com", password: "password123" }));
    expect(res.status).toBe(409);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("不正なJSONボディは400", async () => {
    const res = await register(makeRequest("not json"));
    expect(res.status).toBe(400);
  });
});

describe("login", () => {
  it("正しいメール・パスワードでセッションCookieを発行する", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      name: "ユーザー",
      passwordHash: "hashed:password123",
    });

    const res = await login(makeRequest({ email: "user@example.com", password: "password123" }));

    expect(res.status).toBe(200);
    expect((res.body as { user: { id: string } }).user.id).toBe("u1");
    expect(res.setCookies?.[0]).toContain("wm_session=");
  });

  it("存在しないメールアドレスは401（ユーザー有無を悟らせないメッセージ）", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await login(makeRequest({ email: "nobody@example.com", password: "password123" }));
    expect(res.status).toBe(401);
    expect(res.setCookies).toBeUndefined();
  });

  it("passwordHashがnullのユーザー（招待未確定等）は401", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "u1", email: "user@example.com", passwordHash: null });
    const res = await login(makeRequest({ email: "user@example.com", password: "password123" }));
    expect(res.status).toBe(401);
  });

  it("パスワード不一致は401", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      passwordHash: "hashed:correct-password",
    });
    const res = await login(makeRequest({ email: "user@example.com", password: "wrong-password" }));
    expect(res.status).toBe(401);
  });

  it("email/passwordが無ければ400", async () => {
    const res = await login(makeRequest({ email: "user@example.com" }));
    expect(res.status).toBe(400);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("不正なJSONボディは400", async () => {
    const res = await login(makeRequest("not json"));
    expect(res.status).toBe(400);
  });
});

describe("logout", () => {
  it("常に200を返しCookieを即時失効させる（Max-Age=0）", async () => {
    const res = await logout(makeRequest(null));
    expect(res.status).toBe(200);
    expect(res.setCookies?.[0]).toContain("Max-Age=0");
  });
});

describe("session", () => {
  it("有効なセッションCookieがあれば200でユーザーを返す", async () => {
    const token = signSessionToken({ id: "u1", email: "user@example.com", name: null });
    const res = await session(makeRequest(null, { cookies: { wm_session: token } }));
    expect(res.status).toBe(200);
    expect((res.body as { user: { id: string } }).user.id).toBe("u1");
  });

  it("Cookieが無ければ401", async () => {
    const res = await session(makeRequest(null));
    expect(res.status).toBe(401);
  });

  it("改ざんされたCookieは401", async () => {
    const token = signSessionToken({ id: "u1", email: "user@example.com", name: null });
    const res = await session(makeRequest(null, { cookies: { wm_session: `${token}x` } }));
    expect(res.status).toBe(401);
  });
});

describe("requestPasswordReset", () => {
  it("存在するメールアドレスにはトークンを発行しリセットメールを送る", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "u1", email: "user@example.com" });

    const res = await requestPasswordReset(
      makeRequest({ email: "user@example.com" }, { headers: { origin: "https://app.example.com" } }),
    );

    expect(res.status).toBe(200);
    expect(mockResetTokenCreate).toHaveBeenCalledTimes(1);
    expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const call = mockSendPasswordResetEmail.mock.calls[0]?.[0] as { to: string; resetUrl: string };
    expect(call.to).toBe("user@example.com");
    expect(call.resetUrl).toMatch(/^https:\/\/app\.example\.com\/reset-password\?token=.+/);
  });

  it("Originヘッダーが無い場合はHostヘッダーから推定する（localhostはhttp）", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "u1", email: "user@example.com" });
    await requestPasswordReset(makeRequest({ email: "user@example.com" }, { headers: { host: "localhost:3000" } }));
    const call = mockSendPasswordResetEmail.mock.calls[0]?.[0] as { resetUrl: string };
    expect(call.resetUrl.startsWith("http://localhost:3000/reset-password?token=")).toBe(true);
  });

  it("存在しないメールアドレスでも200を返し、内部的にはトークンもメールも発行しない（列挙攻撃対策）", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const res = await requestPasswordReset(makeRequest({ email: "nobody@example.com" }));

    expect(res.status).toBe(200);
    expect(mockResetTokenCreate).not.toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("存在有無に関わらずレスポンス内容は同一（差分から存在を推測できない）", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "u1", email: "exists@example.com" });
    const existsRes = await requestPasswordReset(makeRequest({ email: "exists@example.com" }));

    mockUserFindUnique.mockResolvedValue(null);
    const missingRes = await requestPasswordReset(makeRequest({ email: "nobody@example.com" }));

    expect(existsRes.status).toBe(missingRes.status);
    expect(existsRes.body).toEqual(missingRes.body);
  });

  it("emailが無ければ400", async () => {
    const res = await requestPasswordReset(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("不正なJSONボディは400", async () => {
    const res = await requestPasswordReset(makeRequest("not json"));
    expect(res.status).toBe(400);
  });
});

describe("resetPassword", () => {
  const validToken = {
    id: "reset1",
    userId: "u1",
    tokenHash: expect.any(String),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  };

  it("有効なトークンでパスワードを再設定し、トークンを使用済みにする", async () => {
    mockResetTokenFindUnique.mockResolvedValue(validToken);

    const res = await resetPassword(makeRequest({ token: "raw-token", password: "newpassword1" }));

    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "hashed:newpassword1" },
    });
    expect(mockResetTokenUpdate).toHaveBeenCalledWith({
      where: { id: "reset1" },
      data: { usedAt: expect.any(Date) },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("存在しないトークンは400", async () => {
    mockResetTokenFindUnique.mockResolvedValue(null);
    const res = await resetPassword(makeRequest({ token: "bogus", password: "newpassword1" }));
    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("期限切れのトークンは400", async () => {
    mockResetTokenFindUnique.mockResolvedValue({ ...validToken, expiresAt: new Date(Date.now() - 1) });
    const res = await resetPassword(makeRequest({ token: "raw-token", password: "newpassword1" }));
    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("使用済みのトークンは再利用できず400（単一使用の担保）", async () => {
    mockResetTokenFindUnique.mockResolvedValue({ ...validToken, usedAt: new Date() });
    const res = await resetPassword(makeRequest({ token: "raw-token", password: "newpassword1" }));
    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("パスワードが短すぎる場合は400（トークン検証より前に弾かれる）", async () => {
    const res = await resetPassword(makeRequest({ token: "raw-token", password: "short12" }));
    expect(res.status).toBe(400);
    expect(mockResetTokenFindUnique).not.toHaveBeenCalled();
  });

  it("token/passwordが無ければ400", async () => {
    const res = await resetPassword(makeRequest({ token: "raw-token" }));
    expect(res.status).toBe(400);
  });

  it("不正なJSONボディは400", async () => {
    const res = await resetPassword(makeRequest("not json"));
    expect(res.status).toBe(400);
  });
});
