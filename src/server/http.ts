// バックエンド共通のHTTP型。Next.jsのAPI Routeに依存しない形にすることで、
// 同一のハンドラをAPI Gateway+Lambda（src/server/lambda.ts）と
// ローカル開発サーバー（src/server/local.ts）の両方から利用する（docs/AWS.md）。

export interface ApiRequest {
  method: string;
  /** パス部分のみ（例: /api/tasks/abc）。クエリ文字列は含まない。 */
  path: string;
  query: URLSearchParams;
  /** キーは小文字に正規化する。 */
  headers: Record<string, string>;
  cookies: Record<string, string>;
  /** 生のリクエストボディ。無い場合はnull。 */
  body: string | null;
}

export interface ApiResponse {
  status: number;
  /** JSONシリアライズ可能な値（rawがtrueの場合は文字列として扱う）。 */
  body: unknown;
  headers?: Record<string, string>;
  /** Set-Cookieヘッダー値のリスト（API Gateway v2はcookiesフィールドで返す）。 */
  setCookies?: string[];
  /** trueの場合、bodyをJSON.stringifyせず文字列としてそのまま返す（CSVダウンロード等）。 */
  raw?: boolean;
}

export function json(status: number, body: unknown, extra?: Partial<ApiResponse>): ApiResponse {
  return { status, body, ...extra };
}

/** CSVファイルとしてダウンロードさせるレスポンスを返す。 */
export function csv(status: number, filename: string, body: string): ApiResponse {
  return {
    status,
    body,
    raw: true,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  };
}

/** ボディをJSONとして解釈する。不正なJSONは { ok: false } を返し、各ハンドラで400にする。 */
export function parseJsonBody(req: ApiRequest): { ok: true; value: unknown } | { ok: false } {
  if (req.body === null || req.body === "") {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(req.body) };
  } catch {
    return { ok: false };
  }
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) {
    return cookies;
  }
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) {
      cookies[name] = decodeURIComponent(value);
    }
  }
  return cookies;
}
