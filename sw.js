/* Chemion Quest v5.95 service worker */
'use strict';
const CACHE_PREFIX = 'chemimon-quest-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-v5.95`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-v5.95`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './version.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './assets/audio/chemion-normal-bgm.mp3',
  './assets/audio/chemion-difficult-bgm.mp3'
];

async function cacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, RUNTIME_CACHE].includes(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'REFRESH_SHELL') event.waitUntil(cacheShell());
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response?.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('./index.html', response.clone());
    }
    return response;
  } catch {
    return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response?.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match('./version.json')));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
