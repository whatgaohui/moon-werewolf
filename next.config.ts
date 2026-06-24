import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // 允许通过 Preview Panel 域名访问 /_next/* 资源（CSS/JS），
  // 否则跨域请求被拦截，样式不加载导致页面元素不可见
  allowedDevOrigins: ["*.space-z.ai"],
};

export default nextConfig;
