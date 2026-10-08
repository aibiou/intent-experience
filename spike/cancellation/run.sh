#!/bin/sh
# ADR-0002 Spike 启动器：按 ADR-0001 生命周期规则选择 Active / Maintenance LTS Node，
# 锁定补丁版本并记录（由 run-all.mjs 写入证据 environment 字段）。
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
NODE=""
for cand in "$HOME"/.nvm/versions/node/v24 "$HOME"/.nvm/versions/node/v22 "$HOME"/.nvm/versions/node/v20; do
  for d in $cand*; do
    if [ -x "$d/bin/node" ]; then NODE="$d/bin/node"; break 2; fi
  done
done
if [ -z "$NODE" ]; then
  NODE=$(command -v node)
fi
VER=$("$NODE" --version)
FLAGS=""
case "$VER" in
  v22.*) FLAGS="--experimental-sqlite" ;;
esac
echo "spike node: $NODE ($VER) flags: [$FLAGS]"
cd "$HERE"
exec "$NODE" $FLAGS run-all.mjs
