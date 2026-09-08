'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type PwaState = 'browser' | 'installed';

function appBase() {
  return window.location.pathname.startsWith('/phonics-word-workbench')
    ? '/phonics-word-workbench/'
    : '/';
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

async function cacheCurrentApp(registration: ServiceWorkerRegistration) {
  const urls = new Set<string>([window.location.href, `${window.location.origin}${appBase()}`]);
  for (const entry of performance.getEntriesByType('resource')) {
    if (!(entry instanceof PerformanceResourceTiming)) continue;
    const url = new URL(entry.name, window.location.href);
    if (url.origin === window.location.origin) urls.add(url.href);
  }

  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) return false;

  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(false), 8000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      resolve(event.data?.type === 'PHONICS_CACHE_READY');
    };
    worker.postMessage(
      { type: 'PHONICS_CACHE_URLS', urls: [...urls] },
      [channel.port2],
    );
  });
}

export function InstallAppPanel() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [pwaState, setPwaState] = useState<PwaState>('browser');
  const [online, setOnline] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [message, setMessage] = useState('');
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const refreshCache = useCallback(async () => {
    const registration = registrationRef.current;
    if (!registration) return;
    setMessage('正在准备离线内容…');
    const ready = await cacheCurrentApp(registration);
    setOfflineReady(ready);
    setMessage(ready ? '工作台界面已可离线打开。' : '离线准备暂未完成，请联网后再试。');
  }, []);

  useEffect(() => {
    setPwaState(isStandalone() ? 'installed' : 'browser');
    setOnline(navigator.onLine);
    setOfflineReady(window.localStorage.getItem('phonics.pwa.offlineReady') === 'true');

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setPwaState('installed');
      setMessage('已经安装到桌面，可以从图标打开。');
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register(`${appBase()}sw.js`, { scope: appBase() })
        .then(async (registration) => {
          registrationRef.current = registration;
          const ready = await cacheCurrentApp(registration);
          if (ready) {
            window.localStorage.setItem('phonics.pwa.offlineReady', 'true');
            setOfflineReady(true);
          }
          await registration.update().catch(() => undefined);
        })
        .catch(() => setMessage('当前浏览器没有完成离线准备，联网使用不受影响。'));
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function install() {
    if (pwaState === 'installed') {
      setMessage('已经安装好了，请从手机或平板桌面打开。');
      return;
    }
    if (!prompt) {
      setMessage('请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。');
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      setPrompt(null);
      setMessage('正在安装，稍后可从桌面图标打开。');
    } else {
      setMessage('这次没有安装，之后仍可随时再试。');
    }
  }

  return (
    <section className="pwa-panel panel" aria-labelledby="install-app-title">
      <div className="pwa-panel-icon" aria-hidden="true">
        {pwaState === 'installed' ? <CheckCircle2 /> : <Download />}
      </div>
      <div className="pwa-panel-copy">
        <p className="eyebrow">ANDROID APP</p>
        <h2 id="install-app-title">
          {pwaState === 'installed' ? '已经安装到这台设备' : '安装到手机或平板'}
        </h2>
        <p>
          安装后会出现在桌面，打开时像普通 App；电脑仍然可以继续使用网页。
        </p>
        <div className="pwa-state-row" aria-live="polite">
          <span className={online ? 'is-ready' : 'is-offline'}>
            {online ? <Wifi /> : <WifiOff />}
            {online ? '当前已联网' : '当前处于离线状态'}
          </span>
          <span className={offlineReady ? 'is-ready' : ''}>
            <CheckCircle2 />
            {offlineReady ? '界面可离线打开' : '正在准备离线内容'}
          </span>
        </div>
        {message && <output className="pwa-message">{message}</output>}
      </div>
      <div className="pwa-panel-actions">
        <Button onClick={install} disabled={pwaState === 'installed'}>
          {pwaState === 'installed' ? <CheckCircle2 /> : <Download />}
          {pwaState === 'installed' ? '已安装' : '安装应用'}
        </Button>
        <Button variant="outline" onClick={refreshCache}>
          <RefreshCw /> 更新离线内容
        </Button>
      </div>
    </section>
  );
}
