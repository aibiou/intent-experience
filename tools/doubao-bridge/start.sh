#!/bin/bash
# 启动豆包桥接服务（幂等——已在跑则直接返回健康状态）
set -euo pipefail

PORT="${DOUBAO_BRIDGE_PORT:-3220}"

if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  curl -fsS "http://127.0.0.1:$PORT/health"
  echo
  exit 0
fi

cd "$(dirname "$0")/../.."
nohup ./node_modules/.bin/tsx tools/doubao-bridge/index.ts </dev/null &>/tmp/doubao-bridge.log & disown

for _ in $(seq 1 20); do
  sleep 0.5
  if curl -fsS "http://127.0.0.1:$PORT/health" 2>/dev/null; then
    echo
    exit 0
  fi
done

echo "豆包桥接未就绪——查看 /tmp/doubao-bridge.log" >&2
exit 1
