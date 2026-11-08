/* Réa – Nouveau CHU · position GPS sur le plan interactif.
   - La position est calculée sur le téléphone : elle n'est ni envoyée, ni enregistrée.
   - Le calage (relier des points GPS du bâtiment à des points du plan) est fait une fois par un administrateur,
     puis partagé avec tous. Plus il y a de points, bien répartis, plus le calage est juste :
     on cherche la correspondance (échelle, rotation, décalage) qui colle au mieux à tous les points à la fois. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', MESURE_S = 15, CLE_AVERTI = 'rea.gps-averti';

  function lire(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function ecrire(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage bloqué */ } }
  function svgEl(tag, a, parent) { var e = document.createElementNS(NS, tag); for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]); if (parent) parent.appendChild(e); return e; }
  function sansAccent(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function metres(ref, lat, lon) { return [(lon - ref[1]) * Math.cos(ref[0] * Math.PI / 180) * 111320, -(lat - ref[0]) * 110574]; }

  /* Correspondance mètres → plan par moindres carrés (similitude ; miroir essayé à partir de 3 points) */
  function ajuster(P) {
    if (!P || P.length < 2) return null;
    var ref = P[0].geo, meilleur = null;
    (P.length >= 3 ? [false, true] : [false]).forEach(function (miroir) {
      var src = P.map(function (p) { var m = metres(ref, p.geo[0], p.geo[1]); return miroir ? [m[0], -m[1]] : m; }), dst = P.map(function (p) { return p.plan; }), n = P.length;
      var ms = [0, 0], md = [0, 0], i;
      for (i = 0; i < n; i++) { ms[0] += src[i][0] / n; ms[1] += src[i][1] / n; md[0] += dst[i][0] / n; md[1] += dst[i][1] / n; }
      var nr = 0, ni = 0, de = 0;
      for (i = 0; i < n; i++) {
        var sx = src[i][0] - ms[0], sy = src[i][1] - ms[1], dx = dst[i][0] - md[0], dy = dst[i][1] - md[1];
        nr += dx * sx + dy * sy; ni += dy * sx - dx * sy; de += sx * sx + sy * sy;
      }
      if (de < 100) return; // points trop proches les uns des autres
      var a = [nr / de, ni / de], b = [md[0] - (a[0] * ms[0] - a[1] * ms[1]), md[1] - (a[0] * ms[1] + a[1] * ms[0])];
      var ech = Math.hypot(a[0], a[1]), err = 0, ecarts = [];
      for (i = 0; i < n; i++) {
        var x = a[0] * src[i][0] - a[1] * src[i][1] + b[0], y = a[0] * src[i][1] + a[1] * src[i][0] + b[1], e2 = (x - dst[i][0]) * (x - dst[i][0]) + (y - dst[i][1]) * (y - dst[i][1]);
        err += e2; ecarts.push(Math.sqrt(e2) / ech);
      }
      var t = { a: a, b: b, ref: ref, miroir: miroir, echelle: ech, erreurM: Math.sqrt(err / n) / ech, ecarts: ecarts };
      if (!meilleur || t.erreurM < meilleur.erreurM) meilleur = t;
    });
    return meilleur;
  }
  function versPlan(T, lat, lon) {
    var m = metres(T.ref, lat, lon); if (T.miroir) m[1] = -m[1];
    return [T.a[0] * m[0] - T.a[1] * m[1] + T.b[0], T.a[0] * m[1] + T.a[1] * m[0] + T.b[1]];
  }

  /* Points de calage proposés à l'avance : faciles à reconnaître sur place et bien répartis
     (angles des patios, vus depuis le couloir ; chambres aux quatre extrémités, près de la fenêtre). */
  function pointsProposes(plan) {
    var pieces = plan.pieces(), D = plan.donnees || {}, l = [], fin = [];
    // patios : rectangles [x1, y1, x2, y2] du plan, ou pièces nommées « Patio »
    var patios = (D.patios || []).map(function (b) { return b.slice(0, 4); });
    if (!patios.length) patios = pieces.filter(function (p) { return /patio/.test(sansAccent(p.nom)); }).map(function (p) { return p.bbox; });
    patios.sort(function (a, b) { return Math.round((a[1] + a[3]) / 600) - Math.round((b[1] + b[3]) / 600) || a[0] - b[0]; });
    patios.forEach(function (b, i) {
      var n = 'Patio ' + (i + 1) + ' · angle ';
      fin.push({ nom: n + 'haut gauche', plan: [b[0], b[1]] }, { nom: n + 'haut droit', plan: [b[2], b[1]] }, { nom: n + 'bas droit', plan: [b[2], b[3]] }, { nom: n + 'bas gauche', plan: [b[0], b[3]] });
    });
    // escaliers et monte-malades : faciles à trouver
    var vus = {};
    (D.acces || []).forEach(function (a) {
      if (a.X == null || a.Y == null) return;
      var n = (a.nom || a.cat || 'Accès'); vus[n] = (vus[n] || 0) + 1;
      fin.push({ nom: n + ' ' + vus[n] + ' (devant la porte)', plan: [a.X, a.Y] });
    });
    var ch = pieces.filter(function (p) { return p.type === 'chambre' && p.chambre; });
    if (ch.length) {
      var coins = [[-1, -1, 'en haut à gauche'], [1, -1, 'en haut à droite'], [1, 1, 'en bas à droite'], [-1, 1, 'en bas à gauche']], pris = {};
      coins.forEach(function (c) {
        var m = null, v = -Infinity;
        ch.forEach(function (p) { var s = c[0] * p.centre[0] + c[1] * p.centre[1]; if (s > v && !pris[p.id]) { v = s; m = p; } });
        if (m) { pris[m.id] = 1; l.push({ nom: 'Chambre ' + m.chambre + ' (' + c[2] + '), près de la fenêtre', plan: [Math.round(m.centre[0]), Math.round(m.centre[1])] }); }
      });
    }
    l = l.concat(fin); // d'abord les 4 extrémités (les plus utiles), puis les patios et les accès
    return l.map(function (p) { p.plan = [Math.round(p.plan[0]), Math.round(p.plan[1])]; return p; });
  }

  /* o : { h, zone (conteneur du plan), plan, calage, admin, enregistrer(calage) → Promise } ; renvoie l'élément de commandes */
  function brancher(o) {
    var h = o.h, plan = o.plan, svg = o.zone.querySelector('.plan__svg'); if (!svg) return null;
    var calage = { points: ((o.calage && o.calage.points) || []).slice() }, T = ajuster(calage.points);
    var suivi = null, fixes = [], lat0 = null, lon0 = null, dernier = null, enCalage = false, attenteLibre = false, mesure = null, modifie = false;

    // calque dessiné par-dessus le plan, qui suit le zoom et le déplacement
    var calque = svgEl('svg', { 'class': 'gps-calque', 'aria-hidden': 'true' });
    svg.parentNode.insertBefore(calque, svg.nextSibling);
    function suivre() { calque.setAttribute('viewBox', svg.getAttribute('viewBox') || ''); }
    new MutationObserver(suivre).observe(svg, { attributes: true, attributeFilter: ['viewBox'] }); suivre();
    var mq = {
      cercle: svgEl('circle', { r: 0, fill: 'rgba(64,168,223,.18)', stroke: '#40a8df', 'stroke-width': 3, visibility: 'hidden' }, calque),
      calage: svgEl('g', {}, calque),
      point: svgEl('circle', { r: 14, fill: '#1f6fa8', stroke: '#fff', 'stroke-width': 5, visibility: 'hidden', 'class': 'gps-point' }, calque)
    };

    var etat = h('span', { class: 'gps-pastille', text: T ? 'GPS arrêté' : 'GPS pas encore calé' });
    var bGps = h('button', { type: 'button', class: 'bouton bouton--discret gps-bouton', onclick: basculer, text: '📍 Ma position' });
    var bCentrer = h('button', { type: 'button', class: 'bouton bouton--discret', disabled: true, onclick: function () { if (dernier) plan.centrerSur(dernier.p[0], dernier.p[1], dernier.r); }, text: 'Centrer' });
    var avert = h('div', { class: 'gps-avert', role: 'alertdialog', 'aria-label': 'Précision du GPS', hidden: true },
      h('p', null, h('b', { text: '⚠️ Position indicative' })),
      h('p', { text: 'La précision dépend du modèle de téléphone, du réseau et de l\'endroit où vous êtes : à l\'intérieur, la position peut être décalée de 5 à 20 m, parfois plus. Elle est plus juste près des fenêtres et des patios.' }),
      h('p', { text: 'Votre position reste sur ce téléphone : elle n\'est ni envoyée, ni enregistrée.' }),
      h('div', { class: 'gps-boutons' },
        h('button', { type: 'button', class: 'bouton', onclick: function () { ecrire(CLE_AVERTI, 1); avert.hidden = true; demarrer(); }, text: 'J\'ai compris, activer' }),
        h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { avert.hidden = true; }, text: 'Annuler' })));
    var note = h('p', { class: 'gps-note', hidden: true, text: 'Position indicative (précision variable selon le téléphone et le réseau). Le cercle montre la marge d\'erreur.' });
    var panneau = h('div', { class: 'gps-calage', hidden: true });
    var bCaler = o.admin ? h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { enCalage = !enCalage; dessinerPanneau(); }, text: '⚙ Caler le GPS' }) : null;
    var barre = h('div', { class: 'gps' }, h('div', { class: 'gps-boutons' }, bGps, bCentrer, etat, bCaler), avert, note, panneau);

    function pastille(t, niveau) { etat.textContent = t; etat.className = 'gps-pastille' + (niveau ? ' gps-pastille--' + niveau : ''); }
    function basculer() {
      if (suivi != null) return arreter();
      if (!T && !enCalage) { pastille('GPS pas encore calé par un administrateur', 'mauvais'); return; }
      if (!lire(CLE_AVERTI)) { avert.hidden = false; avert.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
      demarrer();
    }
    function demarrer() {
      if (suivi != null) return;
      if (!navigator.geolocation) { pastille('GPS indisponible sur cet appareil', 'mauvais'); return; }
      bGps.textContent = '📍 Arrêter'; bGps.setAttribute('aria-pressed', 'true'); note.hidden = false; pastille('Recherche du signal…', 'moyen');
      suivi = navigator.geolocation.watchPosition(function (p) {
        if (!barre.isConnected) return arreter();
        var c = p.coords; if (lat0 == null) { lat0 = c.latitude; lon0 = c.longitude; }
        fixes.push({ t: Date.now(), m: metres([lat0, lon0], c.latitude, c.longitude), acc: c.accuracy });
        fixes = fixes.filter(function (f) { return f.t > Date.now() - 60000; });
        pastille('GPS ± ' + Math.round(c.accuracy) + ' m', c.accuracy <= 10 ? 'bon' : c.accuracy <= 25 ? 'moyen' : 'mauvais');
        majPosition(); if (enCalage) dessinerPanneau();
      }, function (e) {
        pastille(e.code === 1 ? 'Accès à la position refusé (réglages du téléphone)' : 'Pas de signal GPS', 'mauvais');
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    }
    function arreter() {
      if (suivi != null && navigator.geolocation) navigator.geolocation.clearWatch(suivi);
      suivi = null; fixes = []; dernier = null; bGps.textContent = '📍 Ma position'; bGps.setAttribute('aria-pressed', 'false'); note.hidden = true;
      pastille(T ? 'GPS arrêté' : 'GPS pas encore calé', ''); majPosition();
    }
    function moyenne(depuisMs) { // moyenne pondérée par la précision annoncée par le téléphone
      var t = Date.now() - depuisMs, sx = 0, sy = 0, sw = 0, acc = 0;
      fixes.forEach(function (f) { if (f.t >= t) { var w = 1 / Math.max(f.acc, 3) / Math.max(f.acc, 3); sx += f.m[0] * w; sy += f.m[1] * w; sw += w; acc += w * f.acc; } });
      if (sw) return { m: [sx / sw, sy / sw], acc: acc / sw };
      var f = fixes[fixes.length - 1];
      return f && f.t > Date.now() - 60000 ? { m: f.m, acc: f.acc } : null;
    }
    function geoDe(m) { return [lat0 - m[1] / 110574, lon0 + m[0] / (Math.cos(lat0 * Math.PI / 180) * 111320)]; }
    function majPosition() {
      var moy = suivi != null ? moyenne(8000) : null; // lissage sur 8 s
      if (!moy || !T) { mq.point.setAttribute('visibility', 'hidden'); mq.cercle.setAttribute('visibility', 'hidden'); bCentrer.disabled = true; return; }
      var g = geoDe(moy.m), p = versPlan(T, g[0], g[1]);
      dernier = { p: p, r: (moy.acc + T.erreurM) * T.echelle };
      [mq.point, mq.cercle].forEach(function (c) { c.setAttribute('cx', p[0].toFixed(1)); c.setAttribute('cy', p[1].toFixed(1)); c.setAttribute('visibility', 'visible'); });
      mq.cercle.setAttribute('r', dernier.r.toFixed(1)); bCentrer.disabled = false;
    }

    /* ---------- Calage (administrateurs) ---------- */
    var proposes = o.admin ? pointsProposes(plan) : [];
    function pointDe(nom) { return calage.points.filter(function (p) { return p.nom === nom; })[0]; }
    function mesurer(nom, xy) {
      if (suivi == null) { ecrire(CLE_AVERTI, 1); demarrer(); }
      var debut = Date.now();
      if (mesure) clearInterval(mesure.minuterie);
      mesure = { nom: nom, reste: MESURE_S, minuterie: setInterval(function () {
        mesure.reste = MESURE_S - Math.floor((Date.now() - debut) / 1000);
        if (mesure.reste > 0) return dessinerPanneau();
        clearInterval(mesure.minuterie); var moy = moyenne(MESURE_S * 1000); mesure = null;
        if (!moy) { dessinerPanneau('Pas de mesure GPS reçue : réessayez (près d\'une fenêtre si possible).'); return; }
        calage.points = calage.points.filter(function (p) { return p.nom !== nom; });
        calage.points.push({ nom: nom, geo: geoDe(moy.m).map(function (v) { return Math.round(v * 1e7) / 1e7; }), plan: [Math.round(xy[0]), Math.round(xy[1])], acc: Math.round(moy.acc) });
        modifie = true; T = ajuster(calage.points); majPosition(); dessinerPanneau();
      }, 250) };
      dessinerPanneau();
    }
    // point libre : toucher le plan
    var depart = null;
    svg.addEventListener('pointerdown', function (e) { depart = [e.clientX, e.clientY]; });
    svg.addEventListener('pointerup', function (e) {
      if (!attenteLibre || !depart || Math.abs(e.clientX - depart[0]) + Math.abs(e.clientY - depart[1]) > 8) return;
      var m = svg.getScreenCTM(); if (!m) return;
      var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; var q = pt.matrixTransform(m.inverse());
      setTimeout(function () { plan.choisir(null); }, 0); // pas de fiche de pièce pendant le calage
      attenteLibre = false;
      var n = 1; while (pointDe('Point libre ' + n)) n++;
      mesurer('Point libre ' + n, [q.x, q.y]);
    });
    function dessinerMarques() {
      mq.calage.replaceChildren();
      if (!enCalage) return;
      var tous = proposes.concat(calage.points.filter(function (p) { return !proposes.some(function (x) { return x.nom === p.nom; }); }));
      tous.forEach(function (p, i) {
        var fait = !!pointDe(p.nom), actif = mesure && mesure.nom === p.nom;
        svgEl('circle', { cx: p.plan[0], cy: p.plan[1], r: actif ? 40 : 26, fill: fait ? '#048e39' : '#fff', stroke: actif ? '#d9600b' : (fait ? '#fff' : '#d9600b'), 'stroke-width': 8 }, mq.calage);
        var t = svgEl('text', { x: p.plan[0] + 34, y: p.plan[1] - 24, 'font-size': 56, 'font-weight': 700, fill: fait ? '#048e39' : '#d9600b', stroke: '#fff', 'stroke-width': 10, 'paint-order': 'stroke' }, mq.calage); t.textContent = String(i + 1);
      });
    }
    function dessinerPanneau(alerte) {
      panneau.hidden = !enCalage; if (bCaler) bCaler.textContent = enCalage ? 'Fermer le calage' : '⚙ Caler le GPS';
      dessinerMarques();
      if (!enCalage) return;
      var tous = proposes.concat(calage.points.filter(function (p) { return !proposes.some(function (x) { return x.nom === p.nom; }); }));
      var ecarts = {}; if (T && calage.points.length >= 3) calage.points.forEach(function (p, i) { ecarts[p.nom] = T.ecarts[i]; });
      var qualite = !T ? (calage.points.length >= 2 ? 'Points trop proches : prenez des points éloignés d\'au moins 20 m.' : 'Mesurez au moins 2 points. Idéal : les 4 chambres des extrémités (points 1 à 4) puis quelques angles de patios, soit 8 points ou plus.')
        : calage.points.length < 3 ? 'Calage à 2 points : utilisable. Ajoutez-en pour gagner en précision et pouvoir vérifier.'
        : 'Écart moyen entre le plan et les mesures : ' + T.erreurM.toFixed(1) + ' m' + (T.erreurM > 10 ? ' : refaites ou retirez les points dont l\'écart est le plus grand.' : ' : bon calage.');
      panneau.replaceChildren.apply(panneau, [
        h('h3', { text: 'Calage du GPS (administrateur)' }),
        h('p', { class: 'section__note', text: 'Allez sur chaque point numéroté (en orange sur le plan), puis touchez « Je suis ici » et ne bougez plus pendant ' + MESURE_S + ' s. Plus il y a de points mesurés, bien répartis, plus la position est juste. Le calage ne contient aucune donnée personnelle.' }),
        alerte ? h('p', { class: 'flash flash--erreur', role: 'alert', text: alerte }) : null,
        mesure ? h('p', { class: 'gps-consigne', role: 'status', text: 'Ne bougez plus : mesure du GPS… ' + mesure.reste + ' s' }) : null,
        h('p', { class: 'gps-qualite', text: calage.points.length + ' point(s) mesuré(s). ' + qualite }),
        h('ol', { class: 'gps-liste' }, tous.map(function (p) {
          var m = pointDe(p.nom), e = ecarts[p.nom];
          return h('li', { class: m ? 'gps-liste__ok' : '' },
            h('span', { class: 'gps-liste__nom', text: p.nom }),
            h('span', { class: 'gps-liste__etat', text: m ? 'Mesuré ± ' + (m.acc || '?') + ' m' + (e != null ? ' · écart ' + e.toFixed(1) + ' m' : '') : 'À mesurer' }),
            h('span', { class: 'gps-boutons' },
              h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { plan.centrerSur(p.plan[0], p.plan[1], 120); }, text: 'Voir' }),
              h('button', { type: 'button', class: 'bouton', disabled: !!mesure, onclick: function () { mesurer(p.nom, p.plan); }, text: m ? 'Refaire' : 'Je suis ici' }),
              m ? h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { calage.points = calage.points.filter(function (x) { return x !== m; }); modifie = true; T = ajuster(calage.points); majPosition(); dessinerPanneau(); }, text: 'Retirer' }) : null));
        })),
        h('div', { class: 'gps-boutons' },
          h('button', { type: 'button', class: 'bouton bouton--discret', disabled: !!mesure, onclick: function () { attenteLibre = true; dessinerPanneau('Touchez sur le plan l\'endroit exact où vous êtes (zoomez si besoin).'); }, text: '+ Point libre (toucher le plan)' }),
          h('button', { type: 'button', class: 'bouton', disabled: !modifie || !!mesure, onclick: function (ev) {
            var b = ev.currentTarget; b.disabled = true; b.textContent = 'Enregistrement…';
            o.enregistrer({ points: calage.points }).then(function () { modifie = false; dessinerPanneau(); pastille('Calage enregistré pour tous', 'bon'); },
              function (e) { dessinerPanneau('Calage non enregistré : ' + ((e && e.message) || 'erreur')); });
          }, text: modifie ? 'Enregistrer pour tous' : 'Calage enregistré' }))].filter(function (x) { return x != null; }));
    }

    return barre;
  }

  window.ReaGps = { brancher: brancher, _ajuster: ajuster, _versPlan: versPlan, _pointsProposes: pointsProposes };
})();
