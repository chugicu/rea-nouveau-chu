/* Service worker : rend l'application utilisable hors ligne.
   Pensez à augmenter VERSION à chaque mise en ligne d'une nouvelle version. */
var VERSION = 'rea-app-v2.5.4';
var FICHIERS = [
  './',
  'index.html',
  'css/app.css',
  'css/theme.css',
  'js/config.js',
  'js/api.js',
  'js/cap.js', 'js/app.js', 'js/communs.js', 'js/service.js', 'js/dessin.js',
  'js/plan.js',
  'js/export.js',
  'js/pdf-images.js',
  'js/fun.js',
  'js/gps.js', 'js/quiz.js',
  'js/escape-scenarios.js', 'js/escape-editeur.js',
  'js/jeux.js', 'js/defi.js', 'js/defi-gestion.js',
  'manifest.webmanifest',
  'assets/logos/reanimation-guadeloupe.png',
  'assets/logos/chu-guadeloupe.png',
  'assets/icons/icon-192.png',
  'assets/icons/favicon.png',
  'assets/fonts/barlow-latin-600-normal.woff2',
  'assets/fonts/barlow-latin-700-normal.woff2',
  'assets/fonts/barlow-condensed-latin-700-normal.woff2',
  'assets/fonts/barlow-condensed-latin-800-normal.woff2',
  'assets/fonts/pt-sans-latin-400-normal.woff2',
  'assets/fonts/pt-sans-latin-700-normal.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FICHIERS); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k.indexOf('rea-app-') === 0 && k !== VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // appels au moteur : jamais mis en cache ici
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function () { return caches.match('index.html'); }));
    return;
  }
  // Fichiers statiques : cache d'abord, puis réseau (et mise en cache au passage)
  e.respondWith(caches.match(req).then(function (trouve) {
    return trouve || fetch(req).then(function (rep) {
      if (rep.ok) { var copie = rep.clone(); caches.open(VERSION).then(function (c) { c.put(req, copie); }); }
      return rep;
    });
  }));
});
