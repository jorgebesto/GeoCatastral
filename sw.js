// ═══════════════════════════════════════════════════
//  GeoCatastral — Service Worker
//  Permite instalar la app en el celular y abrirla sin internet.
//  Cambia VERSION cada vez que quieras forzar una limpieza de caché.
// ═══════════════════════════════════════════════════
const VERSION = 'v2';
const APP_CACHE = 'gc-app-' + VERSION;     // index.html, app.js, íconos
const LIB_CACHE = 'gc-libs-' + VERSION;    // Leaflet, JSZip, ExcelJS, fuentes…
const TILE_CACHE = 'gc-tiles-' + VERSION;  // mosaicos del mapa ya vistos
const MAX_TILES = 1500;                    // ≈ 30–40 MB

const APP_SHELL = [
  './', './index.html', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-48.png',
  './icons/shortcut-catastral-96.png', './icons/shortcut-mercado-96.png'
];
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'cdn.sheetjs.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const TILE_HOSTS = ['tile.openstreetmap.org', 'basemaps.cartocdn.com', 'server.arcgisonline.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('gc-') && ![APP_CACHE, LIB_CACHE, TILE_CACHE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero con límite de tiempo: si Render tarda (o no hay señal),
// se abre la última versión guardada y se actualiza en segundo plano.
function networkFirst(req, cacheName, timeoutMs) {
  return caches.open(cacheName).then(cache => {
    const fromNet = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });
    fromNet.catch(() => { });
    const timeout = new Promise(resolve => setTimeout(resolve, timeoutMs));
    return Promise.race([fromNet, timeout.then(() => cache.match(req, { ignoreSearch: true }))])
      .then(res => res || fromNet)
      .catch(() => cache.match(req, { ignoreSearch: true }))
      .then(res => res || cache.match('./index.html'));
  });
}

// Caché primero (librerías versionadas y mosaicos).
// allowOpaque: las librerías se cargan con <script> sin CORS; son pocas y
// se permiten. Los mosaicos opacos NO se guardan porque llenarían el celular.
function cacheFirst(req, cacheName, limit, allowOpaque) {
  return caches.open(cacheName).then(cache =>
    cache.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || (allowOpaque && res.type === 'opaque'))) {
        cache.put(req, res.clone());
        if (limit) recortar(cache, limit);
      }
      return res;
    }))
  );
}

function recortar(cache, max) {
  cache.keys().then(keys => {
    if (keys.length > max) Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nunca guardar licencias ni datos del servidor
  if (url.hostname.endsWith('supabase.co')) return;

  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req, APP_CACHE, 3500));
    return;
  }
  if (LIB_HOSTS.some(h => url.hostname.endsWith(h))) {
    e.respondWith(cacheFirst(req, LIB_CACHE, 0, true));
    return;
  }
  if (TILE_HOSTS.some(h => url.hostname.endsWith(h))) {
    e.respondWith(cacheFirst(req, TILE_CACHE, MAX_TILES));
  }
});
