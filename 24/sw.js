// Build placeholders are replaced by build.js. Each scope owns a separate cache.
'use strict';
const BUILD = "579acf4e4ec26e253e23";
const FILES = ["fonts/37809322a538075f843a.woff2","fonts/44e514ae89e3e936a880.woff2","fonts/7edc5262966b2b5aa3b3.woff2","fonts/9b3963915707a91fb079.woff2","fonts/a19d936814f18212010d.woff2","fonts/a5df16d8135b4111af83.woff2","fonts/aca8cb86c04d6b4dd732.woff2","fonts/d324f9941b3a33938bc0.woff2","fonts/d3534b8d279e16ecc41c.woff2","fonts/df5fa2abf855ab9bfd1f.woff2","fonts/e0c165192dac62e031a8.woff2","fonts/eb5048c0298c7042b4d2.woff2","fonts/fonts.css","icon.png","img/china-airport.jpg","img/china-food.jpg","img/china-river.jpg","img/china-skyline.jpg","img/china-train.jpg","img/kris-cut.webp","img/kris.jpg","index.html","manifest.webmanifest"];
const SCOPE = new URL(self.registration.scope);
const PREFIX = 'kt-' + encodeURIComponent(SCOPE.href) + '-';
const CACHE = PREFIX + BUILD;
const PRECACHE = FILES.map(file => new URL(file, SCOPE).href);
const STATUS_KEY = new URL('__cache_ready__', SCOPE).href;
function inScope(url) {
  return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname) &&
    !url.hostname.endsWith('script.google.com');
}
function successful(response) {
  if (!response || !response.ok || response.type === 'opaque' || response.type === 'opaqueredirect') return false;
  return !response.url || inScope(new URL(response.url));
}
async function ready(cache) {
  if (!await cache.match(STATUS_KEY)) return false;
  const responses = await Promise.all(PRECACHE.map(url => cache.match(url)));
  return responses.every(successful);
}
async function report(client, cache) {
  if (!client || typeof client.postMessage !== 'function') return;
  let ok = false;
  try { ok = await ready(cache || await caches.open(CACHE)); } catch { /* report false */ }
  // Existing shell listeners treat CACHE_READY as success regardless of ready.
  // Reserve that signal for verified success; status requests still always reply.
  client.postMessage({ type: ok ? 'CACHE_READY' : 'CACHE_NOT_READY', ready: ok, version: BUILD });
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.delete(STATUS_KEY);
    try {
      const responses = await Promise.all(PRECACHE.map(url => fetch(new Request(url, { cache: 'reload', credentials: 'same-origin', redirect: 'error' }))));
      if (!responses.every(successful)) throw new Error('Precache incomplete');
      await Promise.all(PRECACHE.map((url, i) => cache.put(url, responses[i])));
      await cache.put(STATUS_KEY, new Response(BUILD));
      if (!await ready(cache)) throw new Error('Precache verification failed');
      await self.skipWaiting();
    } catch (error) {
      await cache.delete(STATUS_KEY).catch(() => {});
      // Fail installation explicitly; the preceding active worker stays usable.
      throw error;
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    if (!await ready(cache)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clients.filter(client => inScope(new URL(client.url))).map(client => report(client, cache)));
  })());
});
self.addEventListener('message', event => {
  const type = typeof event.data === 'string' ? event.data : event.data && event.data.type;
  if (type !== 'GET_CACHE_STATUS') return;
  if (!event.source || !event.source.url || !inScope(new URL(event.source.url))) return;
  event.waitUntil(report(event.ports && event.ports[0] || event.source));
});
const offline = () => new Response('Offline: this page has not been saved. Reconnect and open the guide again.', {
  status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
});
async function saved(cache, request) {
  try { return await cache.match(request); } catch { return undefined; }
}
async function store(cache, request, response) {
  if (successful(response)) { try { await cache.put(request, response.clone()); } catch { /* return network response even when storage is full */ } }
}
async function respond(request) {
  let cache;
  try { cache = await caches.open(CACHE); } catch { /* network still available */ }
  if (request.mode === 'navigate') {
    try {
      const response = await fetch(request);
      const url = new URL(request.url);
      if (cache && !url.search && (url.href === SCOPE.href || url.pathname === SCOPE.pathname + 'index.html')) {
        await store(cache, new URL('index.html', SCOPE).href, response);
      }
      return response;
    } catch {
      return cache && await saved(cache, new URL('index.html', SCOPE).href) || offline();
    }
  }
  const cached = cache && await saved(cache, request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (cache) await store(cache, request, response);
    return response;
  } catch { return offline(); }
}
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !inScope(url) || url.search || request.headers.has('authorization')) return;
  if (request.mode !== 'navigate' && !PRECACHE.includes(url.href)) return;
  event.respondWith(respond(request));
});
