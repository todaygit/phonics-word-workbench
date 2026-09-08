import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '拼读小队 · v0.8 拼写工作台',
  description:
    '按自然拼读学习顺序进行缺字母与全词拼写测试，并提供独立家长控制词库。',
};

export const dynamic = 'force-static';

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
