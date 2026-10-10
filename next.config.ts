import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 开发服务器允许本机来源访问 HMR 等 dev 资源——
  // 否则 Next.js 16 默认拦截 /_next/hmr 握手，
  // HMR 客户端初始化失败会连带打断页面 hydration。
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
