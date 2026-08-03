import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { handleRequest } from "./app";
import { parseCookieHeader, type ApiRequest } from "./http";

// ローカル開発用APIサーバー。本番はLambda（src/server/lambda.ts）が同じ handleRequest を実行する。
// 開発時は next dev (:3000) が /api/* をこのサーバー（既定 :3001）へrewriteでプロキシするため、
// ブラウザから見ると同一オリジンとなり、本番（CloudFrontの/api/*ビヘイビア）と同じ構図になる。

// tsx は .env.local を自動で読まないため、未設定の変数のみここで読み込む。
function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z0-9_]*)="?([^"]*)"?\s*$/.exec(line.trim());
    if (match && process.env[match[1] as string] === undefined) {
      process.env[match[1] as string] = match[2];
    }
  }
}

loadEnvLocal();

const port = Number(process.env.API_PORT ?? 3001);

const server = createServer((incoming, outgoing) => {
  const chunks: Buffer[] = [];
  incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
  incoming.on("end", () => {
    void (async () => {
      const url = new URL(incoming.url ?? "/", `http://localhost:${port}`);
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (typeof value === "string") {
          headers[key.toLowerCase()] = value;
        }
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const req: ApiRequest = {
        method: incoming.method ?? "GET",
        path: url.pathname,
        query: url.searchParams,
        headers,
        cookies: parseCookieHeader(headers["cookie"]),
        body: rawBody === "" ? null : rawBody,
      };

      const res = await handleRequest(req);
      outgoing.writeHead(res.status, {
        "content-type": "application/json",
        ...res.headers,
        ...(res.setCookies && res.setCookies.length > 0 ? { "set-cookie": res.setCookies } : {}),
      });
      outgoing.end(res.raw ? String(res.body) : JSON.stringify(res.body));
    })().catch((error) => {
      console.error("request handling failed:", error);
      outgoing.writeHead(500, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ error: "internal server error" }));
    });
  });
});

server.listen(port, () => {
  console.log(`work-manager API server: http://localhost:${port}`);
});
