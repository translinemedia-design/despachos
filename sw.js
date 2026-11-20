// Transline · Despachos v2: abre rápido y con mala señal. Los datos siempre se piden en línea.
const CACHE = "tl-despachos-v13";
const ARCHIVOS = ["./", "index.html", "app.js", "estilos.css", "config.js", "formcliente.js", "logo-etiqueta.js", "etiquetas.js", "ui.js", "ruta.html", "ruta.js", "ruta.css", "almacen.html", "almacen.js", "almacen.css", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
