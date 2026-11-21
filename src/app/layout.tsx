import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteFrame } from "@/components/site-frame";
import "./globals.css";

const fusion = localFont({
  src: "../fonts/fusion-pixel-12px-proportional-zh_hans.otf.woff2",
  display: "swap",
  weight: "400",
  adjustFontFallback: false,
  fallback: ["PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "sans-serif"],
});

export const metadata: Metadata = {
  title: "喵绘 · MIAO STUDIO",
  description: "把想象，留在纸上。像素手账里的中文生图台。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={fusion.className}>
        <SiteFrame>{children}</SiteFrame>
      </body>
    </html>
  );
}
