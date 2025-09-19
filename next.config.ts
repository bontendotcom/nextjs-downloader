import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: '/nextjs-downloader', // GitHub Pagesのサブディレクトリにデプロイするために追加
  /* config options here */
};

export default nextConfig;
