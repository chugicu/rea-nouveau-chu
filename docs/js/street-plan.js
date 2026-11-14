/* Réa – Nouveau CHU · bonhomme du plan interactif (entrée « façon Street View » de la visite virtuelle).
   Une pastille orange en bas à droite du plan : on l'attrape et on la glisse sur le plan. Pendant le geste, les
   couloirs photographiés s'allument en bleu et un bandeau donne le nom du point visé ; au lâcher, la visite
   s'ouvre sur le point le plus proche (à moins de ReaStreet.seuilPoint unités du plan). Trop loin de tout point,
   le bonhomme revient dans son coin avec le message « Pas de photo ici ».
   Quand on revient de la visite, le bonhomme reste posé sur le dernier point visité (le toucher rouvre la visite).
   Le calque est dessiné par-dessus le plan et suit le zoom et le déplacement, comme celui du GPS (gps.js) :
   plan.js n'est pas modifié.
   Utilisation : ReaStreetPlan.brancher({ zone, plan, points, liens, poseId, recentrer, surPoser(id) }) */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  // Le bonhomme est tenu au-dessus du doigt (en pixels) : sinon le doigt le cache et on ne voit pas où il va se poser.
  var DECALAGE_DOIGT = 56;
  var TRAIT_FIXE = 'vector-effect:non-scaling-stroke';
  // Silhouette (viewBox 24 × 24), couleur = couleur du texte de l'élément qui la porte.
  var FIGURE_CHEMINS = '<circle cx="12" cy="4.6" r="3.1" fill="currentColor"/>' +
    '<path fill="currentColor" d="M12 8.6c-3 0-5.2 1.7-5.2 3.9v3h2.3V22h2.4v-5.1h1.1V22h2.4v-6.5h2.3v-3c0-2.2-2.2-3.9-5.3-3.9z"/>';
  var FIGURE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + FIGURE_CHEMINS + '</svg>';

  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function el(tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] == null) return;
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    return e;
  }

  function brancher(o) {
    var S = window.ReaStreet;
    var svg = o && o.zone && o.zone.querySelector('.plan__svg'), cadre = svg && svg.parentNode;
    if (!S || !svg || !cadre || typeof o.surPoser !== 'function') return null;
    var points = o.points || {};
    var ids = Object.keys(points).filter(function (id) { return points[id].photo && S.aPosition(points[id]); });
    if (ids.length < 2) return null; // pas de positions dans le classeur (colonnes X / Y vides) : pas de bonhomme
    var troncons = S.troncons(points, o.liens || []);
    var pose = o.poseId && points[o.poseId] && points[o.poseId].photo && S.aPosition(points[o.poseId]) ? o.poseId : null;
    var glisse = false, cible = null, drag = null, fantome = null, bulle = null, minuterieBulle = null, apresGlisse = false;

    var calque = svgEl('svg', { 'class': 'street-plan-calque', 'aria-hidden': 'true' });
    cadre.insertBefore(calque, svg.nextSibling);
    var bouton = el('button', { type: 'button', 'class': 'street-bonhomme', 'aria-label': 'Visite virtuelle : glissez le bonhomme sur un couloir du plan', title: 'Glissez-moi sur un couloir du plan', html: FIGURE });
    cadre.appendChild(bouton);

    // Pas de bonhomme par-dessus la fiche d'une pièce (la fiche arrive par le bas du plan).
    var fiche = cadre.querySelector('.plan__fiche');
    function majCache() { bouton.classList.toggle('street-bonhomme--cache', !!fiche && !fiche.hidden); }
    if (fiche && window.MutationObserver) { new MutationObserver(majCache).observe(fiche, { attributes: true, attributeFilter: ['hidden'] }); majCache(); }

    /* ----- Passage écran <-> plan ----- */
    function versPlan(cx, cy) {
      var m = svg.getScreenCTM(); if (!m) return null;
      var pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
      var q = pt.matrixTransform(m.inverse());
      return [q.x, q.y];
    }
    function unitesParPixel() { var m = svg.getScreenCTM(); return m && m.a ? 1 / Math.hypot(m.a, m.b) : 3; }

    /* ----- Calque : couloirs allumés pendant le geste, bonhomme posé ----- */
    function dessiner() {
      calque.replaceChildren();
      var k = unitesParPixel();
      if (glisse) {
        troncons.forEach(function (t) { svgEl('line', { x1: t[0], y1: t[1], x2: t[2], y2: t[3], stroke: '#40a8df', 'stroke-opacity': 0.75, 'stroke-width': 6, 'stroke-linecap': 'round', style: TRAIT_FIXE }, calque); });
        ids.forEach(function (id) { svgEl('circle', { cx: points[id].x, cy: points[id].y, r: 4 * k, fill: '#fff', stroke: '#223b80', 'stroke-width': 1.5, style: TRAIT_FIXE }, calque); });
        if (cible) svgEl('circle', { cx: points[cible].x, cy: points[cible].y, r: 15 * k, fill: 'rgba(217,96,11,.25)', stroke: '#d9600b', 'stroke-width': 3, style: TRAIT_FIXE }, calque);
      }
      if (pose) {
        var p = points[pose];
        var g = svgEl('g', { transform: 'translate(' + p.x + ',' + p.y + ') scale(' + k + ')', 'pointer-events': 'all', style: 'cursor:pointer', opacity: glisse ? 0.4 : 1, role: 'button', 'aria-label': 'Rouvrir la visite virtuelle : ' + S.nomPoint(points, pose) }, calque);
        svgEl('circle', { r: 19, fill: '#d9600b', stroke: '#fff', 'stroke-width': 3 }, g);
        var f = svgEl('g', { transform: 'translate(-12,-12)', color: '#fff' }, g); f.innerHTML = FIGURE_CHEMINS;
        g.addEventListener('click', function () { o.surPoser(pose); });
      }
    }
    if (window.MutationObserver) new MutationObserver(function () { calque.setAttribute('viewBox', svg.getAttribute('viewBox') || ''); dessiner(); }).observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
    calque.setAttribute('viewBox', svg.getAttribute('viewBox') || '');
    dessiner();

    /* ----- Bandeau d'information ----- */
    function annoncer(texte, dureeMs) {
      if (!bulle) { bulle = el('div', { 'class': 'street-plan-bulle', role: 'status' }); cadre.appendChild(bulle); }
      bulle.textContent = texte;
      clearTimeout(minuterieBulle);
      if (dureeMs) minuterieBulle = setTimeout(effacerBulle, dureeMs);
    }
    function effacerBulle() { clearTimeout(minuterieBulle); if (bulle) { bulle.remove(); bulle = null; } }

    /* ----- Glisser-déposer ----- */
    function commencer() {
      glisse = true;
      bouton.classList.add('street-bonhomme--tenu');
      fantome = el('div', { 'class': 'street-fantome', 'aria-hidden': 'true', html: FIGURE });
      cadre.appendChild(fantome);
      dessiner();
    }
    function suivre(cx, cy) {
      var r = cadre.getBoundingClientRect(), px = cx, py = cy - DECALAGE_DOIGT;
      fantome.style.left = (px - r.left) + 'px'; fantome.style.top = (py - r.top) + 'px';
      var q = versPlan(px, py), c = q ? S.plusProche(points, q[0], q[1], S.seuilPoint) : null, id = c ? c.id : null;
      if (px < r.left || px > r.right || py < r.top || py > r.bottom) id = null;
      if (id !== cible) { cible = id; dessiner(); }
      annoncer(id ? S.nomPoint(points, id) : 'Pas de photo ici');
    }
    function terminer() {
      glisse = false; cible = null;
      bouton.classList.remove('street-bonhomme--tenu');
      if (fantome) { fantome.remove(); fantome = null; }
      effacerBulle(); dessiner();
    }
    function fin(e, valide) {
      var d = drag; if (!d || (e && e.pointerId !== d.id)) return;
      drag = null;
      try { bouton.releasePointerCapture(d.id); } catch (x) { /* ignoré */ }
      if (!d.bouge) return; // un simple toucher : voir « click »
      apresGlisse = true; setTimeout(function () { apresGlisse = false; }, 400); // la souris envoie aussi un « click » après un glissement
      var id = cible;
      terminer();
      if (valide && id) o.surPoser(id);
      else if (valide) annoncer('Pas de photo ici. Posez le bonhomme sur un couloir bleu.', 3200);
    }
    bouton.addEventListener('pointerdown', function (e) {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      try { bouton.setPointerCapture(e.pointerId); } catch (x) { /* ignoré */ }
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, bouge: false };
    });
    bouton.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.bouge) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return; drag.bouge = true; commencer(); }
      suivre(e.clientX, e.clientY);
    });
    bouton.addEventListener('pointerup', function (e) { fin(e, true); });
    bouton.addEventListener('pointercancel', function (e) { fin(e, false); });
    bouton.addEventListener('lostpointercapture', function (e) { fin(e, false); });
    bouton.addEventListener('click', function (e) {
      if (apresGlisse) return;
      // Clavier (détail 0) : ouvre la visite sur le dernier point visité, ou sur le premier. Toucher : mode d'emploi.
      if (e.detail === 0) o.surPoser(pose || ids.slice().sort()[0]);
      else annoncer('Glissez le bonhomme sur un couloir du plan pour entrer dans la visite.', 4000);
    });

    // De retour de la visite : le plan se centre sur le bonhomme posé.
    if (pose && o.recentrer && o.plan && typeof o.plan.centrerSur === 'function') o.plan.centrerSur(points[pose].x, points[pose].y, 100); // rayon 100 : plan.js montre alors la largeur minimale (700 unités), soit cinq points environ
    return { bouton: bouton };
  }

  window.ReaStreetPlan = { brancher: brancher };
})();
