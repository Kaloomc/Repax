// Réseau d'abord, copie en cache en secours :
// la dernière liste de courses reste lisible au magasin même sans réseau.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copie = res.clone();
          caches.open('repas').then((c) => c.put(e.request, copie));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
