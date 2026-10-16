#!/bin/bash
# 构建元宝桥接 App（本机自用）。默认 ad-hoc 签名；
# 重新构建后需要在「系统设置 → 隐私与安全性 → 辅助功能」重新授权。
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$DIR/YuanbaoBridge.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O \
  -o "$APP/Contents/MacOS/YuanbaoBridge" \
  "$DIR/Sources/YuanbaoBridge.swift" \
  -framework AppKit \
  -framework ApplicationServices \
  -framework CoreGraphics \
  -framework Network \
  -lsqlite3

cp "$DIR/Info.plist" "$APP/Contents/Info.plist"
# 固定证书身份让辅助功能授权跨重编译保留；
# ad-hoc 签名会因 CDHash 变化导致每次都要重新授权。
codesign --force \
  --sign "${YUANBAO_BRIDGE_SIGN_IDENTITY:--}" \
  "$APP" >/dev/null 2>&1 || codesign --force \
  --sign "${YUANBAO_BRIDGE_SIGN_IDENTITY:--}" \
  "$APP"

echo "built: $APP"
