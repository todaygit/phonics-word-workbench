const CACHE_VERSION = 'phonics-workbench-v1.10.0';
const APP_BASE = new URL('./', self.location.href).pathname;
const APP_SHELL = [
  APP_BASE,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}favicon.svg`,
  `${APP_BASE}icon-192.png`,
  `${APP_BASE}icon-512.png`,
  `${APP_BASE}icon-maskable.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('phonics-workbench-') && key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PHONICS_CACHE_URLS') {
    const urls = Array.isArray(event.data.urls) ? event.data.urls.slice(0, 80) : [];
    event.waitUntil(
      caches.open(CACHE_VERSION).then(async (cache) => {
        await Promise.allSettled(
          urls.map(async (url) => {
            const request = new Request(url, { credentials: 'same-origin' });
            const response = await fetch(request);
            if (response.ok) await cache.put(request, response);
          }),
        );
        event.ports[0]?.postMessage({ type: 'PHONICS_CACHE_READY' });
      }),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_VERSION).then((cache) => cache.put(APP_BASE, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match(APP_BASE))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            void caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
