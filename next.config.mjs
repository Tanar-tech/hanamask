/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 本番ビルドはS3+CloudFront配信用の静的エクスポート（out/ に出力。docs/AWS.md）。
  // next dev はNODE_ENV=developmentのため通常のdevサーバーとして動き、下のrewritesが効く。
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  // 開発時のみ: /api/* をローカルAPIサーバー（src/server/local.ts）へプロキシする。
  // 本番はCloudFrontの /api/* ビヘイビアがAPI Gatewayへルーティングするため、
  // フロントは開発・本番とも同一オリジンの相対パスでAPIを呼べる。
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_PROXY_TARGET ?? "http://localhost:3001"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
