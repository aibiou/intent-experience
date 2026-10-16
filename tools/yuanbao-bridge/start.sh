#!/bin/bash
# 启动元宝桥接并等待就绪（幂等——已在跑则直接返回健康状态）。
#
# 前置：/Applications/YuanbaoBridge.app 已安装，且已在
# 「系统设置 → 隐私与安全性 → 辅助功能」中打开开关。
set -euo pipefail

APP="/Applications/YuanbaoBridge.app"
PORT="${YUANBAO_BRIDGE_PORT:-3210}"

if [ ! -d "$APP" ]; then
  echo "未找到 $APP —— 先运行 ./build.sh，再安装到 /Applications（见 README）" >&2
  exit 1
fi

if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  curl -fsS "http://127.0.0.1:$PORT/health"
  echo
  exit 0
fi

open "$APP" --args serve

for _ in $(seq 1 20); do
  sleep 0.5
  if curl -fsS "http://127.0.0.1:$PORT/health" 2>/dev/null; then
    echo
    exit 0
  fi
done

echo "桥接未就绪——请检查辅助功能授权是否已打开" >&2
exit 1
