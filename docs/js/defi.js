/* Défi CHU · commun à tous les services de Cap NCHUG.
   - Défi du jour : les mêmes 6 questions pour tout le CHU (dont 2 missions du Parcours) ; seule la 1re réponse de chaque téléphone compte.
   - Classement : % de bonnes réponses par service (classé à partir de 30 réponses dans la semaine), podium, général.
   - Parcours : vue du ciel (bâtiment) → rue Caraïbes (N° d'entrée) → ascenseur (niveau) → arrivée ; jeu séparé activable par les gestionnaires.
   - Plans du CHU › Plan virtuel : la même vue du ciel, en promenade libre, avec les services de chaque étage.
   - Infos générales (visiteur) : entraînement, rien ne compte pour un service.
   - Gestion (super-admin et créateurs ; l'administrateur quand le service est seul) : phase de test, questions, vue du ciel, services par étage.
   Aucune question ni aucun plan dans ce fichier : tout vient du moteur (Google Sheets privé). */
(function () {
  'use strict';
  var A, h, Api;
  var CLE = { memoire: 'rea.defi', appareil: 'rea.appareil' };
  var RUE = 'M180 50 C 198 160, 196 270, 160 384'; // la rue Caraïbes en arc (dessin fixe), du parking du personnel au parking visiteurs
  var GRIS = '#b9c0cc', RETOUR = null;

  function init() { A = window.ReaApp; h = A.h; Api = window.ReaApi; }
  function session() { return A.stock.lire(A.CLE.session); }
  function visiteur() { return (session() || {}).role === 'visiteur'; } // Infos générales : entraînement, rien ne compte
  function cleMemoire() { return visiteur() ? CLE.memoire + '-infos' : CLE.memoire; }
  function memoire() { var m = A.stock.lire(cleMemoire()) || {}; m.jours = m.jours || {}; return m; }
  function sauver(m) { // on ne garde que les 14 derniers jours
    var j = Object.keys(m.jours).sort(); while (j.length > 14) delete m.jours[j.shift()];
    A.stock.ecrire(cleMemoire(), m);
  }
  function appareil() { // identifiant aléatoire de ce téléphone, jamais relié à une personne (partagé avec les paris)
    var a = A.stock.lire(CLE.appareil);
    if (!a) { a = ''; var c = 'abcdefghijklmnopqrstuvwxyz0123456789', r = new Uint32Array(24); crypto.getRandomValues(r); for (var i = 0; i < 24; i++) a += c[r[i] % c.length]; A.stock.ecrire(CLE.appareil, a); }
    return a;
  }
  function appeler(action, d) { return Api.appeler(action, Object.assign({ jeton: (session() || {}).jeton }, d || {})); }
  function erreurSession(e) { if (e && A.ERREURS_SESSION.indexOf(e.code) >= 0) { A.stock.effacer(A.CLE.session); A.ecranConnexion(A.message(e.code)); return true; } return false; }
  function remplir(el) { el.replaceChildren.apply(el, Array.prototype.slice.call(arguments, 1).filter(function (x) { return x != null && x !== false; })); }
  function page(titre, sous, contenu, retour) {
    A.afficher(h('div', { class: 'page page--large quiz defi' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { (retour || RETOUR || ouvrir)(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: titre }),
        h('span', { class: 'entete__role', text: sous || 'Défi CHU' })),
      contenu));
    window.scrollTo(0, 0);
  }
  function chargement(titre, retour) { page(titre, null, h('div', { class: 'squelette', style: 'height:260px;margin-top:16px' }), retour); }
  function echec(titre, e, reessayer, retour) {
    if (erreurSession(e)) return;
    page(titre, null, h('div', null, h('p', { class: 'vide', text: e && e.code === 'reseau' ? 'Cette rubrique fonctionne en ligne : vérifiez la connexion.' : A.message(e && e.code) }),
      h('button', { class: 'bouton', type: 'button', onclick: reessayer, text: 'Réessayer' })), retour);
  }
  function bandeauTest(mode) { return mode === 'test' ? h('p', { class: 'defi-test', role: 'note', text: '🧪 Phase de test : certaines questions ne sont pas encore validées et les scores ne comptent pas. Le classement repartira de zéro à l\'ouverture officielle.' }) : null; }
  function libelleEntree(e) { e = String(e || ''); return /^B/i.test(e) ? e.toUpperCase() : 'N° ' + e; }
  function clair(c) { // couleur claire → texte foncé
    var m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return true;
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 165;
  }

  /* ---------- Carte de l'accueil (sans réseau) ---------- */
  function carteAccueil() {
    init();
    var m = memoire(), j = m.jours[A.aujourdhui()], fait = j && j.fin;
    return h('section', { class: 'section defi-carte' + (fait ? ' defi-carte--fait' : '') },
      h('div', { class: 'section__tete' }, h('h2', { text: '🏆 Quiz du jour – Défi CHU' }), h('span', { class: 'section__note', text: fait ? 'Fait ✓ · ' + j.bonnes + ' / ' + j.total : '6 questions · tout le CHU' })),
      h('p', { class: 'section__note', text: visiteur() ? 'Les mêmes questions pour tous les services. Ici, c\'est un entraînement : vos réponses ne comptent pour aucun service.'
        : fait ? 'Votre service compte sur vous demain aussi ! Le classement se joue en % de bonnes réponses.' : 'Les mêmes questions pour tous les services. Chaque réponse compte pour votre service.' }),
      h('div', { class: 'gps-boutons' },
        h('button', { class: fait ? 'bouton bouton--discret' : 'bouton', type: 'button', onclick: function () { RETOUR = function () { A.ecranAccueil(); }; fait ? classement() : jour(); }, text: fait ? 'Voir le classement' : 'Relever le défi' }),
        h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { ouvrir(function () { A.ecranAccueil(); }); }, text: m.parcours ? 'Parcours et classement' : 'Classement' })));
  }

  /* ---------- Rubrique Défi CHU ---------- */
  function ouvrir(depuis) {
    init(); if (depuis) RETOUR = depuis; var retour = RETOUR || function () { A.ecranAccueil(); };
    A.definirEcran(null);
    var m = memoire(), j = m.jours[A.aujourdhui()], fait = j && j.fin;
    page('Défi CHU', null, h('div', null,
      bandeauTest(m.mode),
      h('div', { class: 'quiz-themes' },
        h('button', { type: 'button', class: 'quiz-theme', 'data-ic': '🎯', onclick: function () { RETOUR = function () { ouvrir(); }; jour(); } },
          h('b', { text: 'Défi du jour' }), h('span', { text: fait ? 'Fait ✓ ' + j.bonnes + ' / ' + j.total + ' · revenez demain' : '6 questions communes à tout le CHU, dont 2 missions sur la vue du ciel' })),
        h('button', { type: 'button', class: 'quiz-theme', 'data-ic': '🏆', onclick: function () { RETOUR = function () { ouvrir(); }; classement(); } },
          h('b', { text: 'Classement des services' }), h('span', { text: 'Podium de la semaine et classement général, en % de bonnes réponses' })),
        m.parcours ? h('button', { type: 'button', class: 'quiz-theme', 'data-ic': '🧭', onclick: function () { RETOUR = function () { ouvrir(); }; parcours(); } },
          h('b', { text: 'Parcours' }), h('span', { text: 'Du parking au bon service : bâtiment, entrée de la rue Caraïbes, étage' + (m.recordParcours != null ? ' · record : ' + m.recordParcours + ' erreur' + (m.recordParcours > 1 ? 's' : '') : '') })) : null),
      h('p', { class: 'section__note', text: 'Règle du jeu : seule la première réponse de chaque téléphone compte. Un service est classé à partir de 30 réponses dans la semaine. Aucun nom n\'est enregistré : seuls les totaux par service.' })), retour);
  }

  /* ---------- Défi du jour ---------- */
  function jour() {
    init(); A.definirEcran(null);
    chargement('Défi du jour');
    appeler('defi_jour').then(function (d) {
      var m = memoire(); m.mode = d.mode; m.parcours = !!d.parcours; sauver(m);
      if (!d.questions.length) return page('Défi du jour', null, h('div', null, bandeauTest(d.mode), h('p', { class: 'vide', text: 'Pas encore de questions dans le Défi CHU. Revenez bientôt !' })));
      var deja = m.jours[d.date];
      if (deja && deja.fin) return finJour(d, deja);
      serie(d);
    }).catch(function (e) { echec('Défi du jour', e, jour); });
  }
  function serie(d) {
    var m = memoire(), etat = m.jours[d.date] || { rep: {}, bonnes: 0, total: d.questions.length };
    m.jours[d.date] = etat; sauver(m);
    var i = 0; while (i < d.questions.length && etat.rep[d.questions[i].id]) i++; // reprise après une coupure
    function suivante() {
      if (i >= d.questions.length) { etat.fin = true; var mm = memoire(); mm.jours[d.date] = etat; mm.serie = (mm.serie || 0) + 1; sauver(mm); return finJour(d, etat); }
      question(d, d.questions[i], i, function (res) {
        etat.rep[d.questions[i].id] = res.bon ? 1 : -1; if (res.bon) etat.bonnes++;
        var mm = memoire(); mm.jours[d.date] = etat; sauver(mm);
      }, function () { i++; suivante(); });
    }
    suivante();
  }
  function question(d, q, i, note, suite) {
    if (q.type === 'ascenseur') return missionDuJour(d, q, i, note, suite);
    var retour = h('div', { class: 'quiz-retour', 'aria-live': 'polite' }), envoye = false;
    var corps = h('div', { class: 'quiz-question' },
      h('div', { class: 'quiz-progression' }, h('span', { text: 'Question ' + (i + 1) + ' / ' + d.questions.length }), h('span', { class: 'etiquette', text: 'Défi CHU' })),
      h('h2', { class: 'quiz-texte', text: q.texte }));
    function envoyer(reponse, apres) {
      if (envoye) return; envoye = true;
      remplir(retour, h('p', { class: 'section__note', text: 'Envoi…' }));
      appeler('defi_repondre', { donnees: { id: q.id, reponse: reponse, appareil: appareil() } }).then(function (r) {
        note(r); apres(r); if (window.ReaFun) window.ReaFun.reponse(r.bon);
        remplir(retour,
          h('p', { class: 'quiz-verdict quiz-verdict--' + (r.bon ? 'ok' : 'ko'), text: r.bon ? 'Bonne réponse !' : 'Pas tout à fait.' }),
          !r.bon ? h('p', { text: 'La bonne réponse : ' + texteBonne(q, r.bonne) + '.' }) : null,
          r.explication ? h('p', { class: 'quiz-explication', text: r.explication }) : null,
          !r.compte ? h('p', { class: 'section__note', text: r.entrainement ? 'Entraînement : cette réponse ne compte pour aucun service.' : 'Ce téléphone avait déjà répondu à cette question : cette réponse ne compte pas.' }) : null,
          h('button', { class: 'bouton', type: 'button', onclick: suite, text: i + 1 < d.questions.length ? 'Question suivante' : 'Voir le résultat' }));
        retour.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }).catch(function (e) {
        envoye = false;
        if (erreurSession(e)) return;
        if (e && e.code === 'defi_perime') return jour(); // minuit est passé : nouveau défi
        remplir(retour, h('p', { class: 'message-erreur', role: 'alert', text: e && e.code === 'reseau' ? 'Réponse non envoyée : vérifiez la connexion puis touchez à nouveau votre réponse.' : A.message(e && e.code) }));
        corps.querySelectorAll('button').forEach(function (b) { b.disabled = false; b.classList.remove('quiz-choix__btn--choisi'); });
      });
    }
    if (q.type === 'qcm' || q.type === 'vf') {
      var choix = q.type === 'vf' ? [{ t: 'Vrai', v: 'vrai' }, { t: 'Faux', v: 'faux' }] : q.choix.map(function (t, k) { return { t: t, v: k }; });
      var boutons = h('div', { class: 'quiz-choix' + (q.type === 'vf' ? ' defi-vf' : '') });
      choix.forEach(function (c) {
        var b = h('button', { type: 'button', class: 'quiz-choix__btn', onclick: function () {
          if (envoye) return;
          boutons.querySelectorAll('button').forEach(function (x) { x.disabled = true; }); b.classList.add('quiz-choix__btn--choisi');
          envoyer(c.v, function (r) {
            boutons.querySelectorAll('button').forEach(function (x, k) { if (choix[k].v === r.bonne) x.classList.add('quiz-choix__btn--ok'); });
            if (!r.bon) b.classList.add('quiz-choix__btn--ko');
          });
        } }, h('span', { text: c.t }));
        boutons.appendChild(b);
      });
      corps.appendChild(boutons);
    }
    corps.appendChild(retour);
    page('Défi du jour', null, h('div', null, bandeauTest(d.mode), corps), RETOUR);
  }
  /* Mission du Parcours dans le Défi du jour : vue du ciel → rue → ascenseur → arrivée ; bonne dès qu'elle est terminée */
  function missionDuJour(d, q, i, note, suite) {
    var mi = q.mission && d.site ? preparerMission(q.mission, d.site) : null, envoye = false, fait = false;
    function terminer(err, bouton, zone) {
      if (fait) return suite();
      if (envoye) return; envoye = true; bouton.disabled = true; zone.textContent = 'Envoi…';
      appeler('defi_repondre', { donnees: { id: q.id, reponse: { termine: true }, appareil: appareil() } }).then(function (r) {
        note(r); fait = true; envoye = false;
        if (r.compte || r.entrainement) return suite();
        zone.textContent = 'Ce téléphone avait déjà terminé cette mission : elle ne compte pas une seconde fois.'; bouton.disabled = false;
      }).catch(function (e) {
        envoye = false; bouton.disabled = false;
        if (erreurSession(e)) return;
        if (e && e.code === 'defi_perime') return jour(); // minuit est passé : nouveau défi
        zone.textContent = e && e.code === 'reseau' ? 'Mission non envoyée : vérifiez la connexion puis touchez à nouveau le bouton.' : A.message(e && e.code);
      });
    }
    if (!mi) { // vue du ciel incomplète : on ne bloque pas le défi
      var zone = h('p', { class: 'section__note', 'aria-live': 'polite' });
      var bouton = h('button', { class: 'bouton', type: 'button', onclick: function () { terminer(0, bouton, zone); }, text: i + 1 < d.questions.length ? 'Question suivante' : 'Voir le résultat' });
      return page('Défi du jour', 'Question ' + (i + 1) + ' / ' + d.questions.length, h('div', null, bandeauTest(d.mode),
        h('p', { class: 'vide', text: 'Mission : ' + ((q.mission || {}).destination || q.texte) + '. La vue du ciel n\'est pas encore prête : cette mission est comptée comme faite.' }), bouton, zone), RETOUR);
    }
    mission(d, mi, i, d.questions.length, null, { titre: 'Défi du jour', sous: 'Question ' + (i + 1) + ' / ' + d.questions.length + ' · mission', terminer: terminer });
  }
  function texteBonne(q, b) {
    if (q.type === 'qcm') return q.choix[b];
    if (q.type === 'vf') return b === 'vrai' ? 'Vrai' : 'Faux';
    return b.libelle + ', niveau ' + b.niveau;
  }
  function finJour(d, etat) {
    var parfait = etat.bonnes === etat.total;
    if (parfait && window.ReaFun) setTimeout(function () { window.ReaFun.succes(); }, 200);
    page('Défi du jour', null, h('div', null, bandeauTest(d.mode),
      h('div', { class: 'quiz-fin' },
        h('p', { class: 'quiz-fin__score' }, h('b', { text: etat.bonnes + ' / ' + etat.total }), ' bonne' + (etat.bonnes > 1 ? 's' : '') + ' réponse' + (etat.bonnes > 1 ? 's' : '')),
        h('p', { text: visiteur() ? 'Entraînement terminé : vos réponses ne comptent pour aucun service. Nouveau défi demain !' : parfait ? 'Sans faute : votre service vous dit merci !' : 'Chaque réponse compte pour le % de votre service. Nouveau défi demain !' }),
        h('div', { class: 'quiz-actions' },
          h('button', { class: 'bouton', type: 'button', onclick: function () { classement(); }, text: 'Voir le classement' }),
          memoire().parcours ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { RETOUR = function () { ouvrir(); }; parcours(); }, text: 'Jouer au Parcours' }) : null))), RETOUR);
  }

  /* ---------- Classement ---------- */
  function classement(onglet) {
    init(); A.definirEcran(null);
    chargement('Classement');
    appeler('defi_classement').then(function (c) {
      var m = memoire(); m.mode = c.mode; m.parcours = !!c.parcours; sauver(m);
      dessinerClassement(c, onglet || 'semaine');
    }).catch(function (e) { echec('Classement', e, function () { classement(onglet); }); });
  }
  function dessinerClassement(c, onglet) {
    var lignes = onglet === 'general' ? c.general : onglet === 'precedente' ? c.precedente.lignes : c.semaine.lignes;
    var classes = lignes.filter(function (x) { return x.classe; });
    function tab(cle, nom) { return h('button', { type: 'button', role: 'tab', 'aria-selected': String(onglet === cle), class: 'defi-onglet' + (onglet === cle ? ' defi-onglet--actif' : ''), onclick: function () { dessinerClassement(c, cle); }, text: nom }); }
    var titre = onglet === 'general' ? 'Depuis le début' + (c.debut ? ' (' + dateFr(c.debut) + ')' : '') : onglet === 'precedente' ? 'Semaine du ' + dateFr(c.precedente.lundi) : 'Semaine du ' + dateFr(c.semaine.lundi);
    page('Classement', null, h('div', null, bandeauTest(c.mode),
      h('div', { class: 'defi-onglets', role: 'tablist' }, tab('semaine', 'Cette semaine'), tab('precedente', 'Semaine dernière'), tab('general', 'Général')),
      h('p', { class: 'section__note', text: titre + ' · % de bonnes réponses · classé à partir de ' + c.seuil + ' réponses' }),
      classes.length ? podium(classes.slice(0, 3)) : null,
      lignes.length ? h('ol', { class: 'defi-classement' }, lignes.map(function (x) {
        return h('li', { class: 'defi-ligne' + (x.vous ? ' defi-ligne--vous' : '') + (x.classe ? '' : ' defi-ligne--attente') },
          h('span', { class: 'defi-ligne__rang', text: x.classe ? String(x.rang) : '–' }),
          h('span', { class: 'defi-ligne__nom' }, h('b', { text: x.nom }), x.vous ? h('small', { text: 'votre service' }) : null),
          h('span', { class: 'defi-ligne__pc' }, h('b', { text: String(x.pourcent).replace('.', ',') + ' %' }),
            h('small', { text: x.classe ? x.reponses + ' réponses' : x.reponses + ' / ' + c.seuil + ' réponses' })),
          h('span', { class: 'defi-barre', 'aria-hidden': 'true' }, h('span', { style: 'width:' + Math.min(100, x.pourcent) + '%' })));
      })) : h('p', { class: 'vide', text: onglet === 'precedente' ? 'Pas de réponse la semaine dernière.' : 'Pas encore de réponse : soyez le premier de votre service !' })), RETOUR);
  }
  function podium(top) {
    var ordre = [top[1], top[0], top[2]], medaille = { 1: '🥇', 2: '🥈', 3: '🥉' };
    return h('div', { class: 'defi-podium', role: 'img', 'aria-label': 'Podium : ' + top.map(function (x) { return x.rang + '. ' + x.nom + ' (' + x.pourcent + ' %)'; }).join(', ') },
      ordre.map(function (x) {
        if (!x) return h('div', { class: 'defi-podium__place defi-podium__place--vide' });
        return h('div', { class: 'defi-podium__place defi-podium__place--' + x.rang + (x.vous ? ' defi-podium__place--vous' : '') },
          h('span', { class: 'defi-podium__medaille', text: medaille[x.rang] }),
          h('b', { class: 'defi-podium__nom', text: x.nom }),
          h('span', { class: 'defi-podium__pc', text: String(x.pourcent).replace('.', ',') + ' %' }),
          h('span', { class: 'defi-podium__socle', text: String(x.rang) }));
      }));
  }
  function dateFr(iso) { if (!iso) return ''; var p = iso.split('-'); return Number(p[2]) + ' ' + ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][Number(p[1]) - 1]; }

  /* ---------- Dessin du site (vue du ciel), partagé par le Parcours et l'éditeur ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, texte) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); }); if (texte != null) e.textContent = texte; return e; }
  function couleurBat(b) { return b.couleur || GRIS; }
  function couleurEntree(e, site) { if (e.couleur) return e.couleur; var b = batimentDe(site, e.batiment); return b && b.couleur && b.couleur.toLowerCase() !== '#ffffff' ? b.couleur : '#223b80'; }
  function batimentDe(site, code) { return site.batiments.filter(function (b) { return b.code === code; })[0] || null; }
  function dessinerSite(site, o) {
    o = o || {};
    var svg = s('svg', { viewBox: '0 0 358 470', class: 'defi-site', role: 'img', 'aria-label': 'Vue du ciel du site' });
    svg.appendChild(s('rect', { width: 358, height: 470, fill: '#e8f1df' }));
    (site.parkings || []).forEach(function (p, k) {
      var g = s('g', { 'data-type': 'parking', 'data-i': k });
      g.appendChild(s('rect', { x: p.x, y: p.y, width: p.l, height: p.h, rx: 6, fill: p.couleur || (/personnel/i.test(p.nom) ? '#d6d0ef' : '#f4c9da') }));
      g.appendChild(s('text', { x: p.x + p.l / 2, y: p.y + p.h / 2 + 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: /personnel/i.test(p.nom) ? '#5b4aa8' : '#b8346b' }, (p.nom || '').toUpperCase()));
      svg.appendChild(g);
    });
    svg.appendChild(s('path', { d: RUE, fill: 'none', stroke: '#7fd3f5', 'stroke-width': 26, 'stroke-linecap': 'round' }));
    svg.appendChild(s('path', { d: RUE, fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-dasharray': '6 7' }));
    svg.appendChild(s('text', { transform: 'translate(193 252) rotate(-84)', 'font-size': 11, 'font-weight': 700, fill: '#1f6fa8', opacity: .9 }, 'rue Caraïbes'));
    site.batiments.forEach(function (b, k) {
      var c = couleurBat(b), blanc = c.toLowerCase() === '#ffffff';
      var g = s('g', { 'data-type': 'batiment', 'data-i': k, 'data-code': b.code, class: 'defi-bat', tabindex: o.toucher ? 0 : null, role: o.toucher ? 'button' : null, 'aria-label': o.toucher ? 'Bâtiment ' + b.code + (b.nom ? ', ' + b.nom : '') : null });
      g.appendChild(s('rect', { x: b.x, y: b.y, width: b.l, height: b.h, rx: 6, fill: c, stroke: blanc ? '#9aa6b8' : 'none', 'stroke-width': blanc ? 2 : 0, class: 'defi-bat__fond' }));
      var taille = Math.max(14, Math.min(32, Math.min(b.l / 3, b.h * 0.6)));
      g.appendChild(s('text', { x: b.x + b.l / 2, y: b.y + b.h / 2 + taille * 0.36, 'text-anchor': 'middle', 'font-size': taille, 'font-weight': 800, fill: clair(c) ? '#223b80' : '#fff', 'pointer-events': 'none' }, b.code));
      svg.appendChild(g);
    });
    site.entrees.forEach(function (e, k) {
      var c = couleurEntree(e, site), l = String(e.code).length > 1 ? 22 : 18;
      var g = s('g', { 'data-type': 'entree', 'data-i': k, class: 'defi-entree' });
      g.appendChild(s('rect', { x: e.x - l / 2, y: e.y - 7.5, width: l, height: 15, rx: 4, fill: '#fff', stroke: c, 'stroke-width': 1.4 }));
      g.appendChild(s('text', { x: e.x, y: e.y + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: clair(c) ? '#223b80' : c, 'pointer-events': 'none' }, e.code));
      svg.appendChild(g);
    });
    if (o.ici) { // « vous êtes ici » : au bout de la rue, côté parking visiteurs
      svg.appendChild(s('circle', { cx: 160, cy: 398, r: 8, fill: '#95c127', stroke: '#223b80', 'stroke-width': 3 }));
      svg.appendChild(s('text', { x: 172, y: 402, 'font-size': 12, 'font-weight': 700, fill: '#223b80' }, 'vous êtes ici'));
    }
    return svg;
  }

  /* ---------- Parcours ---------- */
  var ETAPES = ['Vue du ciel', 'Rue', 'Ascenseur', 'Arrivée'];
  function parcours() {
    init(); A.definirEcran(null);
    chargement('Parcours');
    appeler('defi_parcours').then(function (d) {
      var m = memoire(); m.mode = d.mode; m.parcours = true; sauver(m);
      var jouables = d.missions.map(function (x) { return preparerMission(x, d.site); }).filter(Boolean);
      if (!jouables.length || !d.site.batiments.length) return page('Parcours', null, h('div', null, bandeauTest(d.mode), h('p', { class: 'vide', text: 'Le Parcours n\'a pas encore de missions ou de vue du ciel. Revenez bientôt !' })));
      jouables.sort(function () { return Math.random() - 0.5; });
      partie(d, jouables.slice(0, 5));
    }).catch(function (e) {
      if (e && e.code === 'parcours_inactif') { var m = memoire(); m.parcours = false; sauver(m); }
      echec('Parcours', e, parcours);
    });
  }
  function preparerMission(x, site) { // bâtiment visé, entrées acceptées
    var cible = String(x.entree || ''), bat, portes;
    if (/^B/i.test(cible)) { bat = cible.toUpperCase(); portes = site.entrees.filter(function (e) { return e.batiment === bat; }).map(function (e) { return e.code; }); }
    else { var e = site.entrees.filter(function (y) { return y.code === cible; })[0]; bat = e ? e.batiment : null; portes = [cible]; }
    if (!bat || !batimentDe(site, bat)) return null;
    return Object.assign({}, x, { bat: bat, portes: portes });
  }
  function partie(d, missions) {
    var n = 0, erreurs = 0;
    function suivante() {
      if (n >= missions.length) return finParcours(d, missions.length, erreurs);
      mission(d, missions[n], n, missions.length, function (e) { erreurs += e; n++; suivante(); });
    }
    suivante();
  }
  /* o (facultatif, Défi du jour) : { titre, sous, terminer(erreurs, bouton, zoneMessage) } */
  function mission(d, mi, n, total, fin, o) {
    o = o || {};
    var etape = 0, err = 0;
    var aide = h('p', { class: 'defi-aide', 'aria-live': 'polite' }), scene = h('div', { class: 'defi-scene' });
    var puces = h('div', { class: 'defi-puces', 'aria-hidden': 'true' });
    var bulle = h('div', { class: 'defi-mission' });
    function cadre() {
      puces.replaceChildren.apply(puces, ETAPES.map(function (t, k) { return h('span', { class: 'defi-puce' + (k === etape ? ' defi-puce--on' : k < etape ? ' defi-puce--fait' : ''), text: (k < etape ? '✓ ' : '') + t }); }));
      page(o.titre || 'Parcours', o.sous || 'Mission ' + (n + 1) + ' / ' + total, h('div', null, bandeauTest(d.mode), bulle, scene, aide, puces), RETOUR);
    }
    function rate(texte) { err++; aide.textContent = texte; aide.classList.remove('defi-aide--ko'); void aide.offsetWidth; aide.classList.add('defi-aide--ko'); if (window.ReaFun) window.ReaFun.reponse(false); }
    function reussi(suite) { if (window.ReaFun) window.ReaFun.reponse(true); aide.classList.remove('defi-aide--ko'); etape++; suite(); }
    // 1. Vue du ciel : le bâtiment
    function ciel() {
      remplir(bulle, h('b', { text: 'Mission : ' + mi.destination }), h('span', { text: 'Vous arrivez au parking visiteurs. Dans quel bâtiment est-ce ?' }));
      var svg = dessinerSite(d.site, { toucher: true, ici: true });
      svg.addEventListener('click', function (ev) {
        var g = ev.target.closest && ev.target.closest('[data-type="batiment"]'); if (!g) return;
        var code = g.getAttribute('data-code');
        if (code === mi.bat) { g.classList.add('defi-bat--ok'); setTimeout(function () { reussi(rue); }, 450); }
        else { g.classList.add('defi-bat--ko'); setTimeout(function () { g.classList.remove('defi-bat--ko'); }, 600); rate('Ce n\'est pas le ' + code + '. ' + (err >= 2 ? 'Indice : c\'est le ' + mi.bat + '.' : 'Essayez encore !')); }
      });
      svg.addEventListener('keydown', function (ev) { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest('[data-type="batiment"]')) { ev.preventDefault(); ev.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
      remplir(scene, h('div', { class: 'defi-carte-ciel' }, svg));
      aide.textContent = 'Touchez un bâtiment. Les N° de la rue sont rappelés en petit : ils servent à l\'étape suivante.';
      cadre();
    }
    // 2. Rue Caraïbes : la bonne porte (les entrées dans l'ordre, depuis le parking visiteurs)
    function rue() {
      if (!mi.portes.length) { etape++; return ascenseur('L\'entrée du ' + mi.bat + ' n\'est pas encore indiquée dans la rue : on passe directement à l\'ascenseur.'); }
      remplir(bulle, h('b', { text: 'Rue Caraïbes' }), h('span', { text: 'Avancez jusqu\'à la bonne entrée du ' + mi.bat + ' et touchez sa porte.' }));
      var portes = d.site.entrees.slice().sort(function (a, b) { return b.y - a.y; });
      var rangee = h('div', { class: 'defi-rue', role: 'list' }, portes.map(function (e) {
        var c = couleurEntree(e, d.site), cote = e.x < 185 ? 'gauche' : 'droite';
        return h('button', { type: 'button', role: 'listitem', class: 'defi-facade defi-facade--' + cote, style: '--c:' + c, 'aria-label': 'Entrée N° ' + e.code + ', bâtiment ' + e.batiment, onclick: function (ev) {
          var b = ev.currentTarget;
          if (mi.portes.indexOf(e.code) >= 0) { b.classList.add('defi-facade--ok'); setTimeout(function () { reussi(function () { ascenseur(); }); }, 450); }
          else { b.classList.add('defi-facade--ko'); setTimeout(function () { b.classList.remove('defi-facade--ko'); }, 600); rate('Le N° ' + e.code + ' mène au ' + e.batiment + '. ' + (err >= 2 ? 'Indice : N° ' + mi.portes.join(' ou ') + '.' : 'Continuez à avancer !')); }
        } }, h('span', { class: 'defi-facade__cote', text: cote === 'gauche' ? '◀ à gauche' : 'à droite ▶' }),
          h('span', { class: 'defi-facade__num', text: e.code }), h('span', { class: 'defi-facade__bat', text: e.batiment }));
      }));
      remplir(scene, h('div', { class: 'defi-rue-cadre' }, h('p', { class: 'defi-rue__depart', text: '🅿️ Parking visiteurs · départ' }), rangee, h('p', { class: 'defi-rue__depart', text: 'Faites défiler → vers le parking du personnel' })));
      aide.textContent = 'Les entrées défilent dans l\'ordre où vous les croisez en remontant la rue.';
      cadre();
    }
    // 3. Ascenseur : le niveau
    function ascenseur(note) {
      remplir(bulle, h('b', { text: 'Ascenseur' + (mi.portes.length === 1 ? ' du N° ' + mi.portes[0] : ' du ' + mi.bat) }), h('span', { text: mi.destination.charAt(0).toUpperCase() + mi.destination.slice(1) + ' : quel niveau ?' }));
      var panneau = panneauAscenseur(d.niveaux, function (niv, b) {
        if (niv === mi.niveau) { b.classList.add('defi-bouton-niv--ok'); setTimeout(function () { reussi(arrivee); }, 450); }
        else { b.classList.add('defi-bouton-niv--ko'); setTimeout(function () { b.classList.remove('defi-bouton-niv--ko'); }, 600); rate('Pas au niveau ' + niv + '. ' + (err >= 2 ? 'Indice : niveau ' + mi.niveau + '.' : 'Rappel : 0 = rue Caraïbes.')); }
      });
      remplir(scene, h('div', { class: 'defi-cabine' }, h('div', { class: 'defi-cabine__ecran', text: mi.portes.length === 1 ? 'N° ' + mi.portes[0] : mi.bat }), panneau));
      aide.textContent = note || 'Le niveau 0 est celui de la rue Caraïbes.';
      cadre();
    }
    // 4. Arrivée
    function arrivee() {
      remplir(bulle, h('b', { text: err ? 'Vous y êtes !' : 'Bravo, vous y êtes !' }), h('span', { text: err ? err + ' erreur' + (err > 1 ? 's' : '') + ' pour cette mission.' : 'Parcours sans erreur.' }));
      var zone = h('p', { class: 'section__note', 'aria-live': 'polite' });
      var bouton = h('button', { class: 'bouton', type: 'button', onclick: function () { if (o.terminer) o.terminer(err, bouton, zone); else fin(err); },
        text: n + 1 < total ? (o.terminer ? 'Question suivante' : 'Mission suivante') : 'Voir le résultat' });
      remplir(scene, h('div', { class: 'defi-arrivee' },
        h('p', { class: 'defi-arrivee__panneau' }, h('span', { text: libelleEntree(mi.portes.length === 1 ? mi.portes[0] : mi.bat) + ' · niveau ' + mi.niveau }), h('b', { text: mi.destination })),
        mi.explication ? h('p', { class: 'quiz-explication', text: mi.explication }) : null,
        o.terminer ? h('p', { class: 'section__note', text: visiteur() ? 'Mission réussie ! (Entraînement : elle ne compte pour aucun service.)' : 'Mission réussie : elle compte comme une bonne réponse pour votre service.' }) : null,
        bouton, zone));
      aide.textContent = '';
      if (!err && window.ReaFun) setTimeout(function () { window.ReaFun.succes(); }, 150);
      cadre();
    }
    ciel();
  }
  function panneauAscenseur(niveaux, choisir) {
    var l = niveaux.slice().sort(function (a, b) { return Number(b) - Number(a); });
    return h('div', { class: 'defi-panneau', role: 'group', 'aria-label': 'Boutons de l\'ascenseur' }, l.map(function (n) {
      return h('button', { type: 'button', class: 'defi-bouton-niv', 'data-n': n, 'aria-label': 'Niveau ' + n + (n === '0' ? ', rue Caraïbes' : ''), onclick: function (ev) { choisir(n, ev.currentTarget); } },
        h('b', { text: n }), n === '0' ? h('small', { text: 'Rue Caraïbes' }) : null);
    }));
  }
  function finParcours(d, total, erreurs) {
    var m = memoire(), record = m.recordParcours == null || erreurs < m.recordParcours;
    if (record) { m.recordParcours = erreurs; sauver(m); }
    if (!erreurs && window.ReaFun) setTimeout(function () { window.ReaFun.succes(); }, 200);
    page('Parcours', null, h('div', { class: 'quiz-fin' },
      h('p', { class: 'quiz-fin__score' }, h('b', { text: total + ' mission' + (total > 1 ? 's' : '') }), erreurs ? ' · ' + erreurs + ' erreur' + (erreurs > 1 ? 's' : '') : ' sans erreur'),
      h('p', { text: record ? 'Nouveau record sur ce téléphone !' : 'Record : ' + m.recordParcours + ' erreur' + (m.recordParcours > 1 ? 's' : '') + '.' }),
      h('div', { class: 'quiz-actions' },
        h('button', { class: 'bouton', type: 'button', onclick: parcours, text: 'Nouvelles missions' }),
        h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { (RETOUR || ouvrir)(); }, text: 'Retour' }))), RETOUR);
  }


  /* ---------- Plans du CHU : plan virtuel (vue du ciel → rue Caraïbes → ascenseur → étage), sans question ni score ---------- */
  function plansChu(depuis) {
    init(); if (depuis) RETOUR = depuis; var retour = RETOUR || function () { A.ecranAccueil(); };
    A.definirEcran(null);
    page('Plans du CHU', null, h('div', { class: 'quiz-themes' },
      h('button', { type: 'button', class: 'quiz-theme', 'data-ic': '🗺️', onclick: function () { RETOUR = function () { plansChu(); }; planVirtuel(); } },
        h('b', { text: 'Plan virtuel' }), h('span', { text: 'Promenez-vous librement : vue du ciel, entrées de la rue Caraïbes, ascenseur et services de chaque étage' }))), retour);
    RETOUR = retour;
  }
  function planVirtuel() {
    init(); var retour = RETOUR;
    chargement('Plan virtuel', retour);
    appeler('defi_plan').then(function (d) { RETOUR = retour; promenade(d); }).catch(function (e) { echec('Plan virtuel', e, planVirtuel, retour); });
  }
  function promenade(d) {
    var ETAPES_PLAN = ['Vue du ciel', 'Rue', 'Ascenseur', 'Étage'], etape = 0, bat = null, porte = null;
    var aide = h('p', { class: 'defi-aide', 'aria-live': 'polite' }), scene = h('div', { class: 'defi-scene' }), bulle = h('div', { class: 'defi-mission' });
    var puces = h('div', { class: 'defi-puces', 'aria-hidden': 'true' }), boutons = h('div', { class: 'gps-boutons plan-chu-nav' });
    function portesDe(b) { return d.site.entrees.filter(function (e) { return e.batiment === b; }); }
    function niveauxDe(b) {
      return d.etages.filter(function (x) { return x.batiment === b; }).map(function (x) { return x.niveau; })
        .sort(function (a, c) { return Number(a) - Number(c); });
    }
    function nomBat(b) { var x = batimentDe(d.site, b); return b + (x && x.nom ? ' · ' + x.nom : ''); }
    function nav(liste) {
      remplir.apply(null, [boutons].concat(liste.map(function (x) { return h('button', { type: 'button', class: 'bouton bouton--discret', onclick: x[1], text: x[0] }); })));
    }
    function cadre() {
      puces.replaceChildren.apply(puces, ETAPES_PLAN.map(function (t, k) { return h('span', { class: 'defi-puce' + (k === etape ? ' defi-puce--on' : ''), text: t }); }));
      page('Plan virtuel', bat ? nomBat(bat) : 'Plans du CHU', h('div', null, bulle, scene, aide, boutons, puces), RETOUR);
    }
    // 1. Vue du ciel : on entre dans le bâtiment de son choix
    function ciel() {
      etape = 0; bat = null; porte = null;
      remplir(bulle, h('b', { text: 'Vue du ciel' }), h('span', { text: 'Vous arrivez au parking visiteurs. Touchez le bâtiment où vous voulez aller.' }));
      var svg = dessinerSite(d.site, { toucher: true, ici: true });
      svg.addEventListener('click', function (ev) {
        var g = ev.target.closest && ev.target.closest('[data-type="batiment"]'); if (!g) return;
        bat = g.getAttribute('data-code'); g.classList.add('defi-bat--ok');
        setTimeout(function () { if (portesDe(bat).length) rue(); else ascenseur('Le ' + bat + ' n\'a pas d\'entrée sur la rue Caraïbes : vous êtes directement dans l\'ascenseur.'); }, 300);
      });
      svg.addEventListener('keydown', function (ev) { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest('[data-type="batiment"]')) { ev.preventDefault(); ev.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
      remplir(scene, h('div', { class: 'defi-carte-ciel' }, svg));
      aide.textContent = 'Les N° en petit sont les entrées de la rue Caraïbes.';
      nav([]);
      cadre();
    }
    // 2. Rue Caraïbes : devant le bâtiment, on choisit une de ses portes (ou une autre : on change alors de bâtiment)
    function rue() {
      etape = 1; porte = null;
      remplir(bulle, h('b', { text: 'Rue Caraïbes · ' + bat }), h('span', { text: 'Touchez une porte du ' + bat + ' (en surbrillance) pour prendre son ascenseur.' }));
      var portes = d.site.entrees.slice().sort(function (a, b) { return b.y - a.y; });
      var rangee = h('div', { class: 'defi-rue', role: 'list' }, portes.map(function (e) {
        var c = couleurEntree(e, d.site), cote = e.x < 185 ? 'gauche' : 'droite', ici = e.batiment === bat;
        return h('button', { type: 'button', role: 'listitem', class: 'defi-facade defi-facade--' + cote + (ici ? ' plan-chu-porte--ici' : ' plan-chu-porte--autre'), style: '--c:' + c,
          'aria-label': 'Entrée N° ' + e.code + ', bâtiment ' + e.batiment, onclick: function () { bat = e.batiment; porte = e.code; ascenseur(); } },
          h('span', { class: 'defi-facade__cote', text: cote === 'gauche' ? '◀ à gauche' : 'à droite ▶' }),
          h('span', { class: 'defi-facade__num', text: e.code }), h('span', { class: 'defi-facade__bat', text: e.batiment }));
      }));
      remplir(scene, h('div', { class: 'defi-rue-cadre' }, h('p', { class: 'defi-rue__depart', text: '🅿️ Parking visiteurs' }), rangee, h('p', { class: 'defi-rue__depart', text: 'Faites défiler → vers le parking du personnel' })));
      aide.textContent = 'Les entrées défilent dans l\'ordre où vous les croisez en remontant la rue.';
      nav([['Vue du ciel', ciel]]);
      cadre();
      var cible = scene.querySelector('.plan-chu-porte--ici'); if (cible && cible.scrollIntoView) cible.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    // 3. Ascenseur : seuls les étages renseignés
    function ascenseur(note) {
      etape = 2;
      var l = niveauxDe(bat);
      remplir(bulle, h('b', { text: 'Ascenseur' + (porte ? ' du N° ' + porte : ' du ' + bat) }), h('span', { text: l.length ? 'Choisissez un étage.' : 'Aucun service n\'est encore renseigné pour le ' + bat + '.' }));
      remplir(scene, h('div', { class: 'defi-cabine' }, h('div', { class: 'defi-cabine__ecran', text: porte ? 'N° ' + porte : bat }),
        l.length ? panneauAscenseur(l, function (niv) { etage(niv); }) : h('p', { class: 'vide', text: 'Revenez bientôt : la liste des services est en cours de saisie.' })));
      aide.textContent = note || 'Le niveau 0 est celui de la rue Caraïbes.';
      nav((portesDe(bat).length ? [['Revenir devant le bâtiment', rue]] : []).concat([['Vue du ciel', ciel]]));
      cadre();
    }
    // 4. Étage : les services présents
    function etage(niv) {
      etape = 3;
      var x = d.etages.filter(function (y) { return y.batiment === bat && y.niveau === niv; })[0] || { services: [] };
      remplir(bulle, h('b', { text: bat + ' · niveau ' + niv + (niv === '0' ? ' (rue Caraïbes)' : '') }), h('span', { text: x.services.length + ' service' + (x.services.length > 1 ? 's' : '') + ' à cet étage' }));
      remplir(scene, h('div', { class: 'defi-arrivee' },
        h('p', { class: 'defi-arrivee__panneau' }, h('span', { text: (porte ? 'N° ' + porte + ' · ' : '') + bat + ' · niveau ' + niv }), h('b', { text: 'À cet étage' })),
        h('ul', { class: 'plan-chu-services' }, x.services.map(function (t) { return h('li', { text: t }); }))));
      aide.textContent = '';
      nav([['Changer d\'étage', function () { ascenseur(); }]].concat(portesDe(bat).length ? [['Revenir devant le bâtiment', rue]] : []).concat([['Vue du ciel', ciel]]));
      cadre();
    }
    ciel();
  }
  window.ReaDefi = { carteAccueil: carteAccueil, ouvrir: ouvrir, jour: jour, classement: classement, parcours: parcours, plansChu: plansChu, planVirtuel: planVirtuel,
    _dessinerSite: function (site, o) { init(); return dessinerSite(site, o); }, _outils: { s: s, clair: clair, couleurBat: couleurBat, libelleEntree: libelleEntree, page: page, remplir: remplir } };
})();
