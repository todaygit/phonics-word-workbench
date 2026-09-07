import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '拼读小队 · 单词工作台',
  description: '为家庭自然拼读学习设计的可调词库、每日学习与间隔复习工作台。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
