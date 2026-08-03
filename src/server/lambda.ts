import { handleRequest } from "./app";
import { parseCookieHeader, type ApiRequest } from "./http";

// API Gateway (HTTP API, ペイロード形式v2.0) 用のLambdaハンドラ。
// 型定義は @types/aws-lambda を追加せず、使用するフィールドのみ最小定義する。

interface HttpApiEventV2 {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
}

interface HttpApiResultV2 {
  statusCode: number;
  headers: Record<string, string>;
  cookies?: string[];
  body: string;
}

export async function handler(event: HttpApiEventV2): Promise<HttpApiResultV2> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined) {
      headers[key.toLowerCase()] = value;
    }
  }

  // HTTP API v2はCookieヘッダーを cookies 配列（"name=value" 形式）に分解して渡す
  const cookies: Record<string, string> = parseCookieHeader((event.cookies ?? []).join("; "));

  const body =
    event.body === undefined
      ? null
      : event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;

  const req: ApiRequest = {
    method: event.requestContext.http.method,
    path: event.rawPath,
    query: new URLSearchParams(event.rawQueryString ?? ""),
    headers,
    cookies,
    body,
  };

  const res = await handleRequest(req);
  return {
    statusCode: res.status,
    headers: { "content-type": "application/json", ...res.headers },
    ...(res.setCookies && res.setCookies.length > 0 ? { cookies: res.setCookies } : {}),
    body: res.raw ? String(res.body) : JSON.stringify(res.body),
  };
}
