import { json, type ApiRequest, type ApiResponse } from "./http";
import { findRoute, type Route } from "./router";

// APIの全ルート定義。固定パスはパラメータパス（例: /api/things/:id）より先に定義して優先させる。
// hanamaskのAPI実装はこれから追加する（src/server/handlers/ 配下にハンドラを置き、ここに登録する）。
const routes: Route[] = [];

/** アダプタ（Lambda/ローカル）非依存のエントリポイント。 */
export async function handleRequest(req: ApiRequest): Promise<ApiResponse> {
  const found = findRoute(routes, req.method, req.path);
  if (!found) {
    return json(404, { error: "not found" });
  }
  try {
    return await found.route.handler(req, found.params);
  } catch (error) {
    console.error("unhandled error:", error);
    return json(500, { error: "internal server error" });
  }
}
