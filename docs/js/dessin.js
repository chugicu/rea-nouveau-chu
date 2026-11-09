/* Cap NCHUG · outil de dessin du plan (administrateur du service).
   On affiche une image ou un PDF du plan en fond, puis on trace les pièces : rectangles, formes libres, ou
   « baguette magique » (un toucher dans une pièce délimitée par des murs la remplit et en trace le contour).
   Le fond ne quitte jamais cet appareil ; seul le plan dessiné (formes et noms) est envoyé, après le contrôle
   habituel de l'import, dans le Drive privé du service. Le brouillon (sans le fond) est gardé sur l'appareil. */
(function () {
  'use strict';
  var A, h;
  var NS = 'http://www.w3.org/2000/svg', CLE = 'rea.dessin-brouillon', MAX = 1600;
  var TYPES = [['piece', 'Pièce'], ['chambre', 'Chambre'], ['couloir', 'Couloir'], ['circulation', 'Circulation (escalier, ascenseur)'], ['technique', 'Local technique'], ['terrasse', 'Terrasse, patio']];
  var TEINTES = { piece: '#dfe8f5', chambre: '#cfe9d6', couloir: '#f3f1ea', circulation: '#e8def5', technique: '#e6e6e6', terrasse: '#e2f2e0' };
  var OUTILS = [['main', '👆', 'Choisir, déplacer'], ['rect', '▭', 'Rectangle'], ['libre', '✏️', 'Forme libre'], ['baguette', '🪄', 'Baguette magique']];
  var E = null; // état de l'éditeur

  function init() { A = window.ReaApp; h = A.h; }
  function s(tag, attrs, texte) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); }); if (texte != null) e.textContent = texte; return e; }
  function cloner(o) { return JSON.parse(JSON.stringify(o)); }
  function arrondi(v) { return Math.round(v * 10) / 10; }
  function champ(label, el) { return h('div', { class: 'champ' }, h('label', { text: label }), el); }

  /* ---------- Géométrie ---------- */
  function aire(pts) { var a = 0; for (var i = 0, n = pts.length; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
  function boite(pts) { var b = [Infinity, Infinity, -Infinity, -Infinity]; pts.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); return b; }
  function rectPts(b) { return [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]; }
  function estRect(pts) {
    if (pts.length !== 4) return false;
    var b = boite(pts); return pts.every(function (p) { return (Math.abs(p[0] - b[0]) < 0.01 || Math.abs(p[0] - b[2]) < 0.01) && (Math.abs(p[1] - b[1]) < 0.01 || Math.abs(p[1] - b[3]) < 0.01); });
  }
  function centre(pts) { // centre de gravité (repli : centre de la boîte)
    var a = 0, cx = 0, cy = 0;
    for (var i = 0, n = pts.length; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n], f = p[0] * q[1] - q[0] * p[1]; a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
    if (Math.abs(a) < 1e-6) { var b = boite(pts); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
    return [cx / (3 * a), cy / (3 * a)];
  }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
    var x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1]; return Math.sqrt(x * x + y * y);
  }
  function simplifier(pts, eps) { // Douglas-Peucker sur un contour fermé
    if (pts.length < 5) return pts;
    function dp(l) {
      if (l.length < 3) return l;
      var dmax = 0, k = 0; for (var i = 1; i < l.length - 1; i++) { var d = distSeg(l[i], l[0], l[l.length - 1]); if (d > dmax) { dmax = d; k = i; } }
      if (dmax <= eps) return [l[0], l[l.length - 1]];
      var g = dp(l.slice(0, k + 1)), d2 = dp(l.slice(k)); return g.slice(0, -1).concat(d2);
    }
    var loin = 0, dm = -1; pts.forEach(function (p, i) { var d = (p[0] - pts[0][0]) * (p[0] - pts[0][0]) + (p[1] - pts[0][1]) * (p[1] - pts[0][1]); if (d > dm) { dm = d; loin = i; } });
    var a = dp(pts.slice(0, loin + 1)), b = dp(pts.slice(loin).concat([pts[0]]));
    return a.slice(0, -1).concat(b.slice(0, -1));
  }
  function lireChemin(d) { // M, L, H, V, Z (absolus ou relatifs) → points
    var t = String(d || '').match(/[MLHVZmlhvz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [], pts = [], c = null, x = 0, y = 0, i = 0;
    function n() { return Number(t[i++]); }
    while (i < t.length) {
      if (/[A-Za-z]/.test(t[i])) c = t[i++];
      if (c === 'Z' || c === 'z') { continue; }
      if (c === 'M' || c === 'L') { x = n(); y = n(); } else if (c === 'm' || c === 'l') { x += n(); y += n(); }
      else if (c === 'H') x = n(); else if (c === 'h') x += n(); else if (c === 'V') y = n(); else if (c === 'v') y += n();
      else { i++; continue; }
      if (isNaN(x) || isNaN(y)) break; pts.push([x, y]);
      if (c === 'M') c = 'L'; if (c === 'm') c = 'l';
    }
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    return pts;
  }

  /* ---------- Baguette magique : remplissage depuis le point touché, puis contour ---------- */
  function preparerPixels(img) {
    var c = document.createElement('canvas'); c.width = E.w; c.height = E.h;
    var g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, E.w, E.h); g.drawImage(img, 0, 0, E.w, E.h);
    E.pixels = g.getImageData(0, 0, E.w, E.h).data;
  }
  function masqueOccupe() { // pièces déjà tracées : la baguette ne déborde pas dessus
    var c = document.createElement('canvas'); c.width = E.w; c.height = E.h; var g = c.getContext('2d');
    g.fillStyle = '#000';
    E.pieces.forEach(function (p) { g.beginPath(); p.pts.forEach(function (q, i) { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); });
    var d = g.getImageData(0, 0, E.w, E.h).data, m = new Uint8Array(E.w * E.h);
    for (var i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 100 ? 1 : 0;
    return m;
  }
  function eroder(m, w, hh, fois) {
    for (var k = 0; k < fois; k++) {
      var r = new Uint8Array(m.length);
      for (var y = 1; y < hh - 1; y++) for (var x = 1, i = y * w + 1; x < w - 1; x++, i++) r[i] = m[i] && m[i - 1] && m[i + 1] && m[i - w] && m[i + w] ? 1 : 0;
      m = r;
    }
    return m;
  }
  function dilater(m, permis, w, hh, fois) {
    for (var k = 0; k < fois; k++) {
      var r = m.slice();
      for (var y = 1; y < hh - 1; y++) for (var x = 1, i = y * w + 1; x < w - 1; x++, i++) if (!m[i] && permis[i] && (m[i - 1] || m[i + 1] || m[i - w] || m[i + w])) r[i] = 1;
      m = r;
    }
    return m;
  }
  function baguette(x, y) {
    var w = E.w, hh = E.h, px = E.pixels, x0 = Math.round(x), y0 = Math.round(y);
    if (!px || x0 < 1 || y0 < 1 || x0 >= w - 1 || y0 >= hh - 1) return { erreur: 'Touchez à l\'intérieur du plan.' };
    var occ = masqueOccupe(), i0 = y0 * w + x0;
    if (occ[i0]) return { erreur: 'Cet endroit est déjà dans une pièce.' };
    // Couleur de référence : la plus claire autour du point touché (on a pu toucher un texte ou un trait)
    var ref = i0, lmax = -1;
    for (var vy = -6; vy <= 6; vy++) for (var vx = -6; vx <= 6; vx++) {
      var xx = x0 + vx, yy = y0 + vy; if (xx < 0 || yy < 0 || xx >= w || yy >= hh) continue;
      var q0 = yy * w + xx; if (occ[q0]) continue; var l = px[q0 * 4] + px[q0 * 4 + 1] + px[q0 * 4 + 2]; if (l > lmax) { lmax = l; ref = q0; }
    }
    var r0 = px[ref * 4], g0 = px[ref * 4 + 1], b0 = px[ref * 4 + 2], tol = E.tolerance * 3;
    var ok = new Uint8Array(w * hh);
    for (var i = 0, n = w * hh; i < n; i++) if (!occ[i]) { var j = i * 4; ok[i] = Math.abs(px[j] - r0) + Math.abs(px[j + 1] - g0) + Math.abs(px[j + 2] - b0) <= tol ? 1 : 0; }
    var k = E.portes, e = eroder(ok, w, hh, k), dep = i0;
    if (!e[dep]) { // le point touché est trop près d'un mur : on cherche à côté
      dep = -1;
      for (var rr = 1; rr <= k + 4 && dep < 0; rr++) for (var dy = -rr; dy <= rr && dep < 0; dy++) for (var dx = -rr; dx <= rr; dx++) { var q = (y0 + dy) * w + (x0 + dx); if (q > 0 && q < e.length && e[q]) { dep = q; break; } }
      if (dep < 0) return { erreur: 'Zone trop étroite : touchez plus au centre de la pièce, ou baissez « Fermer les ouvertures ».' };
    }
    var reg = new Uint8Array(w * hh), pile = new Int32Array(w * hh), sp = 0, compte = 0, limite = w * hh * 0.35;
    reg[dep] = 1; pile[sp++] = dep;
    while (sp) {
      var c = pile[--sp]; compte++;
      if (compte > limite) return { erreur: 'La zone déborde (porte ouverte ou mur interrompu) : augmentez « Fermer les ouvertures » ou tracez cette pièce à la main.' };
      var cx = c % w;
      if (cx > 0 && e[c - 1] && !reg[c - 1]) { reg[c - 1] = 1; pile[sp++] = c - 1; }
      if (cx < w - 1 && e[c + 1] && !reg[c + 1]) { reg[c + 1] = 1; pile[sp++] = c + 1; }
      if (c >= w && e[c - w] && !reg[c - w]) { reg[c - w] = 1; pile[sp++] = c - w; }
      if (c < w * (hh - 1) && e[c + w] && !reg[c + w]) { reg[c + w] = 1; pile[sp++] = c + w; }
    }
    reg = dilater(reg, ok, w, hh, k);
    var surface = 0; for (var t = 0; t < reg.length; t++) surface += reg[t];
    if (surface < 60) return { erreur: 'Zone trop petite : touchez plus au centre de la pièce.' };
    var pts = contour(reg, w, hh);
    if (pts.length < 3) return { erreur: 'Contour introuvable : tracez cette pièce à la main.' };
    pts = simplifier(pts, 1.3 + k * 0.4);
    var bt = boite(pts), ab = (bt[2] - bt[0]) * (bt[3] - bt[1]);
    if (pts.length < 3 || aire(pts) < 30) return { erreur: 'Contour introuvable : tracez cette pièce à la main.' };
    if (aire(pts) / ab > 0.9) pts = rectPts([bt[0] - 0.5, bt[1] - 0.5, bt[2] + 0.5, bt[3] + 0.5]); // presque rectangulaire : rectangle net
    return { pts: pts.map(function (p) { return [arrondi(p[0]), arrondi(p[1])]; }) };
  }
  function contour(m, w, hh) { // suivi de bord (Moore), contour extérieur de la zone
    var s = -1; for (var i = 0; i < m.length; i++) if (m[i]) { s = i; break; }
    if (s < 0) return [];
    var DX = [-1, -1, 0, 1, 1, 1, 0, -1], DY = [0, -1, -1, -1, 0, 1, 1, 1];
    function dans(x, y) { return x >= 0 && y >= 0 && x < w && y < hh && m[y * w + x]; }
    var cx = s % w, cy = (s / w) | 0, dir = 0, pts = [[cx + 0.5, cy + 0.5]], debut = null, garde = 0;
    while (garde++ < 400000) {
      var trouve = -1;
      for (var k = 1; k <= 8; k++) { var nd = (dir + k) % 8; if (dans(cx + DX[nd], cy + DY[nd])) { trouve = nd; break; } }
      if (trouve < 0) break; // pixel isolé
      cx += DX[trouve]; cy += DY[trouve]; dir = (trouve + 4) % 8;
      var cle = cx + ',' + cy + ',' + dir;
      if (debut === null) debut = cle; else if (cle === debut) break;
      pts.push([cx + 0.5, cy + 0.5]);
    }
    if (pts.length > 1) pts.pop();
    return pts;
  }

  /* ---------- Historique et brouillon ---------- */
  function memoriser() { E.histo.push(cloner({ pieces: E.pieces, unites: E.unites })); if (E.histo.length > 40) E.histo.shift(); }
  function annuler() { var x = E.histo.pop(); if (!x) return; E.pieces = x.pieces; E.unites = x.unites; E.sel = null; sauver(); dessiner(); }
  function sauver() { try { A.stock.ecrire(CLE, { w: E.w, h: E.h, pieces: E.pieces, unites: E.unites, compteur: E.compteur, date: new Date().toISOString() }); } catch (e) { /* stockage plein : le brouillon n'est pas gardé */ } }
  function nouvelId(type) { E.compteur++; return (type === 'chambre' ? 'C' : 'P') + ('00' + E.compteur).slice(-3); }

  /* ---------- Écran ---------- */
  /** o : { retour(texteDuPlan?) } */
  function ouvrir(o) {
    init(); A.definirEcran(null);
    var b = A.stock.lire(CLE);
    E = { o: o, w: 1200, h: 800, fond: null, pixels: null, opacite: 0.75, pieces: [], unites: {}, compteur: 0, sel: null, outil: 'main', zoom: 1,
      tolerance: 40, portes: 2, angles: true, trace: null, histo: [], vue: null };
    if (b && b.pieces && b.pieces.length) { E.w = b.w; E.h = b.h; E.pieces = b.pieces; E.unites = b.unites || {}; E.compteur = b.compteur || b.pieces.length; E.brouillon = b.date; }
    accueil();
  }
  function page(contenu, barre) {
    A.afficher(h('div', { class: 'page page--large dessin' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { if (!E.pieces.length || confirm('Quitter l\'outil de dessin ?\n\nLe brouillon reste gardé sur cet appareil.')) E.o.retour(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: 'Dessiner le plan' }), h('span', { class: 'entete__role', text: 'Administrateur' })),
      contenu, barre || null));
  }

  /* Étape 1 : le fond */
  function accueil(msg) {
    var fichier = h('input', { type: 'file', accept: 'image/png,image/jpeg,application/pdf', 'aria-label': 'Image ou PDF du plan' });
    var etat = h('p', { class: 'section__note', role: 'status', text: msg || '' });
    fichier.addEventListener('change', function () {
      var f = fichier.files && fichier.files[0]; if (!f) return;
      etat.textContent = 'Préparation du fond…';
      chargerFond(f).then(function () { editeur(); }).catch(function (e) { etat.textContent = e && e.message ? e.message : 'Fichier illisible : choisissez une image (PNG, JPEG) ou un PDF.'; });
    });
    page(h('div', null,
      h('section', { class: 'form-carte' }, h('h2', { text: '1. Le fond (facultatif)' }),
        h('p', { class: 'section__note', text: 'Une photo, une capture ou un PDF du plan, pour tracer par-dessus. Il reste sur cet appareil : il n\'est jamais envoyé. Pour la baguette magique, préférez un plan net, murs foncés sur fond clair.' }),
        fichier, etat,
        E.pieces.length ? h('p', { class: 'flash', text: 'Brouillon retrouvé : ' + E.pieces.length + ' pièce(s). Rechargez le même fond pour continuer, ou continuez sans fond.' }) : null),
      h('section', { class: 'form-carte' }, h('h2', { text: 'Ou bien' }),
        h('div', { class: 'gps-boutons' },
          h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { editeur(); }, text: E.pieces.length ? 'Continuer sans fond' : 'Dessiner sans fond (quadrillage)' }),
          h('button', { class: 'bouton bouton--discret', type: 'button', onclick: partirDuPlan, text: 'Partir du plan actuel du service' }),
          E.pieces.length ? h('button', { class: 'bouton bouton--discret bouton--danger', type: 'button', onclick: function () {
            if (!confirm('Effacer le brouillon (' + E.pieces.length + ' pièces) ?')) return; A.stock.effacer(CLE); E.pieces = []; E.unites = {}; E.compteur = 0; accueil('Brouillon effacé.');
          }, text: 'Effacer le brouillon' }) : null)),
      h('section', { class: 'form-carte' }, h('h2', { text: 'Comment ça marche' }),
        h('ul', { class: 'dessin-aide' },
          h('li', { text: '🪄 Baguette magique : touchez l\'intérieur d\'une pièce, son contour est tracé tout seul. Si elle déborde par une porte, augmentez « Fermer les ouvertures ».' }),
          h('li', { text: '▭ Rectangle : glissez d\'un coin à l\'autre.' }),
          h('li', { text: '✏️ Forme libre : touchez chaque coin, puis le premier point (ou « Terminer ») pour fermer.' }),
          h('li', { text: '👆 Choisir : touchez une pièce pour la nommer, la déplacer ou bouger ses coins.' }),
          h('li', { text: 'Pour finir : « Contrôler et importer ». Le plan passe par le même contrôle qu\'un fichier importé.' })))));
  }
  function chargerFond(f) {
    var p = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
      ? (window.ReaPdf && window.ReaPdf.premierePage ? window.ReaPdf.premierePage(f, MAX) : Promise.reject(new Error('Lecture des PDF indisponible.')))
      : new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = ko; r.readAsDataURL(f); });
    return p.then(function (url) {
      return new Promise(function (ok, ko) {
        var img = new Image();
        img.onload = function () {
          var e = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * e), hh = Math.round(img.naturalHeight * e);
          if (E.pieces.length && (Math.abs(w - E.w) > 2 || Math.abs(hh - E.h) > 2) && !confirm('Ce fond n\'a pas la même taille que celui du brouillon : les pièces risquent d\'être décalées. Continuer ?')) return ko(new Error('Choisissez le même fond que pour le brouillon.'));
          if (!E.pieces.length) { E.w = w; E.h = hh; }
          var c = document.createElement('canvas'); c.width = E.w; c.height = E.h; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, E.w, E.h); g.drawImage(img, 0, 0, E.w, E.h);
          E.fond = c.toDataURL('image/jpeg', 0.85); preparerPixels(img); E.outil = 'baguette'; ok();
        };
        img.onerror = function () { ko(new Error('Image illisible.')); };
        img.src = url;
      });
    });
  }
  function partirDuPlan() {
    var sess = A.stock.lire(A.CLE.session) || {};
    if (E.pieces.length && !confirm('Remplacer le brouillon par le plan actuel du service ?')) return;
    A.Api.appeler('plan', { jeton: sess.jeton }).then(function (r) {
      var D = r.donnees || {}, vb = D.viewBox || [0, 0, 1200, 800], n = 0;
      E.w = Math.round(vb[2]); E.h = Math.round(vb[3]); E.unites = cloner(D.unites || {}); E.pieces = [];
      (D.pieces || []).forEach(function (p) {
        var pts = Array.isArray(p.r) ? rectPts(p.r) : lireChemin(p.d); if (pts.length < 3) return;
        if (vb[0] || vb[1]) pts = pts.map(function (q) { return [q[0] - vb[0], q[1] - vb[1]]; });
        E.pieces.push({ id: String(p.id), type: p.type || 'piece', nom: p.nom || '', chambre: p.chambre != null ? String(p.chambre) : '', unite: p.unite || '', pts: pts }); n++;
      });
      E.compteur = n + 1; E.histo = []; sauver(); editeur('Plan actuel chargé : ' + n + ' pièces. Les pièces ajoutées ou renommées dans l\'appli suivront automatiquement.');
    }).catch(function (e) { accueil(A.message(e && e.code)); });
  }

  /* Étape 2 : l'éditeur */
  function editeur(flash) {
    var cadre = h('div', { class: 'dessin-cadre' }), panneau = h('div', { class: 'dessin-panneau' }), info = h('p', { class: 'dessin-info', 'aria-live': 'polite', text: flash || '' });
    var outils = h('div', { class: 'dessin-outils', role: 'toolbar', 'aria-label': 'Outils de dessin' });
    var reglages = h('div', { class: 'dessin-reglages' });
    E.vue = { cadre: cadre, panneau: panneau, info: info, outils: outils, reglages: reglages };
    var barre = h('div', { class: 'dessin-barre' },
      h('button', { type: 'button', class: 'bouton bouton--discret', onclick: annuler, text: '↶ Annuler' }),
      h('button', { type: 'button', class: 'bouton', onclick: terminer, text: 'Contrôler et importer' }));
    page(h('div', null, outils, reglages, info, cadre, panneau, sectionUnites(), sectionListe()), barre);
    dessiner();
    // Zoom de départ : le plan tient dans la largeur de l'écran
    E.zoom = Math.max(0.2, Math.min(3, (cadre.clientWidth - 4) / E.w)); E.zoomMin = E.zoom * 0.8; appliquerZoom();
  }
  function dessinerOutils() {
    var v = E.vue;
    v.outils.replaceChildren.apply(v.outils, OUTILS.map(function (o) {
      var off = o[0] === 'baguette' && !E.pixels;
      return h('button', { type: 'button', class: 'dessin-outil' + (E.outil === o[0] ? ' dessin-outil--actif' : ''), 'aria-pressed': String(E.outil === o[0]), disabled: off, title: off ? 'Chargez d\'abord un fond' : o[2],
        onclick: function () { E.outil = o[0]; E.trace = null; dessiner(); } }, h('span', { 'aria-hidden': 'true', text: o[1] }), h('small', { text: o[2] }));
    }).concat([
      h('button', { type: 'button', class: 'dessin-outil', onclick: function () { E.zoom = Math.min(6, E.zoom * 1.4); appliquerZoom(); } }, h('span', { text: '＋' }), h('small', { text: 'Zoom' })),
      h('button', { type: 'button', class: 'dessin-outil', onclick: function () { E.zoom = Math.max(E.zoomMin || 0.1, E.zoom / 1.4); appliquerZoom(); } }, h('span', { text: '－' }), h('small', { text: 'Dézoom' }))]));
    var r = [];
    if (E.outil === 'baguette') r.push(curseur('Fermer les ouvertures', 0, 20, E.portes, function (x) { E.portes = x; }, function (x) { return x ? x + ' px' : 'non'; }),
      curseur('Tolérance des couleurs', 10, 120, E.tolerance, function (x) { E.tolerance = x; }, function (x) { return x < 30 ? 'stricte' : x > 70 ? 'large' : 'moyenne'; }));
    if (E.outil === 'libre') { var c = h('input', { type: 'checkbox' }); c.checked = E.angles; c.addEventListener('change', function () { E.angles = c.checked; }); r.push(h('label', { class: 'case' }, c, ' Angles droits (aligne sur l\'horizontale et la verticale)')); }
    if (E.fond) r.push(curseur('Fond', 10, 100, Math.round(E.opacite * 100), function (x) { E.opacite = x / 100; var im = v.cadre.querySelector('image'); if (im) im.setAttribute('opacity', E.opacite); }, function (x) { return x + ' %'; }));
    if (E.outil === 'libre' && E.trace && E.trace.pts.length) r.push(h('div', { class: 'gps-boutons' },
      h('button', { type: 'button', class: 'bouton', disabled: E.trace.pts.length < 3, onclick: fermerForme, text: 'Terminer la forme' }),
      h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { E.trace = null; dessiner(); }, text: 'Abandonner' })));
    v.reglages.replaceChildren.apply(v.reglages, r);
  }
  function curseur(label, min, max, val, change, texte) {
    var i = h('input', { type: 'range', min: String(min), max: String(max), value: String(val), 'aria-label': label }), t = h('b', { text: texte(val) });
    i.addEventListener('input', function () { var x = Number(i.value); t.textContent = texte(x); change(x); });
    return h('label', { class: 'dessin-curseur' }, h('span', null, label + ' : ', t), i);
  }
  function appliquerZoom() { var svg = E.vue.cadre.querySelector('svg'); if (svg) { svg.style.width = Math.round(E.w * E.zoom) + 'px'; svg.style.height = Math.round(E.h * E.zoom) + 'px'; } dessinerPoignees(); }
  function couleurPiece(p) { var u = p.unite && E.unites[p.unite]; return u && u.couleur ? u.couleur : TEINTES[p.type] || TEINTES.piece; }
  function dessiner() {
    if (!E.vue) return;
    dessinerOutils();
    var svg = s('svg', { viewBox: '0 0 ' + E.w + ' ' + E.h, class: 'dessin-svg dessin-svg--' + E.outil, role: 'application', 'aria-label': 'Plan en cours de dessin' });
    if (E.fond) svg.appendChild(s('image', { href: E.fond, x: 0, y: 0, width: E.w, height: E.h, opacity: E.opacite, preserveAspectRatio: 'none' }));
    else {
      var defs = s('defs'), pat = s('pattern', { id: 'dessin-grille', width: 20, height: 20, patternUnits: 'userSpaceOnUse' });
      pat.appendChild(s('path', { d: 'M20 0H0V20', fill: 'none', stroke: '#d5dce8', 'stroke-width': 1 })); defs.appendChild(pat); svg.appendChild(defs);
      svg.appendChild(s('rect', { width: E.w, height: E.h, fill: '#fff' })); svg.appendChild(s('rect', { width: E.w, height: E.h, fill: 'url(#dessin-grille)' }));
    }
    var gp = s('g', { class: 'dessin-pieces' });
    E.pieces.forEach(function (p, i) {
      var g = s('g', { 'data-i': i, class: 'dessin-piece' + (E.sel === i ? ' dessin-piece--sel' : '') + (!p.nom && p.type !== 'chambre' || p.type === 'chambre' && !p.chambre ? ' dessin-piece--anonyme' : '') });
      g.appendChild(s('polygon', { points: p.pts.map(function (q) { return q.join(','); }).join(' '), fill: couleurPiece(p), 'fill-opacity': E.fond ? 0.55 : 0.9, stroke: '#223b80', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
      var c = centre(p.pts), b = boite(p.pts), taille = Math.max(8, Math.min(22, (b[2] - b[0]) / 6, (b[3] - b[1]) / 2.5));
      var lib = p.type === 'chambre' ? (p.chambre || '?') : (p.nom || '?');
      g.appendChild(s('text', { x: c[0], y: c[1] + taille * 0.35, 'text-anchor': 'middle', 'font-size': taille, 'font-weight': 700, fill: '#223b80', 'pointer-events': 'none' }, lib.length > 18 ? lib.slice(0, 17) + '…' : lib));
      gp.appendChild(g);
    });
    svg.appendChild(gp);
    svg.appendChild(s('g', { class: 'dessin-poignees' }));
    svg.appendChild(s('g', { class: 'dessin-apercu' }));
    brancher(svg);
    E.vue.cadre.replaceChildren(svg);
    appliquerZoom(); dessinerApercu(); dessinerPanneau(); majListe();
  }
  function dessinerPoignees() {
    var svg = E.vue && E.vue.cadre.querySelector('svg'); if (!svg) return;
    var g = svg.querySelector('.dessin-poignees'); g.replaceChildren();
    if (E.sel == null || E.outil !== 'main' || !E.pieces[E.sel]) return;
    var r = 7 / E.zoom;
    E.pieces[E.sel].pts.forEach(function (q, k) { g.appendChild(s('circle', { cx: q[0], cy: q[1], r: r, 'data-coin': k, class: 'dessin-coin' })); });
  }
  function dessinerApercu() {
    var svg = E.vue.cadre.querySelector('svg'); if (!svg) return;
    var g = svg.querySelector('.dessin-apercu'); g.replaceChildren(); var t = E.trace; if (!t) return;
    if (t.type === 'rect' && t.b) { var b = t.b; g.appendChild(s('rect', { x: Math.min(b[0], b[2]), y: Math.min(b[1], b[3]), width: Math.abs(b[2] - b[0]), height: Math.abs(b[3] - b[1]), class: 'dessin-trace' })); }
    if (t.type === 'libre' && t.pts.length) {
      var l = t.pts.concat(t.souris ? [t.souris] : []);
      g.appendChild(s('polyline', { points: l.map(function (q) { return q.join(','); }).join(' '), class: 'dessin-trace' }));
      t.pts.forEach(function (q, k) { g.appendChild(s('circle', { cx: q[0], cy: q[1], r: (k ? 4 : 8) / E.zoom, class: k ? 'dessin-point' : 'dessin-point dessin-point--premier' })); });
    }
  }
  function point(svg, ev) { var p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; p = p.matrixTransform(svg.getScreenCTM().inverse()); return [Math.max(0, Math.min(E.w, p.x)), Math.max(0, Math.min(E.h, p.y))]; }
  function aligner(p, prec) { // angles droits : on cale sur l'horizontale ou la verticale du point précédent
    if (!E.angles || !prec) return p;
    var dx = Math.abs(p[0] - prec[0]), dy = Math.abs(p[1] - prec[1]);
    return dx > dy * 2.5 ? [p[0], prec[1]] : dy > dx * 2.5 ? [prec[0], p[1]] : p;
  }
  function brancher(svg) {
    var geste = null;
    svg.addEventListener('pointerdown', function (ev) {
      if (ev.button > 0) return;
      var p = point(svg, ev);
      if (E.outil === 'rect') { E.trace = { type: 'rect', b: [p[0], p[1], p[0], p[1]] }; capturer(svg, ev); ev.preventDefault(); return; }
      if (E.outil === 'libre') { ev.preventDefault(); return; }
      if (E.outil === 'baguette') {
        ev.preventDefault(); E.vue.info.textContent = '🪄 Recherche du contour…';
        setTimeout(function () {
          var r = baguette(p[0], p[1]);
          if (r.erreur) { E.vue.info.textContent = '⚠ ' + r.erreur; return; }
          memoriser(); E.pieces.push({ id: nouvelId('piece'), type: 'piece', nom: '', chambre: '', unite: '', pts: r.pts }); E.sel = E.pieces.length - 1; sauver();
          dessiner(); E.vue.info.textContent = 'Pièce ajoutée (' + r.pts.length + ' coins) : nommez-la ci-dessous, ou touchez la pièce suivante.';
        }, 20);
        return;
      }
      // Choisir / déplacer
      var coin = ev.target.getAttribute && ev.target.getAttribute('data-coin');
      if (coin != null && E.sel != null) { memoriser(); geste = { type: 'coin', k: Number(coin), bouge: false }; capturer(svg, ev); ev.preventDefault(); return; }
      var g = ev.target.closest && ev.target.closest('.dessin-piece');
      if (!g) { if (E.sel != null) { E.sel = null; dessiner(); } return; }
      var i = Number(g.getAttribute('data-i'));
      if (E.sel !== i) { E.sel = i; dessiner(); return; }
      geste = { type: 'piece', depart: p, orig: cloner(E.pieces[i].pts), bouge: false }; capturer(svg, ev); ev.preventDefault();
    });
    svg.addEventListener('pointermove', function (ev) {
      var p = point(svg, ev);
      if (E.outil === 'rect' && E.trace && E.trace.b) { E.trace.b[2] = p[0]; E.trace.b[3] = p[1]; dessinerApercu(); return; }
      if (E.outil === 'libre' && E.trace && E.trace.pts.length) { E.trace.souris = aligner(p, E.trace.pts[E.trace.pts.length - 1]); dessinerApercu(); return; }
      if (!geste) return;
      var pc = E.pieces[E.sel]; if (!pc) return;
      if (geste.type === 'coin') { pc.pts[geste.k] = [arrondi(p[0]), arrondi(p[1])]; geste.bouge = true; majForme(); }
      if (geste.type === 'piece') {
        var dx = p[0] - geste.depart[0], dy = p[1] - geste.depart[1];
        if (!geste.bouge && Math.abs(dx) + Math.abs(dy) < 3 / E.zoom) return;
        if (!geste.bouge) { memoriser(); geste.bouge = true; }
        pc.pts = geste.orig.map(function (q) { return [arrondi(q[0] + dx), arrondi(q[1] + dy)]; }); majForme();
      }
    });
    function lacher(ev) {
      if (E.outil === 'rect' && E.trace && E.trace.b) {
        var b = E.trace.b, r = [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])]; E.trace = null;
        if (r[2] - r[0] >= 6 && r[3] - r[1] >= 6) { memoriser(); E.pieces.push({ id: nouvelId('piece'), type: 'piece', nom: '', chambre: '', unite: '', pts: rectPts(r.map(arrondi)) }); E.sel = E.pieces.length - 1; sauver(); E.vue.info.textContent = 'Rectangle ajouté : nommez-le ci-dessous.'; }
        dessiner(); return;
      }
      if (E.outil === 'libre' && ev && ev.type === 'pointerup') {
        var p = point(svg, ev), t = E.trace || (E.trace = { type: 'libre', pts: [] });
        if (t.pts.length >= 3) { var q = t.pts[0]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 14 / E.zoom) return fermerForme(); }
        t.pts.push(aligner([arrondi(p[0]), arrondi(p[1])], t.pts[t.pts.length - 1])); t.souris = null;
        E.vue.info.textContent = t.pts.length < 3 ? 'Touchez le coin suivant.' : 'Touchez le premier point (gros rond) ou « Terminer la forme » pour fermer.';
        dessinerOutils(); dessinerApercu(); return;
      }
      if (geste) { if (geste.bouge) { sauver(); dessiner(); } else if (geste.type === 'coin') E.histo.pop(); geste = null; }
    }
    svg.addEventListener('pointerup', lacher); svg.addEventListener('pointercancel', function () { geste = null; if (E.outil === 'rect') { E.trace = null; dessinerApercu(); } });
  }
  function capturer(svg, ev) { try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignoré */ } }
  function majForme() { // pendant un glissé : on ne redessine que la pièce choisie et ses coins
    var svg = E.vue.cadre.querySelector('svg'), p = E.pieces[E.sel], g = svg.querySelector('.dessin-piece[data-i="' + E.sel + '"]'); if (!g) return;
    g.querySelector('polygon').setAttribute('points', p.pts.map(function (q) { return q.join(','); }).join(' '));
    var c = centre(p.pts), t = g.querySelector('text'), fs = Number(t.getAttribute('font-size')); t.setAttribute('x', c[0]); t.setAttribute('y', c[1] + fs * 0.35);
    dessinerPoignees();
  }
  function fermerForme() {
    var t = E.trace; if (!t || t.pts.length < 3) return;
    memoriser(); E.pieces.push({ id: nouvelId('piece'), type: 'piece', nom: '', chambre: '', unite: '', pts: t.pts }); E.trace = null; E.sel = E.pieces.length - 1; sauver();
    dessiner(); E.vue.info.textContent = 'Forme fermée : nommez-la ci-dessous.';
  }

  /* ---------- Panneau de la pièce choisie ---------- */
  function dessinerPanneau() {
    var v = E.vue, p = E.pieces[E.sel];
    if (!p) { v.panneau.replaceChildren(h('p', { class: 'section__note', text: E.pieces.length ? 'Outil 👆 : touchez une pièce pour la nommer ou la modifier.' : 'Aucune pièce pour l\'instant.' })); return; }
    var type = h('select', { 'aria-label': 'Type' }, TYPES.map(function (t) { var o = h('option', { value: t[0], text: t[1] }); if (t[0] === p.type) o.selected = true; return o; }));
    var nom = h('input', { type: 'text', maxlength: '60', value: p.nom || '', placeholder: p.type === 'chambre' ? 'facultatif' : 'ex. Poste de soins' });
    var num = h('input', { type: 'text', maxlength: '10', value: p.chambre || '', placeholder: 'ex. 101' });
    var unite = h('select', { 'aria-label': 'Unité' }, [h('option', { value: '', text: 'Aucune' })].concat(Object.keys(E.unites).map(function (k) { var o = h('option', { value: k, text: E.unites[k].nom || k }); if (p.unite === k) o.selected = true; return o; })));
    var blocNum = champ('N° de chambre', num); blocNum.hidden = p.type !== 'chambre';
    function maj(ev) {
      memoriser();
      var avant = p.type; p.type = type.value; p.nom = nom.value.trim(); p.chambre = num.value.trim(); p.unite = unite.value;
      if (avant !== p.type && (avant === 'chambre') !== (p.type === 'chambre') && /^[CP]\d+$/.test(p.id)) { var neuf = nouvelId(p.type); if (!E.pieces.some(function (x) { return x.id === neuf; })) p.id = neuf; }
      blocNum.hidden = p.type !== 'chambre'; sauver();
      var g = v.cadre.querySelector('.dessin-piece[data-i="' + E.sel + '"]');
      if (g) { g.querySelector('polygon').setAttribute('fill', couleurPiece(p)); var lib = p.type === 'chambre' ? (p.chambre || '?') : (p.nom || '?'); g.querySelector('text').textContent = lib.length > 18 ? lib.slice(0, 17) + '…' : lib; g.classList.toggle('dessin-piece--anonyme', p.type === 'chambre' ? !p.chambre : !p.nom); }
      majListe(); titre.textContent = 'Pièce ' + p.id;
      if (ev && ev.type === 'change' && ev.target === type) { if (p.type === 'chambre') num.focus(); }
    }
    [type, unite].forEach(function (x) { x.addEventListener('change', maj); }); [nom, num].forEach(function (x) { x.addEventListener('change', maj); });
    var titre = h('h3', { text: 'Pièce ' + p.id });
    v.panneau.replaceChildren(titre,
      h('div', { class: 'grille-2' }, champ('Type', type), Object.keys(E.unites).length ? champ('Unité', unite) : h('span')),
      champ('Nom', nom), blocNum,
      h('div', { class: 'gps-boutons' },
        !estRect(p.pts) ? h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { memoriser(); p.pts = rectPts(boite(p.pts)); sauver(); dessiner(); }, text: 'Rendre rectangulaire' }) : null,
        h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { memoriser(); var c = cloner(p); c.id = nouvelId(c.type); c.nom = ''; c.chambre = ''; c.pts = c.pts.map(function (q) { return [Math.min(E.w, q[0] + 15), Math.min(E.h, q[1] + 15)]; }); E.pieces.push(c); E.sel = E.pieces.length - 1; sauver(); dessiner(); }, text: 'Dupliquer' }),
        h('button', { type: 'button', class: 'bouton bouton--discret bouton--danger', onclick: function () { memoriser(); E.pieces.splice(E.sel, 1); E.sel = null; sauver(); dessiner(); }, text: 'Supprimer' })),
      E.outil !== 'main' ? h('p', { class: 'section__note', text: 'Pour déplacer la pièce ou ses coins, prenez l\'outil 👆.' }) : h('p', { class: 'section__note', text: 'Glissez la pièce pour la déplacer, ou ses ronds pour bouger un coin.' }));
  }

  /* ---------- Unités (facultatives) ---------- */
  function sectionUnites() {
    var corps = h('div');
    function rendu() {
      corps.replaceChildren.apply(corps, Object.keys(E.unites).map(function (k) {
        var u = E.unites[k], nom = h('input', { type: 'text', maxlength: '40', value: u.nom || '', 'aria-label': 'Nom de l\'unité' }), c = h('input', { type: 'color', value: u.couleur || '#e0670f', 'aria-label': 'Couleur' });
        nom.addEventListener('change', function () { memoriser(); u.nom = nom.value.trim(); sauver(); dessiner(); });
        c.addEventListener('change', function () { memoriser(); u.couleur = c.value; sauver(); dessiner(); });
        return h('div', { class: 'dessin-unite' }, c, nom, h('button', { type: 'button', class: 'bouton bouton--discret bouton--danger', 'aria-label': 'Supprimer l\'unité', onclick: function () {
          memoriser(); delete E.unites[k]; E.pieces.forEach(function (p) { if (p.unite === k) p.unite = ''; }); sauver(); rendu(); dessiner();
        }, text: '✕' }));
      }).concat([h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () {
        memoriser(); var n = 1; while (E.unites['u' + n]) n++; E.unites['u' + n] = { nom: 'Unité ' + n, couleur: ['#e0670f', '#2a7de1', '#13a3a0', '#c2185b', '#7b5bd6'][(n - 1) % 5] }; sauver(); rendu(); dessiner();
      }, text: '+ Ajouter une unité' })]));
    }
    rendu();
    return h('details', { class: 'section dessin-details' }, h('summary', { text: 'Unités et couleurs (facultatif)' }),
      h('p', { class: 'section__note', text: 'Seulement si le service est découpé en unités de couleur. Sinon, laissez vide : les jeux s\'adaptent.' }), corps);
  }
  function sectionListe() {
    E.vueListe = h('div');
    return h('details', { class: 'section dessin-details' }, h('summary', { text: 'Liste des pièces' }), E.vueListe);
  }
  function majListe() {
    if (!E.vueListe) return;
    var anonymes = E.pieces.filter(function (p) { return p.type === 'chambre' ? !p.chambre : !p.nom; }).length;
    E.vueListe.replaceChildren(
      h('p', { class: 'section__note', text: E.pieces.length + ' pièce(s)' + (anonymes ? ' · ' + anonymes + ' sans nom ou sans numéro (en pointillés)' : '') }),
      h('ul', { class: 'dessin-liste' }, E.pieces.map(function (p, i) {
        return h('li', null, h('button', { type: 'button', class: 'dessin-liste__item' + (E.sel === i ? ' dessin-liste__item--sel' : ''), onclick: function () { E.sel = i; E.outil = 'main'; dessiner(); E.vue.panneau.scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
          h('b', { text: p.id }), ' ' + (p.type === 'chambre' ? 'Chambre ' + (p.chambre || '?') : (p.nom || '(sans nom)'))));
      })));
  }

  /* ---------- Export vers l'import contrôlé ---------- */
  function versPlan() {
    var unites = {}; Object.keys(E.unites).forEach(function (k) { var u = E.unites[k]; unites[k] = { nom: u.nom || k, couleur: u.couleur || '#e0670f' }; });
    var D = { viewBox: [0, 0, E.w, E.h], pieces: E.pieces.map(function (p) {
      var x = { id: p.id, type: p.type };
      if (p.nom) x.nom = p.nom; if (p.type === 'chambre' && p.chambre) x.chambre = p.chambre; if (p.unite) x.unite = p.unite;
      if (estRect(p.pts)) { var b = boite(p.pts); x.r = b.map(arrondi); }
      else x.d = 'M' + p.pts.map(function (q) { return arrondi(q[0]) + ',' + arrondi(q[1]); }).join(' L') + ' Z';
      return x;
    }), source: 'Outil de dessin Cap NCHUG' };
    if (Object.keys(unites).length) D.unites = unites;
    return D;
  }
  function terminer() {
    if (!E.pieces.length) { E.vue.info.textContent = 'Tracez au moins une pièce.'; return; }
    E.o.retour(JSON.stringify(versPlan()));
  }

  window.ReaDessin = { ouvrir: ouvrir, _test: { baguette: function (x, y) { return baguette(x, y); }, versPlan: function () { return versPlan(); }, etat: function () { return E; }, lireChemin: lireChemin, simplifier: simplifier } };
})();
