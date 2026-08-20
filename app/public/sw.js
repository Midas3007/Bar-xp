/**
 * App-shell service worker.
 *
 * Firestore's IndexedDB cache covers the *data*; it does nothing for the HTML
 * and JS, so an installed PWA cold-started with no signal would still land on
 * the browser's offline page.
 *
 * Hand-written rather than `vite-plugin-pwa`: the plugin brings Workbox and
 * rewires the build to emit a precache manifest, and the only policy this app
 * needs is "serve the cached shell when navigation fails, cache-first the
 * content-hashed assets Vite already emits". That is seventy lines.
 *
 * Bump CACHE whenever SHELL changes — `activate` deletes every other cache name.
 */

const CACHE = 'barxp-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg'];

/** Give a dead network this long before falling back to the cached shell. */
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Firestore, Identity Toolkit and Google Fonts are never intercepted: the SDK
  // has its own offline story, and a stale cached token response would look
  // like data corruption rather than a network failure.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }

  // Vite emits content-hashed asset filenames, so a cached hit can never be
  // stale — a new build is a new URL.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstShell(request) {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('navigation timeout')), NAV_TIMEOUT_MS),
      ),
    ]);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = (await caches.match('/index.html')) || (await caches.match('/'));
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}
