import { defineConfig } from 'vitest/config';

// 轻量单元测试（D 项）：锁纯逻辑模块核心规则，秒级回归。
// node 环境——不引 jsdom / UI；测试放 tools/unit（不在全量
// tsconfig include 内，避免污染 typecheck；vitest 自带 esbuild
// 转换 TS，直接 import 源码路径）。
export default defineConfig({
  test: {
    include: ['tools/unit/**/*.test.ts'],
    environment: 'node',
  },
});
