'use strict';
// Service worker: guarda os arquivos no aparelho para o app abrir sem internet.
// Abre do cache e, quando há internet, atualiza o cache em segundo plano (a nova versão aparece na próxima abertura).
const CACHE = 'controle-gastos-v1';
const ARQUIVOS = ['./', './index.html', './style.css', './dados.js', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('controle-gastos-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const guardado = await cache.match(e.request, { ignoreSearch: true });
    const rede = fetch(e.request).then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => null);
    return guardado || (await rede) || cache.match('./index.html');
  }));
});
