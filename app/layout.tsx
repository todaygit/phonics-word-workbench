import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '拼读小队 · v1.10.0',
  description:
    '按自然拼读学习顺序进行缺字母与全词拼写测试，并提供独立家长控制词库。',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '拼读小队',
  },
};

export const viewport: Viewport = {
  themeColor: '#172033',
  viewportFit: 'cover',
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
