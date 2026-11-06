/* Réa – Nouveau CHU · conversion d'un PDF en images JPEG (newsletters)
   La conversion se fait sur l'appareil de l'administrateur avec pdf.js (hébergé dans l'appli, dossier vendor) :
   le PDF n'est envoyé à aucun service extérieur. Chaque page devient une image haute définition
   (environ 200 points par pouce pour une page A4), lisible en zoomant sur un téléphone. */
(function () {
  'use strict';
  var LARGEUR = 1654;             // px : A4 à ~200 ppp
  var MAX_COTE = 2600;            // px : borne pour les formats inhabituels (limite mémoire des iPhone)
  var MAX_OCTETS = 2.6 * 1024 * 1024;
  var MAX_PAGES = 16;
  var charge = null;
  function chargerPdfJs() {
    if (!charge) charge = new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = 'vendor/pdf.min.js'; s.async = true;
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = function () { charge = null; ko(new Error('Le convertisseur PDF n\'a pas pu être chargé (réseau ?).')); };
      document.head.appendChild(s);
    });
    return charge;
  }
  function enJpeg(canvas, qualite) {
    var url = canvas.toDataURL('image/jpeg', qualite), b64 = url.slice(url.indexOf(',') + 1);
    return { b64: b64, octets: Math.floor(b64.length * 3 / 4) };
  }
  /** fichier : File PDF ; progression(n, total) ; renvoie { pages: [base64 JPEG], ratio, apercus: [dataURL] } */
  function convertir(fichier, progression) {
    return chargerPdfJs().then(function (pdfjs) {
      return fichier.arrayBuffer().then(function (buf) { return pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise; });
    }).then(function (doc) {
      if (doc.numPages > MAX_PAGES) throw new Error('Ce PDF a ' + doc.numPages + ' pages : ' + MAX_PAGES + ' au maximum.');
      var pages = [], apercus = [], ratio = 1.414;
      function page(n) {
        if (n > doc.numPages) return Promise.resolve();
        if (progression) progression(n, doc.numPages);
        return doc.getPage(n).then(function (p) {
          var v1 = p.getViewport({ scale: 1 });
          if (n === 1) ratio = v1.height / v1.width;
          var echelle = Math.min(LARGEUR / v1.width, MAX_COTE / Math.max(v1.width, v1.height));
          var v = p.getViewport({ scale: echelle });
          var c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
          var g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); // fond blanc (le JPEG n'a pas de transparence)
          return p.render({ canvasContext: g, viewport: v, background: '#ffffff' }).promise.then(function () {
            var q = 0.86, r = enJpeg(c, q);
            while (r.octets > MAX_OCTETS && q > 0.5) { q -= 0.08; r = enJpeg(c, q); }
            pages.push(r.b64);
            var m = document.createElement('canvas'); m.width = 240; m.height = Math.round(240 * c.height / c.width);
            m.getContext('2d').drawImage(c, 0, 0, m.width, m.height); apercus.push(m.toDataURL('image/jpeg', 0.7));
            c.width = c.height = 0; p.cleanup();
            return page(n + 1);
          });
        });
      }
      return page(1).then(function () { doc.destroy(); return { pages: pages, ratio: ratio, apercus: apercus }; });
    });
  }
  window.ReaPdf = { convertir: convertir, MAX_PAGES: MAX_PAGES };
})();
