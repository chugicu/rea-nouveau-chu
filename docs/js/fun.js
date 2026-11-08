/* Réa – Nouveau CHU · retours ludiques : confettis, vibrations, série de jours 🔥.
   Tout reste sur le téléphone. Les animations sont coupées si le téléphone demande de les réduire. */
(function () {
  'use strict';
  var calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COULEURS = ['#ffd34d', '#ff7a59', '#f5508f', '#58cc02', '#8e44c4', '#40a8df', '#ffffff'];

  function confettis(force) {
    if (calme) return;
    var n = force === 'grand' ? 160 : 90, c = document.createElement('canvas'), g = c.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.className = 'confettis'; c.setAttribute('aria-hidden', 'true');
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; g.scale(dpr, dpr);
    document.body.appendChild(c);
    var p = [];
    for (var i = 0; i < n; i++) p.push({ x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35, vx: (Math.random() - .5) * 13, vy: -Math.random() * 13 - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - .5) * .35, w: 6 + Math.random() * 6, h: 10 + Math.random() * 8, c: COULEURS[i % COULEURS.length] });
    var debut = performance.now();
    (function image(t) {
      var e = t - debut; g.clearRect(0, 0, innerWidth, innerHeight);
      p.forEach(function (q) { q.vy += .38; q.vx *= .99; q.x += q.vx; q.y += q.vy; q.r += q.vr;
        g.save(); g.translate(q.x, q.y); g.rotate(q.r); g.globalAlpha = Math.max(0, 1 - e / 2600); g.fillStyle = q.c; g.fillRect(-q.w / 2, -q.h / 2, q.w, q.h * Math.abs(Math.cos(q.r * 2)) + 2); g.restore(); });
      if (e < 2600) requestAnimationFrame(image); else c.remove();
    })(debut);
  }
  function vibrer(motif) { try { if (navigator.vibrate) navigator.vibrate(motif); } catch (e) { /* non pris en charge */ } }
  function reponse(ok) { vibrer(ok ? 35 : [60, 60, 60]); }
  function succes(grand) { confettis(grand ? 'grand' : null); vibrer([30, 40, 30]); }

  // Série : nombre de jours d'affilée avec le quiz du jour (aujourd'hui ou hier compris)
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function serie() {
    var q; try { q = JSON.parse(localStorage.getItem('rea.quiz') || '{}'); } catch (e) { q = {}; }
    var jours = (q && q.jours) || {}, d = new Date(), n = 0;
    if (!jours[iso(d)]) d.setDate(d.getDate() - 1);
    while (jours[iso(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // Badges : confettis à chaque nouveau badge
  function brancherBadges() {
    var b = window.ReaBadges; if (!b || b.__fun) return;
    var origine = b.attribuer;
    b.attribuer = function (id) { var deja = false; try { deja = !!(JSON.parse(localStorage.getItem('rea.badges') || '{}')[id]); } catch (e) { /* ignoré */ } origine(id); if (!deja) setTimeout(function () { succes(true); }, 150); };
    b.__fun = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancherBadges); else setTimeout(brancherBadges, 0);

  window.ReaFun = { confettis: confettis, vibrer: vibrer, reponse: reponse, succes: succes, serie: serie };
})();
