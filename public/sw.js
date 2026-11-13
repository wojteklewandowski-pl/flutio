/*
 * Service worker – tryb offline.
 *  - Pliki aplikacji (HTML/JS/CSS z tego samego serwera): najpierw sieć, w razie braku – pamięć podręczna.
 *  - Próbki dźwięku (SoundFont z paulrosen.github.io): najpierw pamięć podręczna, potem sieć.
 * Działa tylko przez https:// albo http://localhost (wymóg przeglądarek).
 * Po zmianie strategii podbij CACHE_VERSION, żeby stare dane zostały usunięte.
 */
const CACHE_VERSION = 'flutio-v1';
const SOUNDFONT_HOST = 'paulrosen.github.io';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(['./', './index.html'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === SOUNDFONT_HOST) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    );
  }
});
