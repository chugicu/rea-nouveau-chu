/* Réa – Nouveau CHU · module « Visite virtuelle » (photos 360°)
   Visionneuse Photo Sphere Viewer (vendée dans vendor/photo-sphere-viewer/, jamais chargée depuis un site
   extérieur) : un point = une photo (Drive, jamais sur GitHub) ; des liens entre points (flèches pour se
   déplacer, points d'info) placés par clic direct sur la photo (position horizontale/verticale en % de
   l'image, 0-100). Les référents et l'administrateur peuvent poser, modifier et retirer ces liens ; les
   agents ne voient que la visite.
   Navigation « façon Street View » : le plugin Virtual Tour pose des chevrons au sol vers chaque point voisin
   et enchaîne rotation, zoom léger et fondu. Pour qu'on arrive toujours face à la direction du déplacement,
   chaque photo est tournée vers le nord du plan grâce à son cap (correction de sphère) : les positions
   enregistrées (en % de la photo) ne changent pas, elles sont converties à l'affichage.
   2.7.7 : mini-plan en bas à gauche de la visionneuse (point actuel et cône de vue qui suit le regard) ; un toucher
   l'agrandit sur tout l'étage, et toucher un point du plan y emmène. Le plan est dessiné à partir des points et des
   flèches (couloirs en traits), avec le contour du bâtiment et les patios du plan interactif quand ils sont connus.
   Les positions des points sur le plan (colonnes « X (plan) » et « Y (plan) » de Street – Points) sont dans les
   mêmes unités que le plan interactif ; les fonctions de recherche du point le plus proche servent aussi au
   bonhomme du plan (street-plan.js).
   Utilisation : ReaStreet.creer(conteneur, { points, liens, peutModifier, enregistrerLien(id, donnees),
                                              depart (point d'ouverture), surPoint(id), plan: { contour, patios } }) */
(function () {
  'use strict';
  // Chargée par une balise <script> ordinaire, comme les autres bibliothèques vendues (vendor/qrcode.js…),
  // et non comme un module : le bundle est au format « iife » et pose la variable globale PSV.
  // C'est volontaire. En module, Safari refusait le fichier entier (« Importing a module script failed »)
  // à cause d'une syntaxe que les iPhone d'avant iOS 16.4 ne connaissent pas ; le bundle est désormais
  // construit pour es2020 (voir LISEZ-MOI.txt du dossier), et un script classique est moins exigeant.
  var PSV_JS = 'vendor/photo-sphere-viewer/psv.bundle.min.js';
  var PSV_CSS = 'vendor/photo-sphere-viewer/psv.bundle.min.css';
  // Affichée en cas d'erreur : elle dit tout de suite si l'appareil a bien reçu la dernière version du fichier.
  var VERSION = '2.7.7';
  var cssChargee = false, modulePromesse = null;

  function chargerCss() {
    if (cssChargee || document.querySelector('link[href="' + PSV_CSS + '"]')) return;
    cssChargee = true;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = PSV_CSS; document.head.appendChild(l);
  }
  function chargerModule() {
    return modulePromesse || (modulePromesse = new Promise(function (resoudre, rejeter) {
      if (window.PSV) return resoudre(window.PSV);
      var s = document.createElement('script');
      s.src = PSV_JS;
      s.onload = function () {
        if (window.PSV) resoudre(window.PSV);
        else rejeter(new Error('Fichier reçu mais la visionneuse ne s\'y trouve pas.'));
      };
      s.onerror = function () { rejeter(new Error('Fichier introuvable ou refusé par le navigateur.')); };
      document.head.appendChild(s);
    }));
  }

  function el(tag, attrs, enfants) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] == null) return;
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (enfants || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  // Un identifiant Drive partagé « toute personne disposant du lien » peut être servi directement en image,
  // y compris comme texture WebGL, via ce format de vignette Google (pas de redirection, en-têtes permissifs).
  // Repli prévu si besoin (voir street-view-decisions-et-plan.md, décision 4) : servir la photo depuis l'Apps
  // Script (action dédiée) plutôt que depuis Drive, sans rien changer d'autre dans ce fichier.
  function urlDrive_(id, taille) { return id ? 'https://lh3.googleusercontent.com/d/' + id + '=s' + (taille || 2048) : ''; }
  // Les photos sont déposées en 6144 × 3072 : il faut demander cette taille. Sans elle, Google renvoie une
  // image de 2048 px de large, nettement floue dès qu'on zoome. Les appareils dont WebGL plafonne plus bas
  // (vieux iPhone : 4096) sont gérés par la visionneuse, qui réduit l'image d'elle-même.
  var TAILLE_PHOTO = 6144;

  var DEUX_PI = Math.PI * 2;
  // Cap de l'avant de la caméra, en radians (0 = haut du plan, sens horaire). Les photos sont tournées de
  // -cap (correction de sphère) : le « yaw » de la visionneuse devient alors le cap sur le plan.
  function capRad_(p) { return p && isFinite(p.cap) ? p.cap * Math.PI / 180 : 0; }
  // Position enregistrée (% de la photo, 50 = avant de la caméra) -> angles de la visionneuse.
  function versAngles_(xPct, yPct, cap) { return { yaw: (xPct / 100) * DEUX_PI - Math.PI + (cap || 0), pitch: Math.PI / 2 - (yPct / 100) * Math.PI }; }
  function versPourcent_(yaw, pitch, cap) {
    yaw -= (cap || 0);
    var x = (((yaw + Math.PI) % DEUX_PI + DEUX_PI) % DEUX_PI) / DEUX_PI * 100;
    var y = (Math.PI / 2 - pitch) / Math.PI * 100;
    return { x: Math.max(0, Math.min(100, Math.round(x * 10) / 10)), y: Math.max(0, Math.min(100, Math.round(y * 10) / 10)) };
  }

  function genererId_() {
    var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789', s = 'S';
    for (var i = 0; i < 8; i++) s += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    return s;
  }

  // Garde le message technique du navigateur à côté d'une phrase compréhensible : c'est lui qui permet
  // de dire au premier coup d'œil si le fichier manque, si le réseau est coupé ou si le code est fautif.
  function etiqueter_(e, resume) {
    var detail = e && (e.name || e.message) ? ((e.name ? e.name + ' : ' : '') + (e.message || '')) : String(e);
    var err = e instanceof Error ? e : new Error(detail);
    err.resume = resume; err.detail = detail;
    return err;
  }

  // Pas de « Couloir transversal 1 – Couloir transversal 1 » quand le nom et la zone sont identiques.
  function nomPoint_(points, id) { var p = points[id]; return p ? (p.nom || id) + (p.zone && p.zone !== p.nom ? ' – ' + p.zone : '') : id; }
  function echapper_(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- Position sur le plan : recherche du point le plus proche, tracé des couloirs ---------- */
  var NS_SVG = 'http://www.w3.org/2000/svg';
  // Distance (unités du plan ; deux points voisins sont à environ 140) en deçà de laquelle un point est « touché ».
  var SEUIL_POINT = 100;

  function svgEl_(tag, attrs, parent) {
    var e = document.createElementNS(NS_SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  // Un point a une position sur le plan s'il a deux nombres. (isFinite(null) vaut vrai : on teste le type.)
  function aXY_(p) { return !!p && typeof p.x === 'number' && typeof p.y === 'number' && isFinite(p.x) && isFinite(p.y); }
  // Point le plus proche de (x, y) parmi ceux qui ont une photo et une position ; null au-delà du rayon.
  function plusProche_(points, x, y, rayon) {
    var meilleur = null, dm = Infinity;
    Object.keys(points).forEach(function (id) {
      var p = points[id]; if (!p || !p.photo || !aXY_(p)) return;
      var d = Math.hypot(p.x - x, p.y - y);
      if (d < dm) { dm = d; meilleur = id; }
    });
    return meilleur && dm <= rayon ? { id: meilleur, distance: dm } : null;
  }
  // Couloirs : un trait par paire de points voisins (les flèches existent dans les deux sens, une seule suffit).
  function troncons_(points, liens) {
    var vus = {}, t = [];
    (liens || []).forEach(function (l) {
      if (l.type !== 'fleche') return;
      var a = points[l.depart], b = points[l.arrivee];
      if (!a || !b || !a.photo || !b.photo || !aXY_(a) || !aXY_(b)) return;
      var k = l.depart < l.arrivee ? l.depart + '|' + l.arrivee : l.arrivee + '|' + l.depart;
      if (vus[k]) return; vus[k] = 1; t.push([a.x, a.y, b.x, b.y]);
    });
    return t;
  }
  // Secteur de disque centré sur un cap (0 = haut du plan, sens horaire), demi-angle en radians (< 90°).
  function conePath_(cx, cy, rayon, cap, demi) {
    var a1 = cap - demi, a2 = cap + demi;
    var x1 = cx + rayon * Math.sin(a1), y1 = cy - rayon * Math.cos(a1), x2 = cx + rayon * Math.sin(a2), y2 = cy - rayon * Math.cos(a2);
    return 'M' + cx + ',' + cy + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' A' + rayon + ',' + rayon + ' 0 0 1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' Z';
  }
  // Épaisseur de trait en pixels d'écran, quel que soit le zoom du dessin.
  var TRAIT_FIXE = 'vector-effect:non-scaling-stroke';
  function contourValide_(c) { return Array.isArray(c) && c.length >= 4 && c.slice(0, 4).every(function (n) { return typeof n === 'number' && isFinite(n); }) && c[2] > c[0] && c[3] > c[1]; }
  // Dessin du fond : contour, patios, couloirs, points. Renvoie le cône et le point actuel, à placer ensuite.
  function dessinerPlan_(svg, d) {
    svg.replaceChildren();
    if (contourValide_(d.contour)) svgEl_('rect', { x: d.contour[0], y: d.contour[1], width: d.contour[2] - d.contour[0], height: d.contour[3] - d.contour[1], rx: 14, fill: '#f4f7fb', stroke: '#223b80', 'stroke-width': 2.5, style: TRAIT_FIXE }, svg);
    (d.patios || []).forEach(function (pa) {
      if (contourValide_(pa)) svgEl_('rect', { x: pa[0], y: pa[1], width: pa[2] - pa[0], height: pa[3] - pa[1], rx: 10, fill: '#e3edcb' }, svg);
    });
    d.troncons.forEach(function (t) { svgEl_('line', { x1: t[0], y1: t[1], x2: t[2], y2: t[3], stroke: '#40a8df', 'stroke-width': 3.5, 'stroke-linecap': 'round', style: TRAIT_FIXE }, svg); });
    d.ids.forEach(function (id) { var p = d.points[id]; svgEl_('circle', { cx: p.x, cy: p.y, r: d.rayonPoint, fill: '#fff', stroke: '#223b80', 'stroke-width': 1.5, style: TRAIT_FIXE }, svg); });
    return {
      cone: svgEl_('path', { fill: 'rgba(217,96,11,.38)', stroke: 'rgba(217,96,11,.9)', 'stroke-width': 1.5, style: TRAIT_FIXE }, svg),
      courant: svgEl_('circle', { r: d.rayonCourant, fill: '#d9600b', stroke: '#fff', 'stroke-width': 2.5, style: TRAIT_FIXE }, svg)
    };
  }
  // Ramène un point d'écran en coordonnées du dessin.
  function ecranVersPlan_(svg, cx, cy) {
    var m = svg.getScreenCTM(); if (!m) return null;
    var pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    var q = pt.matrixTransform(m.inverse());
    return [q.x, q.y];
  }
  // Un élément posé par-dessus la visionneuse ne doit rien transmettre à celle-ci (sinon un toucher sur le
  // mini-plan ferait aussi tourner ou cliquer la photo).
  function isoler_(e) {
    ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchmove', 'click', 'dblclick', 'wheel', 'contextmenu']
      .forEach(function (t) { e.addEventListener(t, function (ev) { ev.stopPropagation(); }); });
    return e;
  }

  // Chevron pointant vers le haut : le plugin le pose à plat sur le sol, pointe vers la destination.
  var CHEVRON_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path fill="currentColor" d="M50 14 94 60 80 74 50 44 20 74 6 60Z"/></svg>';
  function elementFleche_(lien) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'street-chevron'; b.innerHTML = CHEVRON_SVG;
    b.setAttribute('aria-label', 'Avancer');
    return b;
  }

  function creer(conteneur, opt) {
    var points = opt.points || {}, liens = (opt.liens || []).slice(), peutModifier = !!opt.peutModifier, enregistrerLien = opt.enregistrerLien;
    // Un point sans photo ne peut pas être affiché : on ne le propose pas.
    var idsTriees = Object.keys(points).filter(function (id) { return points[id].photo; }).sort();
    if (!idsTriees.length) { conteneur.replaceChildren(el('p', { class: 'vide', text: 'Aucun point de prise de vue pour l\'instant.' })); return; }

    var selecteur = el('select', { 'aria-label': 'Aller à…', class: 'street-aller' },
      idsTriees.map(function (id) { return el('option', { value: id, text: nomPoint_(points, id) }); }));
    var boutonModifier = peutModifier ? el('button', { type: 'button', class: 'bouton bouton--discret', text: 'Modifier les liens' }) : null;
    var zoneVisor = el('div', { class: 'street-visor', style: 'height:56vh;position:relative' });
    var zoneAide = el('p', { class: 'section__note street-aide', text: '' });
    var barre = el('div', { class: 'street-barre' }, [selecteur, boutonModifier]);
    conteneur.replaceChildren(barre, zoneVisor, zoneAide);

    // Point d'ouverture : celui demandé (bonhomme posé sur le plan) s'il a une photo, sinon le premier de la liste.
    var visor = null, mp = null, vt = null, enEdition = false, zoomAvant = null, mini = null;
    var idCourant = opt.depart && points[opt.depart] && points[opt.depart].photo ? opt.depart : idsTriees[0];
    selecteur.value = idCourant;

    chargerCss();
    zoneVisor.appendChild(el('div', { class: 'squelette', style: 'height:100%' }));
    // Deux étapes séparées : un échec au chargement du fichier et un échec au démarrage de la visionneuse
    // n'ont ni la même cause ni le même remède. Le détail technique est affiché : sans lui, un simple
    // « hors ligne ? » a déjà fait chercher du côté du réseau un défaut qui était dans le code.
    chargerModule().catch(function (e) { throw etiqueter_(e, 'Le fichier de la visionneuse 360° n\'a pas pu être chargé'); })
      .then(function (PSV) {
        try {
          zoneVisor.replaceChildren();
          visor = new PSV.Viewer({
            container: zoneVisor, navbar: ['zoom', 'caption', 'fullscreen'],
            plugins: [
              [PSV.MarkersPlugin, {}],
              [PSV.VirtualTourPlugin, {
                dataMode: 'client', positionMode: 'manual', renderMode: '3d',
                nodes: idsTriees.map(noeud_), startNodeId: idCourant,
                transitionOptions: transition_,
                arrowStyle: { element: elementFleche_, size: { width: 70, height: 70 } },
                // Pas de préchargement : une photo pèse plusieurs Mo et un vieil iPhone manque vite de mémoire.
                preload: false,
                getLinkTooltip: function (contenu, lien, n) { return echapper_(n.name || ''); }
              }]
            ]
          });
          mp = visor.getPlugin(PSV.MarkersPlugin);
          vt = visor.getPlugin(PSV.VirtualTourPlugin);
          mp.addEventListener('select-marker', surClicMarqueur);
          visor.addEventListener('click', surClicPhoto);
          mini = monterMiniPlan();
          if (mini) { visor.addEventListener('position-updated', mini.regarder); visor.addEventListener('zoom-updated', mini.regarder); }
          vt.addEventListener('node-changed', surNoeud);
          if (vt.getCurrentNode && vt.getCurrentNode()) surNoeud({ node: vt.getCurrentNode() });
        } catch (e) { throw etiqueter_(e, 'La visionneuse 360° n\'a pas pu démarrer'); }
      }).catch(function (e) {
        zoneVisor.replaceChildren(
          el('p', { class: 'vide', text: (e && e.resume) || 'La visionneuse 360° n\'a pas pu être chargée.' }),
          el('p', { class: 'section__note', style: 'text-align:center', text: ((e && e.detail) || '') + ' (version ' + VERSION + ')' }),
          el('p', { class: 'section__note', style: 'text-align:center', text: 'Si le problème persiste, fermez puis rouvrez l\'application pour en recevoir la dernière version.' }));
      });

    selecteur.addEventListener('change', function () { aller(selecteur.value); });
    if (boutonModifier) boutonModifier.addEventListener('click', function () {
      enEdition = !enEdition;
      boutonModifier.textContent = enEdition ? 'Terminer la modification' : 'Modifier les liens';
      zoneAide.textContent = enEdition ? 'Touchez la photo à l\'endroit voulu pour poser une flèche ou un point d\'info. Touchez un repère existant pour le modifier ou le retirer.' : '';
      zoneVisor.classList.toggle('street-visor--edition', enEdition);
      var ancienne = conteneur.querySelector('.street-formulaire'); if (ancienne && !enEdition) ancienne.remove();
      dessinerMarqueurs();
    });

    function liensDe(id) { return liens.filter(function (l) { return l.depart === id; }); }

    // Une photo = un nœud de la visite. Elle est tournée de -cap : à l'écran, la direction regardée est
    // alors la même d'une photo à l'autre, et on arrive face à la direction du déplacement.
    function noeud_(id) {
      var nom = nomPoint_(points, id);
      return { id: id, panorama: urlDrive_(points[id].photo, TAILLE_PHOTO), name: nom, caption: nom,
        sphereCorrection: { pan: -capRad_(points[id]) }, links: flechesDe(id) };
    }
    // Les flèches de navigation (chevrons du plugin) : uniquement vers un point qui a une photo.
    function flechesDe(id) {
      var cap = capRad_(points[id]);
      return liensDe(id).filter(function (l) { return l.type === 'fleche' && points[l.arrivee] && points[l.arrivee].photo; })
        .map(function (l) { var a = versAngles_(l.x, l.y, cap); return { nodeId: l.arrivee, position: { yaw: a.yaw, pitch: a.pitch }, data: l }; });
    }

    // Rotation vers la flèche touchée, léger zoom avant et fondu en un seul mouvement ; changement par la liste = fondu simple.
    function transition_(versNoeud, depuisNoeud, depuisLien) {
      var t = { showLoader: true, effect: 'fade', rotation: !!depuisLien, speed: depuisLien ? 1400 : 700 };
      if (depuisLien && visor) { zoomAvant = visor.getZoomLevel(); t.zoomTo = Math.min(100, zoomAvant + 12); }
      return t;
    }

    function aller(id) {
      if (!points[id] || !vt) return;
      vt.setCurrentNode(id, { rotation: false }).catch(function () {});
    }

    /* ----- Mini-plan : où l'on est et vers où l'on regarde ----- */
    // Petit plan dans le coin bas-gauche (zone proche, nord en haut) ; un toucher l'agrandit sur tout l'étage,
    // et toucher un point du plan y emmène. Rien n'est affiché si le point courant n'a pas de position.
    function monterMiniPlan() {
      var rayonMini = 430;          // demi-largeur de la zone montrée dans le petit plan (unités du plan)
      var avecXY = idsTriees.filter(function (id) { return aXY_(points[id]); });
      if (avecXY.length < 2) return null;
      var decor = opt.plan || {};
      var cap = 0, demiCone = 0.6, courantId = idCourant, planifie = false, grand = null, troncons = troncons_(points, liens);

      // Zone montrée en grand : tout l'étage (contour du plan) ou, à défaut, l'étendue des points avec une marge.
      function zoneGrand() {
        if (contourValide_(decor.contour)) { var c = decor.contour; return [c[0] - 30, c[1] - 30, c[2] - c[0] + 60, c[3] - c[1] + 60]; }
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        avecXY.forEach(function (id) { var p = points[id]; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
        return [x0 - 150, y0 - 150, x1 - x0 + 300, y1 - y0 + 300];
      }
      function donneesPlan(rayonPoint, rayonCourant) {
        return { points: points, ids: avecXY.filter(function (id) { return points[id].photo; }), troncons: troncons, contour: decor.contour, patios: decor.patios, rayonPoint: rayonPoint, rayonCourant: rayonCourant };
      }

      var racine = isoler_(el('div', { class: 'street-mini', role: 'button', tabindex: '0', 'aria-label': 'Plan du service : agrandir', title: 'Agrandir le plan' }));
      var svgMini = svgEl_('svg', { 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMid slice' });
      racine.appendChild(svgMini);
      racine.appendChild(el('span', { class: 'street-mini__agrandir', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>' }));
      var refsMini = null;
      function tracerMini() { refsMini = dessinerPlan_(svgMini, donneesPlan(14, 26)); placer(); }
      function placer() {
        var p = points[courantId];
        if (!aXY_(p)) { racine.hidden = true; return; }
        racine.hidden = false;
        svgMini.setAttribute('viewBox', (p.x - rayonMini) + ' ' + (p.y - rayonMini) + ' ' + (2 * rayonMini) + ' ' + (2 * rayonMini));
        [[refsMini, 260], [grand && grand.refs, 330]].forEach(function (r) {
          if (!r[0]) return;
          r[0].courant.setAttribute('cx', p.x); r[0].courant.setAttribute('cy', p.y);
          r[0].cone.setAttribute('d', conePath_(p.x, p.y, r[1], cap, demiCone));
        });
      }
      // Le cône suit le regard : le yaw de la visionneuse est le cap sur le plan (photos tournées vers le nord du plan).
      function lire() {
        planifie = false;
        try {
          var pos = visor.getPosition(); if (pos && isFinite(pos.yaw)) cap = pos.yaw;
          var f = visor.state && visor.state.hFov; if (typeof f === 'number' && isFinite(f)) demiCone = Math.max(0.3, Math.min(1.2, (f * Math.PI / 180) / 2));
        } catch (e) { /* on garde la dernière direction connue */ }
        placer();
      }
      function regarder() { if (planifie) return; planifie = true; (window.requestAnimationFrame || window.setTimeout)(lire); }

      function agrandir() {
        if (grand) return;
        var fond = isoler_(el('div', { class: 'street-grand', role: 'dialog', 'aria-label': 'Plan du service' }));
        var fermer = el('button', { type: 'button', class: 'street-grand__fermer', 'aria-label': 'Fermer le plan', text: '×' });
        var legende = el('p', { class: 'street-grand__legende', 'aria-live': 'polite', text: 'Touchez un point du plan pour y aller.' });
        var z = zoneGrand();
        var svg = svgEl_('svg', { class: 'street-grand__svg', viewBox: z.join(' '), 'aria-label': 'Plan de l\'étage' });
        fond.appendChild(el('div', { class: 'street-grand__entete' }, [el('strong', { text: 'Où aller ?' }), fermer]));
        fond.appendChild(svg); fond.appendChild(legende);
        var refs = dessinerPlan_(svg, donneesPlan(20, 34));
        var anneau = svgEl_('circle', { r: 46, fill: 'rgba(217,96,11,.18)', stroke: '#d9600b', 'stroke-width': 3, visibility: 'hidden', style: TRAIT_FIXE }, svg);
        grand = { fond: fond, refs: refs };
        var cible = null;
        function viser(e) {
          var q = ecranVersPlan_(svg, e.clientX, e.clientY), c = q ? plusProche_(points, q[0], q[1], SEUIL_POINT + 20) : null;
          cible = c && c.id;
          if (cible) { anneau.setAttribute('cx', points[cible].x); anneau.setAttribute('cy', points[cible].y); anneau.setAttribute('visibility', 'visible'); legende.textContent = nomPoint_(points, cible); }
          else { anneau.setAttribute('visibility', 'hidden'); legende.textContent = 'Pas de photo ici. Touchez un point du plan.'; }
        }
        svg.addEventListener('pointerdown', function (e) { try { svg.setPointerCapture(e.pointerId); } catch (x) { /* ignoré */ } viser(e); });
        svg.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') viser(e); });
        svg.addEventListener('pointerup', function (e) { viser(e); var id = cible; if (id) { fermerGrand(); if (id !== idCourant) aller(id); } });
        svg.addEventListener('pointercancel', function () { cible = null; anneau.setAttribute('visibility', 'hidden'); });
        fermer.addEventListener('click', fermerGrand);
        zoneVisor.appendChild(fond); placer(); fermer.focus();
      }
      function fermerGrand() { if (!grand) return; grand.fond.remove(); grand = null; racine.focus(); }
      function surTouche(e) {
        if (e.key === 'Escape' && grand) { e.stopPropagation(); fermerGrand(); }
        else if ((e.key === 'Enter' || e.key === ' ') && e.target === racine) { e.preventDefault(); agrandir(); }
      }
      racine.addEventListener('click', agrandir);
      zoneVisor.addEventListener('keydown', surTouche);

      zoneVisor.appendChild(racine);
      tracerMini(); lire();
      return {
        maj: function (id) { courantId = id; placer(); regarder(); },
        regarder: regarder,
        // Une flèche posée ou retirée change les couloirs dessinés.
        rafraichir: function () {
          troncons = troncons_(points, liens); tracerMini();
          if (grand) { var ouvert = grand; fermerGrand(); if (ouvert) agrandir(); }
        }
      };
    }

    // Arrivée sur une photo : liste à jour, repères redessinés, zoom ramené doucement à son niveau d'avant.
    function surNoeud(e) {
      if (!e || !e.node) return;
      idCourant = e.node.id; selecteur.value = idCourant;
      dessinerMarqueurs();
      if (mini) mini.maj(idCourant);
      if (opt.surPoint) { try { opt.surPoint(idCourant); } catch (err) { /* sans importance pour la visite */ } }
      if (zoomAvant != null && visor) {
        var z = zoomAvant; zoomAvant = null;
        try { visor.animate({ zoom: z, speed: 700 }).catch(function () {}); } catch (err) { /* sans importance */ }
      }
    }

    // Repères posés par-dessus la photo : points d'info toujours ; flèches seulement en mode modification
    // (en visite, les flèches sont les chevrons du plugin).
    function dessinerMarqueurs() {
      if (!mp) return;
      mp.clearMarkers();
      var cap = capRad_(points[idCourant]);
      liensDe(idCourant).forEach(function (l) {
        if (l.type === 'fleche' && !enEdition) return;
        var a = versAngles_(l.x, l.y, cap);
        mp.addMarker({
          id: l.id, position: { yaw: a.yaw, pitch: a.pitch },
          html: l.type === 'fleche' ? CHEVRON_SVG : 'ℹ️',
          className: 'street-marqueur street-marqueur--' + l.type,
          tooltip: l.type === 'fleche' ? ('Aller vers ' + echapper_(nomPoint_(points, l.arrivee))) : echapper_(l.texte || 'Information'),
          data: l
        });
      });
    }

    function surClicMarqueur(e) {
      var l = e.marker.data;
      if (enEdition) return ouvrirFormulaire(l);
      zoneAide.textContent = l.texte || '';
    }

    // Pose d'un nouveau lien : clic sur la photo en mode édition (hors clic sur un repère existant).
    function surClicPhoto(e) {
      if (!enEdition || !e || !e.data || e.data.rightclick) return;
      var pct = versPourcent_(e.data.yaw, e.data.pitch, capRad_(points[idCourant]));
      ouvrirFormulaire({ id: genererId_(), depart: idCourant, type: 'fleche', arrivee: '', x: pct.x, y: pct.y, texte: '', neuf: true });
    }

    function ouvrirFormulaire(l) {
      var estNeuf = !!l.neuf;
      var ancienne = conteneur.querySelector('.street-formulaire'); if (ancienne) ancienne.remove();
      var type = el('select', { 'aria-label': 'Type' }, [el('option', { value: 'fleche', text: 'Flèche (aller vers…)' }), el('option', { value: 'info', text: 'Point d\'info' })]);
      type.value = l.type || 'fleche';
      var champCible = el('div', { class: 'champ' }, [el('label', { text: 'Point d\'arrivée' }),
        el('select', { 'aria-label': 'Point d\'arrivée' },
          idsTriees.filter(function (id) { return id !== idCourant; }).map(function (id) { return el('option', { value: id, text: nomPoint_(points, id) }); }))]);
      var cible = champCible.querySelector('select'); if (l.arrivee) cible.value = l.arrivee;
      var champTexte = el('div', { class: 'champ' }, [el('label', { text: 'Texte' }), el('textarea', { rows: '2', maxlength: '300', placeholder: 'Texte affiché (point d\'info)' })]);
      var texte = champTexte.querySelector('textarea'); texte.value = l.texte || '';
      function majAffichage() { champCible.hidden = type.value !== 'fleche'; champTexte.hidden = type.value !== 'info'; }
      type.addEventListener('change', majAffichage);
      var erreur = el('p', { class: 'message-erreur', role: 'alert' });
      var boutonSupprimer = estNeuf ? null : el('button', { type: 'button', class: 'bouton bouton--discret', text: 'Retirer ce lien' });
      var boite = el('form', { class: 'form-carte street-formulaire', novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        var d = { depart: idCourant, type: type.value, arrivee: type.value === 'fleche' ? cible.value : '', x: l.x, y: l.y, texte: texte.value.trim() };
        if (d.type === 'info' && d.texte.length < 2) { erreur.textContent = 'Texte trop court.'; return; }
        envoyer(l.id, d, boite);
      } },
        [el('h3', { text: estNeuf ? 'Nouveau lien' : 'Modifier ce lien' }), el('div', { class: 'champ' }, [el('label', { text: 'Type' }), type]), champCible, champTexte, erreur,
          el('div', { class: 'street-formulaire__actions' }, [
            el('button', { class: 'bouton', type: 'submit', text: 'Enregistrer' }),
            boutonSupprimer,
            el('button', { type: 'button', class: 'bouton bouton--discret', text: 'Annuler', onclick: function () { boite.remove(); } })
          ])]);
      majAffichage();
      if (boutonSupprimer) boutonSupprimer.addEventListener('click', function () { envoyer(l.id, null, boite); });
      conteneur.appendChild(boite); boite.scrollIntoView({ block: 'nearest' });
    }

    function envoyer(id, d, form) {
      var b = form.querySelector('[type=submit]'); if (b) b.disabled = true;
      enregistrerLien(id, d).then(function () {
        if (d == null) liens = liens.filter(function (l) { return l.id !== id; });
        else { var i = liens.map(function (l) { return l.id; }).indexOf(id); if (i >= 0) liens[i] = Object.assign({ id: id }, d); else liens.push(Object.assign({ id: id }, d)); }
        form.remove();
        if (vt) vt.updateNode({ id: idCourant, links: flechesDe(idCourant) });
        dessinerMarqueurs();
        if (mini) mini.rafraichir();
      }).catch(function (e) {
        if (b) b.disabled = false;
        form.querySelector('.message-erreur').textContent = (e && e.message) || 'Enregistrement impossible.';
      });
    }
  }

  window.ReaStreet = {
    creer: creer, version: VERSION,
    // Utilisés aussi par le bonhomme du plan interactif (street-plan.js)
    seuilPoint: SEUIL_POINT, plusProche: plusProche_, aPosition: aXY_, troncons: troncons_, nomPoint: nomPoint_
  };
})();
