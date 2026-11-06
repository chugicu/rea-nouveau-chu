/* Réa – Nouveau CHU · module « Plan du service »
   - affichage Texte ou Icônes, vue par catégorie (le reste est grisé)
   - recherche (numéro de chambre, nom de pièce), zoom et déplacement au doigt
   - fiche d'une pièce ; pour les référents et l'administrateur : nommer une pièce,
     choisir sa catégorie, son icône et sa couleur, ou la couleur de toute une catégorie.
   Utilisation : ReaPlan.creer(conteneur, { donnees, reglages, peutModifier, enregistrerPiece, enregistrerCategorie })
   - donnees : géométrie du plan (fichier plan-donnees.json, servi par le moteur, jamais publié sur GitHub)
   - reglages : { pieces: {id: {nom, precision, categorie, icone, couleur}}, categories: {cat: {couleur}} } */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  /* ---------- Catalogue ---------- */
  var CATEGORIES = [
    { id: 'poste', nom: 'Postes de soins', couleur: '#1f6fa8', icone: 'poste' },
    { id: 'soins', nom: 'Soins', couleur: '#2f86c9', icone: 'soins' },
    { id: 'bureau', nom: 'Bureaux', couleur: '#5b5fb0', icone: 'bureau' },
    { id: 'personnel', nom: 'Personnel', couleur: '#7b3fc4', icone: 'personnel' },
    { id: 'familles', nom: 'Familles', couleur: '#c2416f', icone: 'familles' },
    { id: 'logistique', nom: 'Logistique', couleur: '#2e8a55', icone: 'reserve' },
    { id: 'technique', nom: 'Technique', couleur: '#8a6d3b', icone: 'technique' },
    { id: 'urgence', nom: 'Urgence', couleur: '#d93a2f', icone: 'urgence' },
    { id: 'exterieur', nom: 'Extérieur', couleur: '#7f8c9d', icone: 'exterieur' },
    { id: 'autre', nom: 'Autre', couleur: '#6b7586', icone: 'autre' }
  ];
  var CAT = {}; CATEGORIES.forEach(function (c) { CAT[c.id] = c; });

  // Pictogrammes filaires (repère : cercle de rayon 15 centré en 0,0)
  var GLYPHES = {
    poste: '<rect x="-9" y="-9" width="18" height="18" rx="3" stroke-width="2.4" fill="none"/><path d="M-5 0h10M0-5v10" stroke-width="3"/>',
    soins: '<path d="M-7 0h14M0-7v14" stroke-width="4"/>',
    bureau: '<rect x="-8" y="-6" width="16" height="11" rx="1.5" stroke-width="2.4" fill="none"/><path d="M-4 9h8M0 5v4" stroke-width="2.4"/>',
    personnel: '<circle cx="0" cy="-4" r="3.6" stroke-width="2.6" fill="none"/><path d="M-7 8c0-5 3-7 7-7s7 2 7 7" stroke-width="2.6" fill="none"/>',
    garde: '<path d="M-9 6v-9M-9 1h18v5M9 1v-3a3 3 0 0 0-3-3H-1v6" stroke-width="2.4" fill="none"/><circle cx="-5" cy="-2" r="2" stroke-width="2" fill="none"/>',
    familles: '<path d="M0 7l-6.5-6.5a4 4 0 1 1 6.5-4.5a4 4 0 1 1 6.5 4.5z" stroke-width="2.4" fill="none"/>',
    vestiaire: '<path d="M0-6a2.5 2.5 0 1 1 2.5 2.5L0-2l-9 7h18L0-2" stroke-width="2.2" fill="none"/>',
    office: '<path d="M-7-3h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z M4-1h2a2.5 2.5 0 0 1 0 5h-2" stroke-width="2.2" fill="none"/><path d="M-4-9v3M0-9v3" stroke-width="2"/>',
    linge: '<path d="M-4-8l-6 4 2 4 2-1v9h12v-9l2 1 2-4-6-4a4 4 0 0 1-8 0z" stroke-width="2" fill="none"/>',
    reserve: '<path d="M-8-4l8-4 8 4v9l-8 4-8-4z M-8-4l8 4 8-4M0 0v9" stroke-width="2.2" fill="none"/>',
    menage: '<path d="M-7-2h14l-2 10h-10z M-4-2v-3a4 4 0 0 1 8 0v3" stroke-width="2.2" fill="none"/>',
    pharmacie: '<rect x="-9" y="-4" width="18" height="8" rx="4" stroke-width="2.4" fill="none"/><path d="M0-4v8" stroke-width="2.4"/>',
    technique: '<circle r="3.5" stroke-width="2.4" fill="none"/><path d="M0-9v3M0 6v3M-9 0h3M6 0h3M-6.4-6.4l2.1 2.1M4.3 4.3l2.1 2.1M-6.4 6.4l2.1-2.1M4.3-4.3l2.1-2.1" stroke-width="2.4"/>',
    reunion: '<circle cx="-4.5" cy="-4" r="2.8" stroke-width="2.2" fill="none"/><circle cx="4.5" cy="-4" r="2.8" stroke-width="2.2" fill="none"/><path d="M-10 7c0-4 2-6 5.5-6s5.5 2 5.5 6M0 7c0-4 2-6 5.5-6s4.5 2 4.5 6" stroke-width="2.2" fill="none"/>',
    simulation: '<path d="M-5-8v16l13-8z" stroke-width="2.4" fill="none"/>',
    urgence: '<path d="M2-9l-7 10h6l-2 8 7-10h-6z" stroke-width="2" fill="#fff"/>',
    dae: '<path d="M0 8l-7-7a4.3 4.3 0 1 1 7-5a4.3 4.3 0 1 1 7 5z" stroke-width="2.2" fill="none"/><path d="M1-4l-3 4h3l-2 4" stroke-width="2"/>',
    wc: '<path d="M-8-6l2 12 2-8 2 8 2-12M4-6v12h5" stroke-width="2" fill="none"/>',
    exterieur: '<path d="M0 9V-1M0-1c-6 0-8-4-8-8 4 0 8 2 8 8zM0 2c5 0 7-3 7-7-4 0-7 2-7 7z" stroke-width="2.2" fill="none"/>',
    ascenseur: '<rect x="-7.5" y="-9" width="15" height="18" rx="2.5" stroke-width="2.4" fill="none"/><path d="M-3.4-1.6L0-5.6 3.4-1.6Z M-3.4 1.6L0 5.6 3.4 1.6Z" fill="#fff" stroke-width="1"/>',
    escalier: '<path d="M-7 7v-5h4.5v-4.5h4.5v-4.5h5" stroke-width="2.8" fill="none"/>',
    autre: '<circle r="2" fill="#fff" stroke-width="0"/><circle cx="-6" r="2" fill="#fff" stroke-width="0"/><circle cx="6" r="2" fill="#fff" stroke-width="0"/>'
  };
  var NOMS_ICONES = { poste: 'Poste de soins', soins: 'Soins', bureau: 'Bureau', personnel: 'Personnel', garde: 'Garde', familles: 'Familles',
    vestiaire: 'Vestiaire', office: 'Office, repas', linge: 'Linge', reserve: 'Réserve', menage: 'Ménage', pharmacie: 'Pharmacie',
    technique: 'Technique', reunion: 'Réunion', simulation: 'Simulation', urgence: 'Urgence', dae: 'DAE', wc: 'Sanitaires', exterieur: 'Extérieur', autre: 'Autre' };
  var PALETTE = ['#1f6fa8', '#2f86c9', '#0e8f86', '#24934f', '#7fa31a', '#c99a00', '#d9600b', '#d93a2f', '#c2416f', '#7b3fc4', '#5b5fb0', '#6b7586'];
  var GRIS = { usic: ['#c9cfd9', '#9aa3b1'], usinv: ['#98a1b0', '#717b8b'] };

  /* ---------- Outils ---------- */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, attrs) { // HTML sûr : jamais d'innerHTML avec des données saisies
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null || c === false) continue;
      (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); }); }
    return e;
  }
  function melange(hex, part) { // éclaircit une couleur vers le blanc (part = proportion de couleur)
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var f = function (c) { return Math.round(255 - (255 - c) * part); };
    return '#' + [f(r), f(g), f(b)].map(function (c) { return ('0' + c.toString(16)).slice(-2); }).join('');
  }
  function icone(parent, nom, x, y, taille, couleur) {
    var g = el('g', { transform: 'translate(' + x.toFixed(0) + ' ' + y.toFixed(0) + ') scale(' + taille.toFixed(2) + ')', 'class': 'plan-icone' }, parent);
    el('circle', { r: 15, fill: couleur, stroke: '#fff', 'stroke-width': 3 }, g);
    var t = document.createElementNS(NS, 'g');
    t.setAttribute('stroke', '#fff'); t.setAttribute('stroke-linecap', 'round'); t.setAttribute('stroke-linejoin', 'round');
    t.innerHTML = GLYPHES[nom] || GLYPHES.autre; // constantes internes uniquement
    g.appendChild(t);
    return g;
  }
  function remplir(cible) { cible.replaceChildren.apply(cible, Array.prototype.slice.call(arguments, 1).filter(function (x) { return x != null && x !== false; })); }
  function iconeHTML(nom, couleur) { // petit pictogramme pour les listes et le formulaire
    var s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '-17 -17 34 34'); s.setAttribute('aria-hidden', 'true');
    icone(s, nom, 0, 0, 1, couleur || '#4c5a7a'); return s;
  }

  /* ---------- Composant ---------- */
  function creer(racine, opt) {
    var D = opt.donnees, R = opt.reglages || { pieces: {}, categories: {} };
    R.pieces = R.pieces || {}; R.categories = R.categories || {};
    // Format compact : rectangle « r » à la place du chemin « d » ; boîte et centre recalculés si absents
    D.pieces.forEach(function (p) {
      if (!p.d && p.r) p.d = 'M' + p.r[0] + ',' + p.r[1] + ' H' + p.r[2] + ' V' + p.r[3] + ' H' + p.r[0] + 'Z';
      if (!p.bbox) {
        if (p.r) p.bbox = p.r.slice();
        else { var n = (p.d.match(/-?\d+(\.\d+)?/g) || []).map(Number), xs = [], ys = [], cx = 0, cy = 0;
          // M x,y L x,y … (les contours non rectangulaires n'utilisent que M et L)
          for (var i = 0; i + 1 < n.length; i += 2) { xs.push(n[i]); ys.push(n[i + 1]); }
          p.bbox = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]; }
      }
      if (!p.centre) p.centre = [(p.bbox[0] + p.bbox[2]) / 2, (p.bbox[1] + p.bbox[3]) / 2];
    });
    var VB0 = D.viewBox.slice();
    // Vue de départ : l'aile réanimation (moitié nord), titres compris
    var VUE_REA = [VB0[0], VB0[1], VB0[2], Math.min(VB0[3], (D.batiment[1] + 1500) - VB0[1])];
    var etat = { mode: opt.mode === 'icones' ? 'icones' : 'texte', filtre: 'tout', choix: null, vb: null };

    /* Infos effectives d'une pièce (réglages des référents > données du plan) */
    function infos(p) {
      var r = R.pieces[p.id] || {};
      var cat = r.categorie || p.categorie || null;
      var nom = r.nom != null && r.nom !== '' ? r.nom : p.nom;
      if (!r.categorie && nom === 'Poste de soins') cat = 'poste';
      var icone = r.icone || (cat === 'poste' ? 'poste' : (cat && CAT[cat] ? CAT[cat].icone : null));
      if (!r.icone && nom) { // icônes plus parlantes pour quelques noms connus
        var n = nom.toLowerCase();
        if (/garde/.test(n)) icone = 'garde'; else if (/vestiaire/.test(n)) icone = 'vestiaire'; else if (/office/.test(n)) icone = 'office';
        else if (/linge/.test(n)) icone = 'linge'; else if (/ménage/.test(n)) icone = 'menage'; else if (/pharmacie/.test(n)) icone = 'pharmacie';
        else if (/réunion/.test(n)) icone = 'reunion'; else if (/simulation/.test(n)) icone = 'simulation'; else if (/détente/.test(n)) icone = 'office';
      }
      var precision = r.precision != null ? r.precision : (r.nom ? '' : p.precision);
      return { nom: nom || null, precision: precision || '', categorie: cat, icone: icone, couleur: r.couleur || (cat && R.categories[cat] && R.categories[cat].couleur) || null,
               complet: r.nom ? r.nom : p.libelle_complet, modifie: !!R.pieces[p.id] };
    }
    function estRea(p) { return p.type === 'piece' || p.type === 'chambre' && p.unite || p.type === 'terrasse' || p.type === 'chambre' && !p.unite && p.bbox[1] < 1390; }

    /* ----- Structure ----- */
    racine.classList.add('plan');
    var barre = h('div', { class: 'plan__outils' });
    var recherche = h('input', { type: 'search', class: 'plan__recherche', placeholder: 'Chambre, bureau, garde, vestiaire…', 'aria-label': 'Rechercher une pièce', autocomplete: 'off' });
    var resultats = h('ul', { class: 'plan__resultats', role: 'listbox', hidden: true });
    var modes = h('div', { class: 'plan__bascule', role: 'group', 'aria-label': "Mode d'affichage" });
    ['texte', 'icones'].forEach(function (m) {
      modes.appendChild(h('button', { type: 'button', 'data-mode': m, 'aria-pressed': String(etat.mode === m), onclick: function () { etat.mode = m; majBoutons(); dessiner(); if (opt.surMode) opt.surMode(m); }, text: m === 'texte' ? 'Texte' : 'Icônes' }));
    });
    var filtres = h('div', { class: 'plan__filtres', role: 'group', 'aria-label': 'Afficher une catégorie' });
    function listeFiltres() {
      var l = [{ id: 'tout', nom: 'Tout' }, { id: 'chambres', nom: 'Chambres' }].concat(CATEGORIES.filter(function (c) { return c.id !== 'exterieur' && c.id !== 'autre'; }));
      if (opt.peutModifier) l.push({ id: 'adesigner', nom: 'À désigner' });
      filtres.replaceChildren.apply(filtres, l.map(function (f) {
        var coul = f.id === 'tout' || f.id === 'chambres' || f.id === 'adesigner' ? null : couleurCat(f.id);
        return h('button', { type: 'button', 'data-filtre': f.id, 'aria-pressed': String(etat.filtre === f.id), onclick: function () { etat.filtre = f.id; majBoutons(); dessiner(); } },
          coul ? h('i', { style: 'background:' + coul }) : null, f.nom);
      }));
    }
    function couleurCat(id) { return (R.categories[id] && R.categories[id].couleur) || (CAT[id] && CAT[id].couleur) || '#6b7586'; }
    barre.append(h('div', { class: 'plan__cherche' }, recherche, resultats), modes);

    var cadre = h('div', { class: 'plan__cadre' });
    var svg = el('svg', { 'class': 'plan__svg', role: 'img', 'aria-label': 'Plan du niveau 3 : réanimation et USC', 'font-family': 'Barlow, PT Sans, sans-serif' });
    cadre.appendChild(svg);
    var zoom = h('div', { class: 'plan__zoom' },
      h('button', { type: 'button', 'aria-label': 'Zoomer', onclick: function () { zoomer(0.7); }, text: '+' }),
      h('button', { type: 'button', 'aria-label': 'Dézoomer', onclick: function () { zoomer(1 / 0.7); }, text: '–' }),
      h('button', { type: 'button', 'aria-label': 'Revenir à la vue de départ', onclick: function () { etat.vb = null; appliquerVB(); }, text: '⤢' }),
      h('button', { type: 'button', 'aria-label': 'Voir tout l\'étage', title: 'Tout l\'étage', onclick: function () { etat.vb = VB0.slice(); appliquerVB(); }, text: '▢' }));
    cadre.appendChild(zoom);
    var fiche = h('section', { class: 'plan__fiche', hidden: true, 'aria-live': 'polite' });
    cadre.appendChild(fiche);
    remplir(racine, barre, filtres, cadre);
    listeFiltres();

    function majBoutons() {
      modes.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === etat.mode)); });
      filtres.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.filtre === etat.filtre)); });
    }

    /* ----- Dessin ----- */
    function visible(p, inf) { // la pièce appartient-elle au filtre actif ?
      var f = etat.filtre;
      if (f === 'tout') return true;
      if (f === 'chambres') return p.type === 'chambre';
      if (f === 'adesigner') return p.type === 'piece' && !inf.nom;
      return p.type === 'piece' && inf.categorie === f;
    }
    function dessiner() {
      svg.replaceChildren();
      el('rect', { x: VB0[0], y: VB0[1], width: VB0[2], height: VB0[3], fill: '#fff' }, svg);
      var b = D.batiment, filtre = etat.filtre !== 'tout';
      D.patios.forEach(function (pa) {
        el('rect', { x: pa[0] + 6, y: pa[1] + 6, width: pa[2] - pa[0] - 12, height: pa[3] - pa[1] - 12, rx: 12, fill: filtre ? '#f1f5e6' : '#e7f0d1', stroke: '#95c127', 'stroke-width': 5 }, svg);
        var t = el('text', { x: (pa[0] + pa[2]) / 2, y: (pa[1] + pa[3]) / 2 + 14, 'text-anchor': 'middle', 'font-size': 42, 'font-weight': 600, fill: '#6c8f1d', opacity: filtre ? 0.4 : 1 }, svg); t.textContent = 'Patio';
      });
      var calqueTexte = el('g', { 'class': 'plan__textes', 'pointer-events': 'none' });
      D.pieces.forEach(function (p) {
        var inf = infos(p), vis = visible(p, inf), fond, trait, ep = 3, dash = null;
        if (p.type === 'chambre') {
          var u = p.unite && D.unites[p.unite];
          if (u) { fond = u.fond; trait = u.trait; ep = 5; if (p.unite === 'cannelle') dash = '14 9'; }
          else if (estRea(p)) { fond = '#e3e6ec'; trait = '#9aa4b4'; }
          else { var gc = GRIS[p.bbox[0] < 983 ? 'usic' : 'usinv']; fond = gc[0]; trait = gc[1]; }
        } else if (p.type === 'usic' || p.type === 'usinv') { fond = GRIS[p.type][0]; trait = GRIS[p.type][1]; }
        else if (p.type === 'terrasse') { fond = '#dfe3e9'; trait = '#a9b2c0'; }
        else {
          var c = inf.couleur || (inf.categorie === 'poste' ? CAT.poste.couleur : null);
          if (filtre && vis && !c) c = etat.filtre === 'adesigner' ? '#d9600b' : couleurCat(etat.filtre);
          fond = c ? melange(c, 0.22) : '#e9edf3'; trait = c ? c : '#8e9ab0'; ep = c ? 5 : 3;
        }
        if (filtre && !vis && (p.type === 'piece' || p.type === 'chambre' && p.unite)) { fond = '#f1f3f6'; trait = '#d3d8e0'; ep = 2; dash = null; }
        var cible = p.type === 'piece' || p.type === 'chambre' || p.type === 'terrasse';
        el('path', { d: p.d, fill: fond, stroke: trait, 'stroke-width': etat.choix === p.id ? 12 : ep, 'stroke-dasharray': dash,
          'data-id': cible ? p.id : null, 'class': cible ? 'plan__piece' + (etat.choix === p.id ? ' plan__piece--choisie' : '') : null }, svg);
        if (etat.choix === p.id) svg.lastChild.setAttribute('stroke', '#223b80');
        if (!filtre || vis) etiquette(calqueTexte, p, inf);
      });
      (D.acces || []).forEach(function (a) { var g = icone(calqueTexte, a.cat, a.X, a.Y, 1.8, '#223b80'); if (filtre) g.setAttribute('opacity', '0.35'); });
      svg.appendChild(calqueTexte);
      el('rect', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], rx: 10, fill: 'none', stroke: '#223b80', 'stroke-width': 10, 'pointer-events': 'none' }, svg);
      titres();
      appliquerVB();
    }

    function etiquette(calque, p, inf) {
      var x0 = p.bbox[0], y0 = p.bbox[1], w = p.bbox[2] - x0, ht = p.bbox[3] - y0, cx = x0 + w / 2, cy = y0 + ht / 2;
      if (p.type === 'chambre') {
        var t = el('text', { x: p.centre[0], y: p.centre[1] + 15, 'text-anchor': 'middle', 'font-size': 42, 'font-weight': 700, fill: p.unite ? '#1b2a52' : '#6b7586' }, calque);
        t.textContent = p.chambre; return;
      }
      if (p.type === 'terrasse') { var tt = el('text', { x: cx, y: p.bbox[3] - 40, 'text-anchor': 'middle', 'font-size': 34, 'font-weight': 600, fill: '#6b7586' }, calque); tt.textContent = 'Terrasse'; return; }
      if ((p.type !== 'piece' && p.type !== 'usic' && p.type !== 'usinv') || !inf.nom) return;
      var coul = inf.couleur || (inf.categorie ? couleurCat(inf.categorie) : '#4c5a7a');
      if (etat.mode === 'icones' || !texte(calque, inf, w, ht, cx, cy, coul)) {
        if (inf.icone && Math.min(w, ht) > 34) icone(calque, inf.icone, cx, cy, Math.min(1.7, Math.min(w, ht) / 36), coul);
      }
    }
    function texte(calque, inf, W, H, cx, cy, coul) { // horizontal, ou vertical si la pièce est haute et étroite ; false si trop petite
      var mots = inf.nom.split(/\s+/), options = [[inf.nom]], best = null;
      if (mots.length > 1) options.push(mots);
      [false, true].forEach(function (vertical) {
        var w = vertical ? H : W, ht = vertical ? W : H;
        options.forEach(function (l) {
          var lignes = l.concat(inf.precision ? [inf.precision] : []);
          var lmax = Math.max.apply(null, lignes.map(function (s) { return s.length; }));
          var t = Math.min(30, (w - 12) / (0.53 * lmax), (ht - 10) / (1.22 * lignes.length));
          if (!best || t > best.t + 1.5) best = { t: t, l: l, v: vertical };
        });
      });
      if (best.t < 13) return false;
      var ht = best.v ? W : H;
      var lignes = best.l.map(function (s) { return [s, 0]; }).concat(inf.precision ? [[inf.precision, 1]] : []);
      var avecIcone = inf.icone && !best.v && ht - lignes.length * best.t * 1.22 > 70;
      var bloc = lignes.reduce(function (a, l) { return a + best.t * (l[1] ? 1 : 1.22); }, 0) + (avecIcone ? 52 : 0);
      var y = cy - bloc / 2;
      if (avecIcone) { icone(calque, inf.icone, cx, y + 22, 1.35, coul); y += 52; }
      lignes.forEach(function (l) {
        var t = l[1] ? best.t * 0.8 : best.t;
        var n = el('text', { x: cx.toFixed(0), y: (y + t * 0.95).toFixed(0), 'text-anchor': 'middle', 'font-size': t.toFixed(0), 'font-weight': l[1] ? 600 : 700,
          fill: l[1] ? '#4c5a7a' : '#1b2a52', transform: best.v ? 'rotate(-90 ' + cx.toFixed(0) + ' ' + cy.toFixed(0) + ')' : null }, calque);
        n.textContent = l[0]; y += t * (l[1] ? 1 : 1.22);
      });
      return true;
    }
    function titres() {
      var g = el('g', { 'pointer-events': 'none' }, svg), filtre = etat.filtre !== 'tout' && etat.filtre !== 'chambres';
      (D.titres || []).forEach(function (t) {
        var u = D.unites[t.unite]; if (!u) return;
        var w = Math.max(u.nom.length * 25, u.info.length * 17) + 70, x0 = t.ancre === 'm' ? t.x - w / 2 : (t.ancre === 'd' ? t.x - w : t.x);
        var gg = el('g', { opacity: filtre ? 0.35 : 1 }, g);
        if (t.cible) {
          el('path', { d: 'M' + t.cible[0] + ' ' + t.cible[1] + ' L' + t.cible[2] + ' ' + t.cible[3], stroke: u.pastille, 'stroke-width': 6, 'stroke-dasharray': '2 12', 'stroke-linecap': 'round', fill: 'none' }, gg);
          el('circle', { cx: t.cible[0], cy: t.cible[1], r: 11, fill: u.pastille, stroke: '#fff', 'stroke-width': 4 }, gg);
        }
        el('rect', { x: x0, y: t.y - 50, width: w, height: 100, rx: 50, fill: u.pastille }, gg);
        var texteCouleur = t.unite === 'atoumo' ? '#1b2a52' : '#fff';
        var a = el('text', { x: x0 + w / 2, y: t.y - 6, 'text-anchor': 'middle', 'font-size': 46, 'font-weight': 700, fill: texteCouleur }, gg); a.textContent = u.nom;
        var b = el('text', { x: x0 + w / 2, y: t.y + 34, 'text-anchor': 'middle', 'font-size': 31, 'font-weight': 600, fill: texteCouleur }, gg); b.textContent = u.info;
      });
      if (D.brules) {
        el('path', { d: 'M' + D.brules.x0 + ' ' + D.brules.y + ' L' + D.brules.x1 + ' ' + D.brules.y, stroke: '#8a94a8', 'stroke-width': 5, 'stroke-dasharray': '2 12', 'stroke-linecap': 'round' }, g);
        var t = el('text', { x: D.brules.x1 + 10, y: D.brules.y + 14, 'font-size': 38, 'font-weight': 700, fill: '#6b7586' }, g); t.textContent = 'Brûlés ambu.';
      }
    }

    /* ----- Zoom et déplacement ----- */
    function ajuste(v) { // adapte la vue aux proportions du cadre (calée en haut, centrée en largeur)
      var r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return v.slice();
      var k = r.height / r.width;
      if (v[3] / v[2] < k) return [v[0], v[1], v[2], v[2] * k];
      var w = v[3] / k; return [v[0] + (v[2] - w) / 2, v[1], w, v[3]];
    }
    function appliquerVB() {
      var v = ajuste(etat.vb || VUE_REA);
      svg.setAttribute('viewBox', v.map(function (n) { return n.toFixed(1); }).join(' '));
    }
    function vbCourant() { return ajuste(etat.vb || VUE_REA); }
    function borner(v) {
      var ratio = v[3] / v[2];
      v[2] = Math.max(320, Math.min(VB0[2] * 1.2, v[2])); v[3] = v[2] * ratio;
      v[0] = Math.max(VB0[0] - v[2] * 0.3, Math.min(VB0[0] + VB0[2] - v[2] * 0.7, v[0]));
      v[1] = Math.max(VB0[1] - v[3] * 0.3, Math.min(VB0[1] + VB0[3] - v[3] * 0.7, v[1]));
      return v;
    }
    function zoomer(f, px, py) {
      var v = vbCourant(), r = svg.getBoundingClientRect();
      var ux = px == null ? 0.5 : (px - r.left) / r.width, uy = py == null ? 0.5 : (py - r.top) / r.height;
      var k = Math.min(r.width / v[2], r.height / v[3]); // échelle « meet »
      var ox = (r.width - v[2] * k) / 2, oy = (r.height - v[3] * k) / 2;
      var mx = v[0] + ((px == null ? r.width / 2 : px - r.left) - ox) / k, my = v[1] + ((py == null ? r.height / 2 : py - r.top) - oy) / k;
      var nw = v[2] * f, nh = v[3] * f;
      etat.vb = borner([mx - (mx - v[0]) * f, my - (my - v[1]) * f, nw, nh]);
      appliquerVB();
    }
    function centrerSur(bb) {
      var w = Math.max(700, (bb[2] - bb[0]) * 3), hh = w * (VUE_REA[3] / VUE_REA[2]);
      var a = ajuste([0, 0, w, hh]); w = a[2]; hh = a[3];
      etat.vb = borner([(bb[0] + bb[2]) / 2 - w / 2, (bb[1] + bb[3]) / 2 - hh / 2, w, hh]); appliquerVB();
    }
    var pointeurs = {}, depart = null, pinch = null, bouge = false;
    svg.addEventListener('pointerdown', function (e) {
      svg.setPointerCapture(e.pointerId); pointeurs[e.pointerId] = [e.clientX, e.clientY]; bouge = false;
      var ids = Object.keys(pointeurs);
      if (ids.length === 1) depart = { x: e.clientX, y: e.clientY, vb: vbCourant() };
      if (ids.length === 2) { var a = pointeurs[ids[0]], b = pointeurs[ids[1]]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vb: vbCourant() }; }
    });
    svg.addEventListener('pointermove', function (e) {
      if (!pointeurs[e.pointerId]) return;
      pointeurs[e.pointerId] = [e.clientX, e.clientY];
      var ids = Object.keys(pointeurs), r = svg.getBoundingClientRect();
      if (ids.length === 2 && pinch) {
        var a = pointeurs[ids[0]], b = pointeurs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        etat.vb = pinch.vb.slice(); zoomer(pinch.d / Math.max(d, 1), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); bouge = true; return;
      }
      if (depart) {
        var dx = e.clientX - depart.x, dy = e.clientY - depart.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) bouge = true;
        if (!bouge) return;
        var v = depart.vb, k = Math.min(r.width / v[2], r.height / v[3]);
        etat.vb = borner([v[0] - dx / k, v[1] - dy / k, v[2], v[3]]); appliquerVB();
      }
    });
    function fin(e) {
      var etaitSeul = Object.keys(pointeurs).length === 1;
      delete pointeurs[e.pointerId];
      if (Object.keys(pointeurs).length < 2) pinch = null;
      if (!Object.keys(pointeurs).length) {
        if (etaitSeul && !bouge && e.type === 'pointerup') {
          var cible = document.elementFromPoint(e.clientX, e.clientY);
          var id = cible && cible.getAttribute && cible.getAttribute('data-id');
          choisir(id || null);
        }
        depart = null;
      }
    }
    svg.addEventListener('pointerup', fin); svg.addEventListener('pointercancel', fin);
    svg.addEventListener('wheel', function (e) { e.preventDefault(); zoomer(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });

    /* ----- Recherche ----- */
    function index() {
      var l = [];
      D.pieces.forEach(function (p) {
        var inf = infos(p);
        if (p.type === 'chambre' && p.chambre && estRea(p)) l.push({ id: p.id, titre: 'Chambre ' + p.chambre, sous: p.unite ? D.unites[p.unite].nom : 'Brûlés ambu.', cle: p.chambre + ' chambre ' + (p.unite ? D.unites[p.unite].nom : ''), icone: null });
        else if (p.type === 'piece' && inf.nom) l.push({ id: p.id, titre: inf.nom, sous: inf.precision || (inf.categorie && CAT[inf.categorie] ? CAT[inf.categorie].nom : ''), cle: inf.nom + ' ' + inf.precision + ' ' + (inf.complet || ''), icone: inf.icone, couleur: inf.couleur || (inf.categorie ? couleurCat(inf.categorie) : null) });
      });
      return l;
    }
    function sansAccent(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    recherche.addEventListener('input', function () {
      var q = sansAccent(recherche.value.trim());
      if (!q) { resultats.hidden = true; return; }
      var l = index().filter(function (x) { return sansAccent(x.cle).indexOf(q) >= 0; })
        .sort(function (a, b) { return (sansAccent(a.titre).indexOf(q) === 0 ? 0 : 1) - (sansAccent(b.titre).indexOf(q) === 0 ? 0 : 1) || a.titre.localeCompare(b.titre, 'fr', { numeric: true }); }).slice(0, 8);
      resultats.replaceChildren.apply(resultats, l.length ? l.map(function (x) {
        return h('li', { role: 'option' }, h('button', { type: 'button', onclick: function () { recherche.value = ''; resultats.hidden = true; choisir(x.id, true); } },
          x.icone ? iconeHTML(x.icone, x.couleur) : h('span', { class: 'plan__num', text: '#' }), h('span', null, h('b', { text: x.titre }), x.sous ? h('small', { text: x.sous }) : null)));
      }) : [h('li', { class: 'plan__vide', text: 'Aucune pièce ne correspond.' })]);
      resultats.hidden = false;
    });

    /* ----- Fiche et modification ----- */
    function piece(id) { for (var i = 0; i < D.pieces.length; i++) if (D.pieces[i].id === id) return D.pieces[i]; return null; }
    function choisir(id, centrer) {
      etat.choix = id; dessiner();
      var p = id && piece(id);
      if (!p) { fiche.hidden = true; return; }
      if (centrer) centrerSur(p.bbox);
      afficherFiche(p);
      if (opt.surChoix && (p.type === 'chambre' || infos(p).nom)) opt.surChoix(p.id);
    }
    function afficherFiche(p) {
      var inf = infos(p), titre, sous = '';
      if (p.type === 'chambre') { titre = 'Chambre ' + p.chambre; sous = p.unite ? 'Unité ' + D.unites[p.unite].nom + ', ' + D.unites[p.unite].info.replace(' · ', ', ').toLowerCase() : 'Brûlés ambulatoires'; }
      else if (p.type === 'terrasse') { titre = 'Terrasse'; sous = 'Extérieur'; }
      else { titre = inf.nom || 'Pièce à désigner'; sous = [inf.precision, inf.categorie && CAT[inf.categorie] ? CAT[inf.categorie].nom : ''].filter(Boolean).join(', '); }
      var coul = inf.couleur || (inf.categorie ? couleurCat(inf.categorie) : '#6b7586');
      remplir(fiche,
        h('div', { class: 'plan__poignee' }),
        h('div', { class: 'plan__fiche-tete' },
          p.type === 'piece' && inf.icone ? iconeHTML(inf.icone, coul) : null,
          h('div', null, h('h3', { text: titre }), sous ? h('p', { class: 'plan__sous', text: sous }) : null),
          h('button', { type: 'button', class: 'plan__fermer', 'aria-label': 'Fermer', onclick: function () { choisir(null); }, text: '×' })),
        p.type === 'piece' && inf.complet && inf.complet !== inf.nom ? h('p', { class: 'plan__complet', text: inf.complet }) : null,
        p.type === 'piece' && !inf.nom ? h('p', { class: 'plan__complet', text: opt.peutModifier ? 'Cette pièce n\'a pas encore de nom. Vous pouvez la désigner.' : 'Cette pièce n\'a pas encore été désignée par les référents.' }) : null,
        opt.peutModifier && p.type === 'piece' ? h('button', { type: 'button', class: 'bouton', onclick: function () { formulaire(p); }, text: inf.nom ? 'Modifier cette pièce' : 'Désigner cette pièce' }) : null);
      fiche.hidden = false;
    }
    function formulaire(p) {
      var inf = infos(p), sel = { icone: inf.icone || 'autre', couleur: (R.pieces[p.id] || {}).couleur || null, categorie: inf.categorie || 'autre' };
      var nom = h('input', { type: 'text', id: 'pl-nom', maxlength: '40', value: inf.nom || '', required: true });
      var prec = h('input', { type: 'text', id: 'pl-prec', maxlength: '40', value: inf.precision || '', placeholder: 'Ex. : 4 postes' });
      var cat = h('select', { id: 'pl-cat' }, CATEGORIES.map(function (c) { var o = h('option', { value: c.id, text: c.nom }); if (c.id === sel.categorie) o.selected = true; return o; }));
      var grille = h('div', { class: 'plan__icones', role: 'radiogroup', 'aria-label': 'Icône' });
      Object.keys(NOMS_ICONES).forEach(function (k) {
        var b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(k === sel.icone), title: NOMS_ICONES[k], 'aria-label': NOMS_ICONES[k], onclick: function () { sel.icone = k; majChoix(); } }, iconeHTML(k));
        b.dataset.icone = k; grille.appendChild(b);
      });
      var nuancier = h('div', { class: 'plan__nuancier', role: 'radiogroup', 'aria-label': 'Couleur' });
      [null].concat(PALETTE).forEach(function (c) {
        var b = h('button', { type: 'button', role: 'radio', 'aria-label': c ? 'Couleur ' + c : 'Couleur de la catégorie', title: c ? '' : 'Couleur de la catégorie', class: c ? '' : 'plan__sans', style: c ? 'background:' + c : '', onclick: function () { sel.couleur = c; majChoix(); } });
        b.dataset.couleur = c || ''; nuancier.appendChild(b);
      });
      var toute = h('input', { type: 'checkbox', id: 'pl-toute' });
      var erreur = h('p', { class: 'plan__erreur', role: 'alert' });
      var bouton = h('button', { type: 'submit', class: 'bouton', text: 'Enregistrer' });
      function majChoix() {
        grille.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.icone === sel.icone)); });
        nuancier.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-checked', String((b.dataset.couleur || null) === sel.couleur)); });
        toute.disabled = !sel.couleur;
      }
      cat.addEventListener('change', function () { if (!(R.pieces[p.id] || {}).icone && CAT[cat.value]) { sel.icone = CAT[cat.value].icone; majChoix(); } });
      var form = h('form', { class: 'plan__form', onsubmit: function (ev) {
        ev.preventDefault(); erreur.textContent = '';
        if (!nom.value.trim()) { erreur.textContent = 'Indiquez un nom pour la pièce.'; nom.focus(); return; }
        var donnees = { nom: nom.value.trim(), precision: prec.value.trim(), categorie: cat.value, icone: sel.icone, couleur: toute.checked ? null : sel.couleur };
        bouton.disabled = true; bouton.textContent = 'Enregistrement…';
        Promise.resolve(opt.enregistrerPiece ? opt.enregistrerPiece(p.id, donnees) : null).then(function () {
          R.pieces[p.id] = donnees;
          if (toute.checked && sel.couleur) {
            return Promise.resolve(opt.enregistrerCategorie ? opt.enregistrerCategorie(cat.value, { couleur: sel.couleur }) : null).then(function () { R.categories[cat.value] = { couleur: sel.couleur }; });
          }
        }).then(function () { listeFiltres(); majBoutons(); dessiner(); afficherFiche(p); })
          .catch(function (e) { erreur.textContent = (e && e.message) || 'Enregistrement impossible. Réessayez.'; bouton.disabled = false; bouton.textContent = 'Enregistrer'; });
      } },
        h('h3', { text: inf.nom ? 'Modifier la pièce' : 'Désigner la pièce' }),
        h('label', { for: 'pl-nom', text: 'Nom affiché' }), nom,
        h('label', { for: 'pl-prec', text: 'Précision (facultatif)' }), prec,
        h('label', { for: 'pl-cat', text: 'Catégorie' }), cat,
        h('span', { class: 'plan__label', text: 'Icône' }), grille,
        h('span', { class: 'plan__label', text: 'Couleur' }), nuancier,
        h('label', { class: 'plan__case' }, toute, ' Appliquer cette couleur à toute la catégorie'),
        erreur,
        h('div', { class: 'plan__actions' },
          h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { afficherFiche(p); }, text: 'Annuler' }),
          R.pieces[p.id] ? h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () {
            Promise.resolve(opt.enregistrerPiece ? opt.enregistrerPiece(p.id, null) : null).then(function () { delete R.pieces[p.id]; dessiner(); afficherFiche(p); });
          }, text: 'Revenir au plan d\'origine' }) : null,
          bouton));
      remplir(fiche, h('div', { class: 'plan__poignee' }), form);
      majChoix(); nom.focus();
    }

    dessiner();
    if (window.ResizeObserver) new ResizeObserver(function () { appliquerVB(); }).observe(svg);
    return { redessiner: dessiner, reglages: R, choisir: choisir,
      // Liste des pièces avec leur nom effectif (pour le parcours de découverte)
      pieces: function () { return D.pieces.map(function (p) { var i = infos(p); return { id: p.id, type: p.type, chambre: p.chambre, nom: i.nom }; }); } };
  }

  window.ReaPlan = { creer: creer, CATEGORIES: CATEGORIES, PALETTE: PALETTE };
})();
