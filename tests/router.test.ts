import { describe, expect, it } from "vitest";
import { findRoute, matchPath, type Route } from "@/server/router";
import { json } from "@/server/http";

describe("matchPath", () => {
  it("固定パスが一致する", () => {
    expect(matchPath("/api/tasks", "/api/tasks")).toEqual({});
  });

  it("パラメータ付きパスからパラメータを取り出す", () => {
    expect(matchPath("/api/tasks/:id", "/api/tasks/abc123")).toEqual({ id: "abc123" });
  });

  it("パラメータはURLデコードされる", () => {
    expect(matchPath("/api/tasks/:id", "/api/tasks/a%20b")).toEqual({ id: "a b" });
  });

  it("セグメント数が違うパスは一致しない", () => {
    expect(matchPath("/api/tasks", "/api/tasks/abc")).toBeNull();
    expect(matchPath("/api/tasks/:id", "/api/tasks")).toBeNull();
  });

  it("固定セグメントが異なるパスは一致しない", () => {
    expect(matchPath("/api/tasks/:id", "/api/projects/abc")).toBeNull();
  });

  it("末尾スラッシュは無視して一致する", () => {
    expect(matchPath("/api/tasks", "/api/tasks/")).toEqual({});
  });
});

describe("findRoute", () => {
  const routes: Route[] = [
    { method: "GET", pattern: "/api/tasks", handler: async () => json(200, { via: "list" }) },
    { method: "POST", pattern: "/api/tasks", handler: async () => json(200, { via: "create" }) },
    { method: "GET", pattern: "/api/tasks/range", handler: async () => json(200, { via: "range" }) },
    { method: "PATCH", pattern: "/api/tasks/:id", handler: async () => json(200, { via: "patch" }) },
  ];

  it("メソッドとパスの両方が一致するルートを返す", () => {
    expect(findRoute(routes, "POST", "/api/tasks")?.route.pattern).toBe("/api/tasks");
    expect(findRoute(routes, "post", "/api/tasks")?.route.method).toBe("POST");
  });

  it("固定パス（range）がパラメータパス（:id）より先に定義されていれば優先される", () => {
    const found = findRoute(routes, "GET", "/api/tasks/range");
    expect(found?.route.pattern).toBe("/api/tasks/range");
  });

  it("パラメータを返す", () => {
    expect(findRoute(routes, "PATCH", "/api/tasks/t1")?.params).toEqual({ id: "t1" });
  });

  it("一致しない場合はnull", () => {
    expect(findRoute(routes, "DELETE", "/api/tasks")).toBeNull();
    expect(findRoute(routes, "GET", "/api/unknown")).toBeNull();
  });
});
