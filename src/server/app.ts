import { json, type ApiRequest, type ApiResponse } from "./http";
import { findRoute, type Route } from "./router";
import { login, logout, register, requestPasswordReset, resetPassword, session } from "./handlers/auth";
import { createProject, deleteProject, listProjects, updateProject } from "./handlers/projects";
import { deleteTask, getOpenTask, getTasksInRange, patchTask, postTaskAction } from "./handlers/tasks";
import { exportStatsSummary, getStatsSummary } from "./handlers/stats";

// APIの全ルート定義。固定パス（/api/tasks/range）はパラメータパス（/api/tasks/:id）より
// 先に定義して優先させる。
const routes: Route[] = [
  { method: "POST", pattern: "/api/auth/register", handler: register },
  { method: "POST", pattern: "/api/auth/login", handler: login },
  { method: "POST", pattern: "/api/auth/logout", handler: logout },
  { method: "GET", pattern: "/api/auth/session", handler: session },
  { method: "POST", pattern: "/api/auth/request-password-reset", handler: requestPasswordReset },
  { method: "POST", pattern: "/api/auth/reset-password", handler: resetPassword },
  { method: "GET", pattern: "/api/projects", handler: listProjects },
  { method: "POST", pattern: "/api/projects", handler: createProject },
  { method: "PATCH", pattern: "/api/projects/:id", handler: updateProject },
  { method: "DELETE", pattern: "/api/projects/:id", handler: deleteProject },
  { method: "GET", pattern: "/api/tasks", handler: getOpenTask },
  { method: "POST", pattern: "/api/tasks", handler: postTaskAction },
  { method: "GET", pattern: "/api/tasks/range", handler: getTasksInRange },
  { method: "PATCH", pattern: "/api/tasks/:id", handler: patchTask },
  { method: "DELETE", pattern: "/api/tasks/:id", handler: deleteTask },
  { method: "GET", pattern: "/api/stats/summary", handler: getStatsSummary },
  { method: "GET", pattern: "/api/stats/export", handler: exportStatsSummary },
];

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
