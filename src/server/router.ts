import type { ApiRequest, ApiResponse } from "./http";

// 依存を増やさないための最小ルーター。パターンは "/api/tasks/:id" 形式のみ対応する。

export type RouteHandler = (req: ApiRequest, params: Record<string, string>) => Promise<ApiResponse>;

export interface Route {
  method: string;
  pattern: string;
  handler: RouteHandler;
}

/** パターンとパスを照合し、一致すれば :name パラメータを返す。不一致はnull。 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternSegments = pattern.split("/").filter((s) => s !== "");
  const pathSegments = path.split("/").filter((s) => s !== "");
  if (patternSegments.length !== pathSegments.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i] as string;
    const pathSegment = pathSegments[i] as string;
    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = decodeURIComponent(pathSegment);
    } else if (patternSegment !== pathSegment) {
      return null;
    }
  }
  return params;
}

export function findRoute(
  routes: Route[],
  method: string,
  path: string,
): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method.toUpperCase()) {
      continue;
    }
    const params = matchPath(route.pattern, path);
    if (params) {
      return { route, params };
    }
  }
  return null;
}
