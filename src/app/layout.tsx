import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

type SystemFontStyle = CSSProperties & {
  "--font-geist-sans":
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  "--font-geist-mono":
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
};

const systemFontVariables = {
  "--font-geist-sans":
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  "--font-geist-mono":
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as SystemFontStyle;

export const metadata: Metadata = {
  title: "个人体验引擎",
  description:
    "人决定方向，AI 降低成本。一个帮助你以最低成本进入此刻想要状态的个人体验引擎。",
  keywords: ["个人体验引擎", "探索", "好奇", "体验"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf9f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning style={systemFontVariables}>
      <body
        className="antialiased bg-background text-foreground"
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
