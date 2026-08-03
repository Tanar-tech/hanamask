import type { ApiRequest } from "./http";
import { verifySessionToken } from "./token";
import { getActiveMembership } from "@/lib/current-organization";

export const SESSION_COOKIE = "wm_session";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export interface OrganizationContext {
  userId: string;
  organizationId: string;
}

/** セッションCookieからログインユーザーを解決する。未認証・不正トークンはnull。 */
export function getSessionUser(req: ApiRequest): SessionUser | null {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    return null;
  }
  return { id: payload.sub, email: payload.email, name: payload.name };
}

/** API共通: 認証済みユーザーとアクティブ組織を解決する。未認証ならnull（旧 lib/api-context.ts 相当）。 */
export async function requireOrganizationContext(req: ApiRequest): Promise<OrganizationContext | null> {
  const user = getSessionUser(req);
  if (!user) {
    return null;
  }
  const membership = await getActiveMembership(user.id);
  if (!membership) {
    return null;
  }
  return { userId: user.id, organizationId: membership.organizationId };
}
