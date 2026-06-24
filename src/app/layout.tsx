import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "月夜狼人杀 - AI对战",
  description: "与AI对手展开一场神秘的狼人杀对决，支持语音发言，卡通风格移动端游戏。",
  keywords: ["狼人杀", "AI游戏", "语音游戏", "Werewolf", "手机游戏"],
  authors: [{ name: "Z.ai Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "月夜狼人杀",
    description: "AI对战狼人杀，卡通风格移动端游戏",
    siteName: "月夜狼人杀",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "月夜狼人杀",
    description: "AI对战狼人杀游戏",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
