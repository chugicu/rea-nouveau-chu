/* Réa – Nouveau CHU · module « Visite virtuelle » (photos 360°)
   Visionneuse Photo Sphere Viewer (vendée dans vendor/photo-sphere-viewer/, jamais chargée depuis un site
   extérieur) : un point = une photo (Drive, jamais sur GitHub) ; des liens entre points (flèches pour se
   déplacer, points d'info) placés par clic direct sur la photo (position horizontale/verticale en % de
   l'image, 0-100). Les référents et l'administrateur peuvent poser, modifier et retirer ces liens ; les
   agents ne voient que la visite.
   Utilisation : ReaStreet.creer(conteneur, { points, liens, peutModifier, enregistrerLien(id, donnees) }) */
(function () {
  'use strict';
  // Chemins relatifs à la page (docs/index.html), comme les autres bibliothèques vendues (vendor/qrcode.js, etc.) :
  // un script classique (non « module ») résout import() de la même façon qu'un lien <link>, par rapport au document.
  var PSV_JS = 'vendor/photo-sphere-viewer/psv.bundle.min.js';
  var PSV_CSS = 'vendor/photo-sphere-viewer/psv.bundle.min.css';
  var cssChargee = false, modulePromesse = null;

  function chargerCss() {
    if (cssChargee || document.querySelector('link[href="' + PSV_CSS + '"]')) return;
    cssChargee = true;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = PSV_CSS; document.head.appendChild(l);
  }
  function chargerModule() { return modulePromesse || (modulePromesse = import(PSV_JS)); }

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

  var DEUX_PI = Math.PI * 2;
  function versAngles_(xPct, yPct) { return { yaw: (xPct / 100) * DEUX_PI - Math.PI, pitch: Math.PI / 2 - (yPct / 100) * Math.PI }; }
  function versPourcent_(yaw, pitch) {
    var x = (((yaw + Math.PI) % DEUX_PI + DEUX_PI) % DEUX_PI) / DEUX_PI * 100;
    var y = (Math.PI / 2 - pitch) / Math.PI * 100;
    return { x: Math.max(0, Math.min(100, Math.round(x * 10) / 10)), y: Math.max(0, Math.min(100, Math.round(y * 10) / 10)) };
  }

  function genererId_() {
    var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789', s = 'S';
    for (var i = 0; i < 8; i++) s += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    return s;
  }

  function nomPoint_(points, id) { var p = points[id]; return p ? (p.nom || id) + (p.zone ? ' – ' + p.zone : '') : id; }

  function creer(conteneur, opt) {
    var points = opt.points || {}, liens = (opt.liens || []).slice(), peutModifier = !!opt.peutModifier, enregistrerLien = opt.enregistrerLien;
    var idsTriees = Object.keys(points).sort();
    if (!idsTriees.length) { conteneur.replaceChildren(el('p', { class: 'vide', text: 'Aucun point de prise de vue pour l\'instant.' })); return; }

    var selecteur = el('select', { 'aria-label': 'Aller à…', class: 'street-aller' },
      idsTriees.map(function (id) { return el('option', { value: id, text: nomPoint_(points, id) }); }));
    var boutonModifier = peutModifier ? el('button', { type: 'button', class: 'bouton bouton--discret', text: 'Modifier les liens' }) : null;
    var zoneVisor = el('div', { class: 'street-visor', style: 'height:56vh;position:relative' });
    var zoneAide = el('p', { class: 'section__note street-aide', text: '' });
    var barre = el('div', { class: 'street-barre' }, [selecteur, boutonModifier]);
    conteneur.replaceChildren(barre, zoneVisor, zoneAide);

    var visor = null, mp = null, enEdition = false, idCourant = idsTriees[0];

    chargerCss();
    zoneVisor.appendChild(el('div', { class: 'squelette', style: 'height:100%' }));
    chargerModule().then(function (PSV) {
      zoneVisor.replaceChildren();
      visor = new PSV.Viewer({ container: zoneVisor, navbar: ['zoom', 'caption', 'fullscreen'], plugins: [[PSV.MarkersPlugin, {}]] });
      mp = visor.getPlugin(PSV.MarkersPlugin);
      mp.addEventListener('select-marker', surClicMarqueur);
      visor.addEventListener('click', surClicPhoto);
      aller(idCourant);
    }).catch(function () {
      zoneVisor.replaceChildren(el('p', { class: 'vide', text: 'La visionneuse 360° n\'a pas pu être chargée (hors ligne ?).' }));
    });

    selecteur.addEventListener('change', function () { aller(selecteur.value); });
    if (boutonModifier) boutonModifier.addEventListener('click', function () {
      enEdition = !enEdition;
      boutonModifier.textContent = enEdition ? 'Terminer la modification' : 'Modifier les liens';
      zoneAide.textContent = enEdition ? 'Touchez la photo à l\'endroit voulu pour poser une flèche ou un point d\'info. Touchez un repère existant pour le modifier ou le retirer.' : '';
    });

    function liensDe(id) { return liens.filter(function (l) { return l.depart === id; }); }

    function aller(id) {
      if (!points[id] || !visor) return;
      idCourant = id; selecteur.value = id;
      visor.setPanorama(urlDrive_(points[id].photo), { caption: nomPoint_(points, id) }).catch(function () {});
      dessinerMarqueurs();
    }

    function dessinerMarqueurs() {
      if (!mp) return;
      mp.clearMarkers();
      liensDe(idCourant).forEach(function (l) {
        var a = versAngles_(l.x, l.y);
        mp.addMarker({
          id: l.id, position: { yaw: a.yaw, pitch: a.pitch },
          html: l.type === 'fleche' ? '➜' : 'ℹ️',
          className: 'street-marqueur street-marqueur--' + l.type,
          tooltip: l.type === 'fleche' ? ('Aller vers ' + nomPoint_(points, l.arrivee)) : (l.texte || 'Information'),
          data: l
        });
      });
    }

    function surClicMarqueur(e) {
      var l = e.marker.data;
      if (enEdition) return ouvrirFormulaire(l);
      if (l.type === 'fleche' && points[l.arrivee]) return aller(l.arrivee);
      zoneAide.textContent = l.texte || '';
    }

    // Pose d'un nouveau lien : clic sur la photo en mode édition (hors clic sur un repère existant).
    function surClicPhoto(e) {
      if (!enEdition || !e || !e.data || e.data.rightclick) return;
      var pct = versPourcent_(e.data.yaw, e.data.pitch);
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
        form.remove(); dessinerMarqueurs();
      }).catch(function (e) {
        if (b) b.disabled = false;
        form.querySelector('.message-erreur').textContent = (e && e.message) || 'Enregistrement impossible.';
      });
    }
  }

  window.ReaStreet = { creer: creer };
})();
