import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';

class AppErrorBoundary extends React.Component<
  { children?: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: '#f6f8fb',
            color: '#172033',
            fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
          }}
        >
          <section style={{ maxWidth: 520, textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>🧩</div>
            <h1>拼读小队暂时没有加载完成</h1>
            <p>请点击下面按钮重新加载；学习记录仍保存在本机和家庭云端。</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                border: 0,
                borderRadius: 10,
                padding: '11px 18px',
                background: '#ff5b35',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              重新加载
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <Home />
    </AppErrorBoundary>
  </React.StrictMode>,
);
