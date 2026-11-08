/* Réa – Nouveau CHU · Jeux et souvenirs
   Jauge du déménagement (accueil), Souvenirs, et rubrique Jeux : concours photo, nuage de mots, QR codes cachés,
   escape game, bingo, paris. Chaque jeu est activé ou désactivé par l'administrateur (avec dates facultatives).
   Aucune donnée personnelle obligatoire : signatures facultatives, pseudos libres, votes et cœurs anonymes. */
(function () {
  'use strict';
  var A = null, h = null;
  var CLE = { etat: 'jeux/etat', qr: 'rea.qr-trouves', qrAttente: 'rea.qr-attente', coeurs: 'rea.coeurs', drapeaux: 'rea.jeux-drapeaux', bingo: 'rea.bingo',
    escape: 'rea.escape', pseudo: 'rea.pseudo', appareil: 'rea.appareil', paliers: 'rea.paliers-vus' };
  var ETAT = null; // dernier jeux_etat
  var VERT = '#048e39';

  function init() { if (!A) { A = window.ReaApp; h = A.h; } }
  function session() { return A.stock.lire(A.CLE.session); }
  function remplir(el) { el.replaceChildren.apply(el, Array.prototype.slice.call(arguments, 1).filter(function (x) { return x != null && x !== false; })); }
  function melanger(l) { l = l.slice(); for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; } return l; }
  function drapeau(nom) { var d = A.stock.lire(CLE.drapeaux) || {}; if (!d[nom]) { d[nom] = 1; A.stock.ecrire(CLE.drapeaux, d); } }
  function aDrapeau(nom) { return !!(A.stock.lire(CLE.drapeaux) || {})[nom]; }
  function appareil() { // identifiant aléatoire de ce téléphone (paris) : jamais relié à une personne
    var a = A.stock.lire(CLE.appareil);
    if (!a) { a = ''; var c = 'abcdefghijklmnopqrstuvwxyz0123456789', r = new Uint32Array(24); crypto.getRandomValues(r); for (var i = 0; i < 24; i++) a += c[r[i] % c.length]; A.stock.ecrire(CLE.appareil, a); }
    return a;
  }
  function point(type) { // fait avancer la jauge (anonyme) ; ignoré hors ligne
    var s = session(); if (!s) return;
    A.Api.appeler('jeux_points', { jeton: s.jeton, type: type }).catch(function () {});
  }
  function lireCache(cle) {
    if (!window.caches) return Promise.resolve(null);
    return caches.open(A.CACHE_DONNEES).then(function (c) { return c.match(cle); }).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
  }
  function ecrireCache(cle, d) {
    if (!window.caches || !session()) return;
    caches.open(A.CACHE_DONNEES).then(function (c) { return c.put(cle, new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } })); }).catch(function () {});
  }
  function erreurSession(e) {
    if (A.ERREURS_SESSION.indexOf(e.code) >= 0) { A.stock.effacer(A.CLE.session); A.ecranConnexion(A.message(e.code)); return true; }
    return false;
  }
  function chargerEtat() {
    var s = session(); if (!s) return Promise.reject({ code: 'session_absente' });
    return A.Api.appeler('jeux_etat', { jeton: s.jeton }).then(function (r) { ETAT = r; ecrireCache(CLE.etat, r); return r; })
      .catch(function (e) { if (A.ERREURS_SESSION.indexOf(e.code) >= 0) throw e; return lireCache(CLE.etat).then(function (c) { if (c) { ETAT = c; return c; } throw e; }); });
  }
  function jeuActif(id) { return !!(ETAT && ETAT.jeux[id] && ETAT.jeux[id].actif); }
  function page(titre, sous, contenu, retour) {
    A.afficher(h('div', { class: 'page page--large jeux' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { (retour || hub)(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: titre }),
        h('span', { class: 'entete__role', text: sous || '' })),
      contenu));
    window.scrollTo(0, 0);
  }
  function attente() { return h('div', null, h('div', { class: 'squelette', style: 'height:120px' }), h('div', { class: 'squelette', style: 'height:220px;margin-top:12px' })); }
  function messageErreur(e, reessayer) {
    return h('div', null, h('p', { class: 'vide', text: e && e.code === 'reseau' ? 'Pas de réseau : réessayez dans un moment.' : A.message(e && e.code) }),
      reessayer ? h('button', { class: 'bouton', type: 'button', onclick: function () { reessayer(); }, text: 'Réessayer' }) : null);
  }
  function confirmer2(bouton, texte, action) { // bouton en deux temps
    return function () { if (bouton.dataset.confirme !== '1') { bouton.dataset.confirme = '1'; bouton.textContent = texte; return; } action(); };
  }
  function dateFr(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }

  /* ---------- Jauge du déménagement (accueil) ---------- */
  function sectionJauge(elan) {
    init();
    if (!elan) return null;
    var pc = elan.pourcent, paliers = elan.paliers || [], atteints = paliers.filter(function (p) { return pc >= p.pc; }), prochain = paliers.filter(function (p) { return pc < p.pc; })[0];
    var dernier = atteints[atteints.length - 1], vus = A.stock.lire(CLE.paliers) || {}, nouveau = dernier && !vus[dernier.pc];
    if (nouveau) { vus[dernier.pc] = 1; A.stock.ecrire(CLE.paliers, vus); if (window.ReaFun) setTimeout(function () { window.ReaFun.succes(true); }, 500); }
    var detail = h('ol', { class: 'elan__paliers', hidden: true }, paliers.map(function (p) {
      return h('li', { class: pc >= p.pc ? 'elan__palier elan__palier--ok' : 'elan__palier' }, h('b', { text: p.pc + ' % · ' + p.titre }), p.texte && pc >= p.pc ? h('span', { text: p.texte }) : null);
    }));
    return h('section', { class: 'elan' + (nouveau ? ' elan--nouveau' : ''), 'aria-label': 'Jauge du déménagement' },
      h('button', { type: 'button', class: 'elan__tete', 'aria-expanded': 'false', onclick: function (ev) { detail.hidden = !detail.hidden; ev.currentTarget.setAttribute('aria-expanded', String(!detail.hidden)); } },
        h('span', { class: 'elan__titre', text: 'Jauge du déménagement' }), h('span', { class: 'elan__pc', text: pc + ' %' })),
      h('div', { class: 'elan__barre', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pc) },
        h('div', { class: 'elan__plein', style: 'width:' + pc + '%' }),
        paliers.map(function (p) { return h('i', { class: 'elan__repere' + (pc >= p.pc ? ' elan__repere--ok' : ''), style: 'left:' + p.pc + '%', title: p.titre }); })),
      h('p', { class: 'elan__texte', text: nouveau ? '🎉 Palier atteint : ' + dernier.titre + ' ! ' + (dernier.texte || '') : (prochain ? 'Prochain palier : ' + prochain.pc + ' % – ' + prochain.titre + '. Chaque quiz, visite, souvenir ou jeu fait avancer l\'équipe.' : (dernier ? dernier.texte : '')) }),
      detail);
  }

  /* ---------- QR code scanné (lien #qr=CODE) ---------- */
  function lireLienQr() {
    var m = /[#&]qr=([A-Za-z0-9]{6,12})/.exec(location.hash || '');
    if (m) { try { localStorage.setItem(CLE.qrAttente, JSON.stringify(m[1].toUpperCase())); } catch (e) { /* stockage bloqué */ } history.replaceState(null, '', location.pathname + location.search); }
  }
  function apresAccueil() { // appelé par l'accueil : traite un QR code scanné en attente
    init();
    var code = A.stock.lire(CLE.qrAttente);
    if (code) { A.stock.effacer(CLE.qrAttente); trouverQr(code); }
  }
  function trouverQr(code) {
    var s = session(); if (!s) return;
    page('QR code', 'Chasse aux QR codes', attente(), hub);
    A.Api.appeler('qr_trouver', { jeton: s.jeton, code: code }).then(function (r) {
      var t = A.stock.lire(CLE.qr) || {}, deja = !!t[r.code]; t[r.code] = r.nom; A.stock.ecrire(CLE.qr, t);
      return chargerEtat().catch(function () { return null; }).then(function () { return qrTotal(); }).then(function (total) {
        var n = Object.keys(t).length, nouveaux = badgesQr(n, total);
        var zone = h('div', { class: 'quiz-plan' });
        page('QR code trouvé !', 'Chasse aux QR codes', h('div', { class: 'qr-trouve' },
          h('p', { class: 'qr-trouve__titre', text: deja ? 'Déjà trouvé : ' + r.nom : '🎯 ' + r.nom }),
          r.message ? h('p', { class: 'quiz-explication', text: r.message }) : null,
          h('p', { class: 'section__note', text: n + ' QR code' + (n > 1 ? 's' : '') + ' trouvé' + (n > 1 ? 's' : '') + (total ? ' sur ' + total : '') + '.' }),
          nouveaux.length ? h('p', { class: 'flash', text: 'Nouveau badge : ' + nouveaux.join(', ') + ' !' }) : null,
          r.cible ? zone : null,
          h('div', { class: 'quiz-actions' }, h('button', { class: 'bouton', type: 'button', onclick: function () { ecranQr(); }, text: 'Mes QR codes' }),
            h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { A.ecranAccueil(); }, text: 'Accueil' }))), hub);
        if (r.cible) chargerPlan().then(function (p) { montrerSurPlan(zone, p, r.cible); }).catch(function () { zone.remove(); });
        if (!deja) { drapeau('qr'); if (window.ReaFun) window.ReaFun.succes(); }
      });
    }).catch(function (e) {
      if (erreurSession(e)) return;
      page('QR code', 'Chasse aux QR codes', h('div', null, h('p', { class: 'vide', text: e.code === 'qr_inconnu' ? 'Ce QR code n\'existe pas ou n\'est plus actif.' : e.code === 'jeu_inactif' ? 'La chasse aux QR codes n\'est pas ouverte.' : A.message(e.code) }),
        e.code === 'reseau' ? h('p', { class: 'section__note', text: 'Il faut du réseau pour valider un QR code. Il sera validé à votre prochaine connexion.' }) : null), hub);
      if (e.code === 'reseau') A.stock.ecrire(CLE.qrAttente, code);
    });
  }
  function qrTotal() { var s = session(); return A.Api.appeler('qr_liste', { jeton: s.jeton }).then(function (r) { return r.total; }).catch(function () { return null; }); }
  function badgesQr(n, total) {
    var b = A.stock.lire(A.CLE.badges) || {}, l = [];
    if (n >= 5 && !b.qr5) { window.ReaBadges.attribuer('qr5'); l.push('Explorateur'); }
    if (n >= 10 && !b.qr10) { window.ReaBadges.attribuer('qr10'); l.push('Grand explorateur'); }
    if (total && n >= total && !b.qrtous) { window.ReaBadges.attribuer('qrtous'); l.push('Tous les QR codes'); }
    return l;
  }
  var PLAN = null;
  function chargerPlan() {
    if (PLAN) return Promise.resolve(PLAN);
    var s = session();
    return A.Api.appeler('plan', { jeton: s.jeton }).then(function (r) { A.mettrePlanEnCache(r); PLAN = r; return r; })
      .catch(function (e) { return A.planEnCache().then(function (c) { if (c) { PLAN = c; return c; } throw e; }); });
  }
  function cloner(o) { return JSON.parse(JSON.stringify(o)); }
  function montrerSurPlan(zone, p, cible) {
    var vue = { textes: 'tout', titres: 'normal', points: true, marques: /^Q/.test(cible) ? [{ point: cible, couleur: VERT }] : [{ id: cible, couleur: VERT, fond: VERT }] };
    var plan = window.ReaPlan.creer(zone, { donnees: cloner(p.donnees), reglages: cloner(p.reglages || {}), quiz: vue, mode: 'texte' });
    var bb = null;
    if (/^Q/.test(cible)) { var q = p.reglages && p.reglages.points && p.reglages.points[cible]; if (q) bb = [q.x - 120, q.y - 120, q.x + 120, q.y + 120]; }
    else { var x = plan.pieces().filter(function (y) { return y.id === cible; })[0]; if (x) bb = x.bbox; }
    if (bb) plan.voir(bb, 3);
    return plan;
  }

  /* ---------- Rubrique Jeux ---------- */
  var JEUX_HUB = [
    { id: 'concours', ic: '🏆', nom: 'Concours photo', desc: 'Les plus belles photos du CHU actuel, votes anonymes', ouvrir: function () { ecranConcours(); } },
    { id: 'nuage', ic: '☁️', nom: 'Le nuage', desc: 'Ce que j\'emporte, ce que je laisse…', ouvrir: function () { ecranNuage(); } },
    { id: 'qr', ic: '🔎', nom: 'QR codes cachés', desc: 'Trouvez-les dans le nouveau service', ouvrir: function () { ecranQr(); } },
    { id: 'escape', ic: '🔓', nom: 'Escape game', desc: 'Quatre missions pour préparer le jour J', ouvrir: function () { ecranEscape(); } },
    { id: 'bingo', ic: '🎱', nom: 'Bingo du déménagement', desc: 'Une grille à compléter avant le départ', ouvrir: function () { ecranBingo(); } },
    { id: 'paris', ic: '🎲', nom: 'Paris', desc: 'Cartons, premier et dernier patient…', ouvrir: function () { ecranParis(); } }
  ];
  // Section « Quiz » de la rubrique : séries par thème et écran des badges
  function sectionQuiz() {
    if (!window.ReaQuiz) return null;
    function t(cle, ic, nom, desc) { return h('button', { type: 'button', class: 'quiz-theme', 'data-ic': ic, onclick: function () { window.ReaQuiz.theme(cle, hub); } }, h('b', { text: nom }), h('span', { text: desc })); }
    return h('section', { class: 'section' },
      h('div', { class: 'section__tete' }, h('h2', { text: 'Quiz' }), h('span', { class: 'section__note', text: 'Les questions ratées reviennent plus souvent' })),
      h('div', { class: 'quiz-themes' },
        t('plan', '🧭', 'Plan et équipements', 'Où se trouve… ? Sur le plan ou en QCM'),
        t('urgences', '🚨', 'Urgences et sécurité', 'Chariots d\'urgence, sécurité, réflexes'),
        t('couleurs', '🎨', 'Couleurs des unités', 'Reconnaître chaque unité à sa couleur'),
        h('button', { type: 'button', class: 'quiz-theme', 'data-ic': '🏅', onclick: function () { window.ReaQuiz.ouvrir(hub); } }, h('b', { text: 'Badges et défi d\'équipe' }), h('span', { text: 'Vos badges du quiz, le compteur de l\'équipe' }))));
  }
  function hub() {
    init();
    var s = session(); if (!s) return A.ecranConnexion();
    A.definirEcran(null);
    page('Quiz et jeux', 'Pour tous', h('div', null, sectionQuiz(), attente()), function () { A.ecranAccueil(); });
    chargerEtat().then(function (e) {
      var actifs = JEUX_HUB.filter(function (j) { var x = e.jeux[j.id]; return x && (x.actif || (j.id === 'paris' && x.termine) || (j.id === 'concours' && x.termine) || (j.id === 'escape' && e.referent && x.actifBrut)); });
      page('Quiz et jeux', e.admin ? 'Administrateur' : 'Pour tous', h('div', null,
        e.elan ? sectionJauge(e.elan) : null,
        sectionQuiz(),
        h('div', { class: 'section__tete' }, h('h2', { text: 'Jeux' })),
        actifs.length ? h('div', { class: 'quiz-themes' }, actifs.map(function (j) {
          var x = e.jeux[j.id];
          return h('button', { type: 'button', class: 'quiz-theme', 'data-ic': j.ic, onclick: j.ouvrir }, h('b', { text: j.nom }),
            h('span', { text: x.actif ? j.desc + (x.fermeture ? ' · jusqu\'au ' + dateFr(x.fermeture) : '') : (x.termine ? 'Terminé : voir les résultats' : 'Réservé aux référents (validation)') }));
        })) : h('p', { class: 'vide', text: 'Aucun jeu ouvert pour le moment. Revenez bientôt !' }),
        e.admin ? h('button', { class: 'bouton bouton--discret jeux__reglages', type: 'button', onclick: function () { reglages(); }, text: '⚙ Activer et régler les jeux' }) : null), function () { A.ecranAccueil(); });
    }).catch(function (e) { if (!erreurSession(e)) page('Quiz et jeux', '', h('div', null, sectionQuiz(), messageErreur(e, hub)), function () { A.ecranAccueil(); }); });
  }

  /* ---------- Photos : compression sur le téléphone ---------- */
  function compresser(fichier, cote, qualite) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () {
        var e = Math.min(1, cote / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * e); c.height = Math.round(img.naturalHeight * e);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var d = c.toDataURL('image/jpeg', qualite);
        ok({ data: d.slice(d.indexOf(',') + 1), ratio: c.height / c.width, apercu: d });
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('image')); };
      img.src = url;
    });
  }
  function b64EnUrl(b64) {
    var bin = atob(b64), o = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([o], { type: 'image/jpeg' }));
  }
  function photo(id, taille) { // URL d'image (copie gardée sur le téléphone)
    var cle = 'souv/' + id + '/' + taille;
    function reseau() {
      return A.Api.appeler('souvenir_photo', { jeton: session().jeton, id: id, taille: taille }).then(function (r) {
        if (window.caches && session()) caches.open(A.CACHE_DONNEES).then(function (c) { c.put(cle, new Response(r.data)); }).catch(function () {});
        return b64EnUrl(r.data);
      });
    }
    if (!window.caches) return reseau();
    return caches.open(A.CACHE_DONNEES).then(function (c) { return c.match(cle); }).then(function (r) { return r ? r.text().then(b64EnUrl) : reseau(); }, reseau);
  }

  /* ---------- Souvenirs et concours ---------- */
  function ecranSouvenirs() { ecranGalerie('souvenir'); }
  function ecranConcours() { ecranGalerie('concours'); }
  function ecranGalerie(type, flash, onglet) {
    init();
    var s = session(); if (!s) return A.ecranConnexion();
    var concours = type === 'concours', titre = concours ? 'Concours photo' : 'Souvenirs', retour = concours ? hub : function () { A.ecranAccueil(); };
    A.definirEcran(null);
    page(titre, concours ? 'Votes anonymes' : 'Le CHU actuel', attente(), retour);
    Promise.all([chargerEtat().catch(function () { return ETAT; }), A.Api.appeler('souvenirs', { jeton: s.jeton, type: type })]).then(function (t) {
      var d = t[1], vote = A.stock.lire(CLE.coeurs) || {}, cfg = ETAT && ETAT.jeux[concours ? 'concours' : 'souvenirs'];
      ecrireCache('souv/liste/' + type, d);
      var publies = d.souvenirs.filter(function (x) { return x.statut !== 'attente'; }), enAttente = d.souvenirs.filter(function (x) { return x.statut === 'attente'; });
      var vue = onglet || 'mosaique', zone = h('div');
      function dessiner() {
        var onglets = h('div', { class: 'plan__filtres' },
          h('button', { type: 'button', 'aria-pressed': String(vue === 'mosaique'), onclick: function () { vue = 'mosaique'; dessiner(); } }, concours ? 'Les photos' : 'Mosaïque'),
          d.peutModerer ? h('button', { type: 'button', 'aria-pressed': String(vue === 'attente'), onclick: function () { vue = 'attente'; dessiner(); } }, 'À valider (' + enAttente.length + ')') : null);
        var liste = vue === 'attente' ? enAttente : publies;
        if (concours && d.podium && vue === 'mosaique') liste = d.podium.map(function (id) { return publies.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean)
          .concat(publies.filter(function (x) { return d.podium.indexOf(x.id) < 0; }));
        remplir(zone,
          flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
          (cfg && cfg.actif) || !concours ? h('div', { class: 'quiz-actions' },
            cfg && cfg.actif ? h('button', { class: 'bouton', type: 'button', onclick: function () { formulaireSouvenir(type); }, text: concours ? '+ Participer avec une photo' : '+ Partager un souvenir' }) : null,
            !concours && publies.some(function (x) { return x.photo; }) ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { diaporama(publies.filter(function (x) { return x.photo; })); }, text: '▶ Diaporama' }) : null) : null,
          concours ? h('p', { class: 'section__note', text: d.coeursVisibles ? (d.podium && d.podium.length ? 'Le concours est terminé : voici le podium !' : 'Résultats du concours.') : 'Touchez ♡ sous vos photos préférées (un cœur par photo). Les votes seront révélés à la clôture' + (d.fermeture ? ', le ' + dateFr(d.fermeture) : '') + '.' }) : null,
          onglets,
          liste.length ? h('div', { class: 'mosaique' }, liste.map(function (x, i) { return tuile(x, i, vue === 'attente'); }))
            : h('p', { class: 'vide', text: vue === 'attente' ? 'Rien à valider.' : (concours ? 'Pas encore de photo : soyez le premier !' : 'Pas encore de souvenir : partagez le premier !') }));
        setTimeout(function () { chargerMiniatures(zone); }, 0); // une fois la mosaïque affichée
      }
      function tuile(x, i, moderation) {
        var rang = concours && d.podium && !moderation ? d.podium.indexOf(x.id) : -1;
        var coeur = h('button', { type: 'button', class: 'coeur' + (vote[x.id] ? ' coeur--plein' : ''), 'aria-pressed': String(!!vote[x.id]), 'aria-label': 'J\'aime',
          disabled: moderation || (concours && !(cfg && cfg.actif)), onclick: function (ev) { ev.stopPropagation(); aimer(x, ev.currentTarget); } },
          vote[x.id] ? '♥' : '♡', x.coeurs != null ? h('span', { text: ' ' + x.coeurs }) : null);
        return h('article', { class: 'tuile' + (x.photo ? '' : ' tuile--texte') + (rang >= 0 ? ' tuile--podium' : ''), style: x.photo ? 'aspect-ratio:1/' + Math.min(1.6, Math.max(0.6, x.ratio || 1)) : null },
          h('button', { type: 'button', class: 'tuile__ouvrir', onclick: function () { detail(x, moderation); } },
            x.photo ? h('span', { class: 'tuile__img', 'data-mini': x.id }) : h('span', { class: 'tuile__citation', text: '« ' + (x.texte.length > 140 ? x.texte.slice(0, 137) + '…' : x.texte) + ' »' }),
            rang >= 0 ? h('span', { class: 'tuile__rang', text: ['🥇', '🥈', '🥉'][rang] }) : null,
            h('span', { class: 'tuile__legende', text: x.titre || (x.annee ? x.annee : '') || (x.signature || '') })),
          moderation ? h('div', { class: 'quiz-actions tuile__moderation' },
            h('button', { class: 'bouton', type: 'button', onclick: function (ev) { moderer(x.id, 'publier', ev.currentTarget); }, text: 'Publier' }),
            h('button', { class: 'bouton bouton--discret bouton--danger', type: 'button', onclick: function (ev) { moderer(x.id, 'refuser', ev.currentTarget); }, text: 'Refuser' })) : coeur);
      }
      function aimer(x, b) {
        var plus = !vote[x.id]; b.disabled = true;
        A.Api.appeler('souvenir_coeur', { jeton: s.jeton, id: x.id, plus: plus }).then(function (r) {
          if (plus) vote[x.id] = 1; else delete vote[x.id]; A.stock.ecrire(CLE.coeurs, vote);
          x.coeurs = r.coeurs; b.disabled = false; b.className = 'coeur' + (plus ? ' coeur--plein' : ''); b.setAttribute('aria-pressed', String(plus));
          remplir(b, plus ? '♥' : '♡', r.coeurs != null ? h('span', { text: ' ' + r.coeurs }) : null);
        }).catch(function (e) { b.disabled = false; A.alerteDouce(b.parentNode, A.message(e.code)); });
      }
      function moderer(id, statut, b) {
        b.disabled = true;
        A.Api.appeler('souvenir_moderer', { jeton: s.jeton, id: id, statut: statut }).then(function () { ecranGalerie(type, statut === 'publier' ? 'Publié.' : 'Refusé (photo supprimée).', 'attente'); })
          .catch(function (e) { b.disabled = false; A.alerteDouce(b.parentNode, A.message(e.code)); });
      }
      function detail(x, moderation) {
        var img = h('div', { class: 'detail__img' }), fond = h('div', { class: 'detail', role: 'dialog', 'aria-modal': 'true', 'aria-label': x.titre || 'Souvenir', onclick: function (ev) { if (ev.target === fond) fermer(); } });
        function fermer() { fond.remove(); document.removeEventListener('keydown', echap); }
        function echap(ev) { if (ev.key === 'Escape') fermer(); }
        remplir(fond, h('div', { class: 'detail__carte' },
          h('button', { type: 'button', class: 'detail__fermer', 'aria-label': 'Fermer', onclick: fermer, text: '×' }),
          x.photo ? img : null,
          x.titre ? h('h2', { text: x.titre }) : null,
          x.texte ? h('p', { class: 'detail__texte', text: x.texte }) : null,
          h('p', { class: 'section__note', text: [x.annee, x.lieu, x.signature ? '— ' + x.signature : ''].filter(Boolean).join(' · ') })));
        document.body.appendChild(fond); document.addEventListener('keydown', echap);
        if (x.photo) { img.appendChild(h('div', { class: 'squelette', style: 'aspect-ratio:1/' + (x.ratio || 1) })); photo(x.id, 'grand').then(function (u) { remplir(img, h('img', { src: u, alt: x.titre || 'Photo souvenir' })); }).catch(function () {}); }
      }
      dessiner();
      page(titre, concours ? 'Votes anonymes' : 'Le CHU actuel', zone, retour);
    }).catch(function (e) { if (!erreurSession(e)) page(titre, '', messageErreur(e, function () { ecranGalerie(type); }), retour); });
  }
  function chargerMiniatures(zone) {
    var l = Array.prototype.slice.call(zone.querySelectorAll('[data-mini]'));
    (function suivante(i) {
      if (i >= l.length || !l[i].isConnected) return;
      photo(l[i].getAttribute('data-mini'), 'mini').then(function (u) { l[i].appendChild(h('img', { src: u, alt: '' })); }).catch(function () {}).then(function () { suivante(i + 1); });
    })(0);
  }
  function diaporama(liste) {
    var i = 0, pause = false, minuterie = null;
    var img = h('img', { alt: '' }), leg = h('p', { class: 'diapo__legende' }), etat = h('span', { class: 'diapo__etat' });
    var fond = h('div', { class: 'diapo', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Diaporama des souvenirs' },
      img, leg, etat,
      h('button', { type: 'button', class: 'diapo__fermer', 'aria-label': 'Fermer le diaporama', onclick: fermer, text: '×' }),
      h('button', { type: 'button', class: 'diapo__nav diapo__nav--prec', 'aria-label': 'Précédent', onclick: function (ev) { ev.stopPropagation(); aller(i - 1); }, text: '‹' }),
      h('button', { type: 'button', class: 'diapo__nav diapo__nav--suiv', 'aria-label': 'Suivant', onclick: function (ev) { ev.stopPropagation(); aller(i + 1); }, text: '›' }));
    fond.addEventListener('click', function () { pause = !pause; etat.textContent = pause ? '⏸ Pause' : ''; if (!pause) programmer(); });
    function fermer() { clearTimeout(minuterie); fond.remove(); document.removeEventListener('keydown', clavier); if (document.fullscreenElement) document.exitFullscreen().catch(function () {}); }
    function clavier(e) { if (e.key === 'Escape') fermer(); if (e.key === 'ArrowRight') aller(i + 1); if (e.key === 'ArrowLeft') aller(i - 1); }
    function programmer() { clearTimeout(minuterie); minuterie = setTimeout(function () { if (!pause) aller(i + 1); }, 6000); }
    function aller(k) {
      i = (k + liste.length) % liste.length; var x = liste[i];
      leg.textContent = [x.titre, x.annee, x.signature].filter(Boolean).join(' · ');
      photo(x.id, 'grand').then(function (u) { img.src = u; img.alt = x.titre || 'Souvenir'; });
      programmer();
    }
    document.body.appendChild(fond); document.addEventListener('keydown', clavier);
    if (fond.requestFullscreen) fond.requestFullscreen().catch(function () {});
    aller(0);
  }
  function formulaireSouvenir(type) {
    var concours = type === 'concours', s = session(), image = null;
    var entree = h('input', { type: 'file', id: 'sv-photo', accept: 'image/*' }), apercu = h('div', { class: 'sv-apercu' });
    var titre = h('input', { type: 'text', id: 'sv-titre', maxlength: '80', placeholder: concours ? 'Ex. : Lever de soleil sur le parking' : 'Ex. : Le pot de départ de Josette' });
    var texte = h('textarea', { id: 'sv-texte', maxlength: '1200', rows: '4', placeholder: 'Racontez…' });
    var annee = h('input', { type: 'text', id: 'sv-annee', maxlength: '20', placeholder: 'Ex. : vers 2005' });
    var lieu = h('input', { type: 'text', id: 'sv-lieu', maxlength: '60', placeholder: 'Ex. : salle de pause' });
    var sign = h('input', { type: 'text', id: 'sv-sign', maxlength: '60', placeholder: 'Ex. : Marie, IDE (ou laissez vide)' });
    var c1 = h('input', { type: 'checkbox', id: 'sv-c1' }), c2 = h('input', { type: 'checkbox', id: 'sv-c2' });
    var regles = h('div', { class: 'sv-regles', hidden: true },
      h('label', { class: 'quiz-form-ligne' }, c1, h('span', { text: 'Aucun patient sur la photo : ni visage, ni dossier, ni écran, ni bracelet, ni étiquette.' })),
      h('label', { class: 'quiz-form-ligne' }, c2, h('span', { text: 'Les collègues reconnaissables sont d\'accord pour apparaître.' })));
    var erreur = h('p', { class: 'message-erreur', role: 'alert' }), bouton = h('button', { class: 'bouton', type: 'submit', text: 'Envoyer' });
    entree.addEventListener('change', function () {
      var f = entree.files && entree.files[0]; image = null; remplir(apercu); regles.hidden = !f; if (!f) return;
      erreur.textContent = ''; bouton.disabled = true; apercu.appendChild(h('p', { class: 'section__note', text: 'Préparation de la photo…' }));
      Promise.all([compresser(f, 1600, 0.82), compresser(f, 420, 0.72)]).then(function (t) {
        image = { photo: t[0].data, mini: t[1].data, ratio: t[0].ratio };
        remplir(apercu, h('img', { src: t[1].apercu, alt: 'Aperçu' })); bouton.disabled = false;
      }).catch(function () { remplir(apercu); erreur.textContent = 'Cette image n\'a pas pu être lue. Essayez une autre photo (JPEG ou PNG).'; bouton.disabled = false; });
    });
    var form = h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); erreur.textContent = '';
      if (concours && !image) { erreur.textContent = 'Choisissez une photo.'; return; }
      if (!image && texte.value.trim().length < 3) { erreur.textContent = 'Ajoutez une photo ou un texte.'; return; }
      if (image && !(c1.checked && c2.checked)) { erreur.textContent = 'Cochez les deux règles pour la photo.'; return; }
      var d = { type: type, titre: titre.value.trim(), texte: texte.value.trim(), annee: annee.value.trim(), lieu: lieu.value.trim(), signature: sign.value.trim() };
      if (image) { d.photo = image.photo; d.mini = image.mini; d.ratio = image.ratio; d.consentement = true; }
      bouton.disabled = true; bouton.textContent = 'Envoi…';
      A.Api.appeler('souvenir_ajouter', { jeton: s.jeton, donnees: d }).then(function () {
        drapeau(concours ? 'concours' : 'souvenir');
        ecranGalerie(type, 'Merci ! ' + (concours ? 'Votre photo' : 'Votre souvenir') + ' sera visible après validation par un référent.');
      }).catch(function (e) { erreur.textContent = A.message(e.code); bouton.disabled = false; bouton.textContent = 'Envoyer'; });
    } },
      h('div', { class: 'champ' }, h('label', { for: 'sv-photo', text: concours ? 'Photo du CHU actuel' : 'Photo (facultatif)' }), entree), apercu, regles,
      h('div', { class: 'champ' }, h('label', { for: 'sv-titre', text: 'Titre' + (concours ? '' : ' (facultatif)') }), titre),
      concours ? null : h('div', { class: 'champ' }, h('label', { for: 'sv-texte', text: 'Anecdote ou souvenir' }), texte),
      concours ? null : h('div', { class: 'grille-2' }, h('div', { class: 'champ' }, h('label', { for: 'sv-annee', text: 'Année (facultatif)' }), annee),
        h('div', { class: 'champ' }, h('label', { for: 'sv-lieu', text: 'Lieu au CHU actuel (facultatif)' }), lieu)),
      h('div', { class: 'champ' }, h('label', { for: 'sv-sign', text: 'Signature (facultatif)' }), sign),
      h('p', { class: 'section__note', text: 'Un référent vérifie chaque envoi avant publication.' }),
      erreur, h('div', { class: 'quiz-actions' }, h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { ecranGalerie(type); }, text: 'Annuler' }), bouton));
    page(concours ? 'Participer au concours' : 'Partager un souvenir', '', form, function () { ecranGalerie(type); });
  }

  /* ---------- Nuage de mots ---------- */
  var COULEURS_NUAGE = ['#223b80', '#1f6fa8', '#048e39', '#c2416f', '#d9600b', '#5c2e9e', '#0e8f86', '#7a5a00'];
  function ecranNuage(flash, qInit) {
    init();
    var s = session(); page('Le nuage', 'Anonyme', attente());
    A.Api.appeler('nuage', { jeton: s.jeton }).then(function (d) {
      var q = qInit || 0, zone = h('div');
      function dessiner() {
        var mots = d.mots.filter(function (m) { return m.q === q; }), max = Math.max.apply(null, mots.map(function (m) { return m.n; }).concat([1]));
        var champ = h('input', { type: 'text', id: 'nu-mot', maxlength: '40', placeholder: '1 à 3 mots', autocomplete: 'off' }), erreur = h('p', { class: 'message-erreur', role: 'alert' });
        var bouton = h('button', { class: 'bouton', type: 'submit', text: 'Ajouter' });
        remplir(zone,
          flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
          h('div', { class: 'plan__filtres' }, d.questions.map(function (t, i) { return h('button', { type: 'button', 'aria-pressed': String(i === q), onclick: function () { q = i; flash = null; dessiner(); } }, t); })),
          h('div', { class: 'nuage', 'aria-label': 'Nuage : ' + d.questions[q] },
            mots.length ? melanger(mots).map(function (m, i) {
              var taille = 0.95 + 1.9 * Math.sqrt(m.n / max);
              return h(d.peutModerer ? 'button' : 'span', { class: 'nuage__mot', type: d.peutModerer ? 'button' : null, style: 'font-size:' + taille.toFixed(2) + 'rem;color:' + COULEURS_NUAGE[i % COULEURS_NUAGE.length],
                title: m.n + ' fois', onclick: d.peutModerer ? function (ev) { retirer(m, ev.currentTarget); } : null }, m.mot);
            }) : h('p', { class: 'vide', text: 'Le nuage est vide : à vous le premier mot !' })),
          h('form', { class: 'nuage__form', onsubmit: function (ev) {
            ev.preventDefault(); var v = champ.value.trim(); erreur.textContent = '';
            if (v.length < 2) { erreur.textContent = 'Écrivez au moins un mot.'; return; }
            if (v.split(/\s+/).length > 3) { erreur.textContent = '3 mots maximum.'; return; }
            bouton.disabled = true;
            A.Api.appeler('nuage_ajouter', { jeton: s.jeton, q: q, mot: v }).then(function () { drapeau('nuage'); ecranNuage('Merci ! Votre mot a rejoint le nuage.', q); })
              .catch(function (e) { bouton.disabled = false; erreur.textContent = e.code === 'mot_refuse' ? 'Ce mot n\'est pas accepté.' : A.message(e.code); });
          } }, h('label', { for: 'nu-mot', class: 'plan__label', text: d.questions[q] }), h('div', { class: 'nuage__saisie' }, champ, bouton), erreur),
          h('p', { class: 'section__note', text: 'Anonyme : votre nom n\'est jamais enregistré.' + (d.peutModerer ? ' Référents : touchez un mot pour le retirer.' : '') }));
      }
      function retirer(m, b) {
        if (b.dataset.confirme !== '1') { b.dataset.confirme = '1'; b.classList.add('nuage__mot--retirer'); b.textContent = 'Retirer « ' + m.mot + ' » ?'; return; }
        A.Api.appeler('nuage_retirer', { jeton: s.jeton, ids: m.ids }).then(function () { ecranNuage('Mot retiré.', q); }).catch(function (e) { A.alerteDouce(b.parentNode, A.message(e.code)); });
      }
      dessiner(); page('Le nuage', 'Anonyme', zone);
    }).catch(function (e) { if (!erreurSession(e)) page('Le nuage', '', messageErreur(e, function () { ecranNuage(); })); });
  }

  /* ---------- QR codes cachés ---------- */
  function ecranQr(flash) {
    init();
    var s = session(), t = A.stock.lire(CLE.qr) || {}, n = Object.keys(t).length;
    page('QR codes cachés', 'Chasse', attente());
    A.Api.appeler('qr_liste', { jeton: s.jeton }).then(function (d) {
      var champ = h('input', { type: 'text', id: 'qr-code', maxlength: '12', placeholder: 'Ex. : K7M2Q9XA', autocapitalize: 'characters', autocomplete: 'off' });
      var b = A.stock.lire(A.CLE.badges) || {};
      page('QR codes cachés', 'Chasse', h('div', null,
        flash ? h('p', { class: 'flash', text: flash }) : null,
        h('section', { class: 'quiz-jour' },
          h('p', { class: 'quiz-fin__score' }, h('b', { text: n + ' / ' + d.total }), ' QR codes trouvés'),
          h('p', { class: 'section__note', text: 'Des QR codes sont cachés dans le nouveau service. Scannez-les avec l\'appareil photo de votre téléphone, ou tapez le code écrit dessous.' })),
        h('form', { class: 'nuage__form', onsubmit: function (ev) { ev.preventDefault(); var c = champ.value.trim().toUpperCase(); if (c.length >= 6) trouverQr(c); } },
          h('label', { for: 'qr-code', class: 'plan__label', text: 'Saisir un code' }), h('div', { class: 'nuage__saisie' }, champ, h('button', { class: 'bouton', type: 'submit', text: 'Valider' }))),
        h('section', { class: 'section' }, h('div', { class: 'section__tete' }, h('h2', { text: 'Badges' })),
          h('ul', { class: 'quiz-badges' }, [['qr5', 'Explorateur', '5 QR codes'], ['qr10', 'Grand explorateur', '10 QR codes'], ['qrtous', 'Tous trouvés', d.total + ' QR codes']].map(function (x) {
            return h('li', { class: b[x[0]] ? 'quiz-badge quiz-badge--ok' : 'quiz-badge' }, h('b', { text: (b[x[0]] ? '★ ' : '') + x[1] }), h('span', { text: x[2] }));
          }))),
        n ? h('section', { class: 'section' }, h('div', { class: 'section__tete' }, h('h2', { text: 'Mes trouvailles' })),
          h('ul', { class: 'liste-simple' }, Object.keys(t).map(function (c) { return h('li', { text: '✓ ' + t[c] }); }))) : null,
        d.qr ? adminQr(d.qr) : null));
    }).catch(function (e) { if (!erreurSession(e)) page('QR codes cachés', '', messageErreur(e, function () { ecranQr(); })); });
  }
  function urlQr(code) { return location.origin + location.pathname.replace(/[^/]*$/, '') + '#qr=' + code; }
  function adminQr(liste) {
    var s = session();
    return h('section', { class: 'section' },
      h('div', { class: 'section__tete' }, h('h2', { text: 'Gestion (admin)' }), h('span', { class: 'section__note', text: liste.length + ' QR code(s)' })),
      h('div', { class: 'quiz-actions' },
        h('button', { class: 'bouton', type: 'button', onclick: function () { formulaireQr(null); }, text: '+ Nouveau QR code' }),
        liste.length ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function (ev) { imprimerQr(liste.filter(function (q) { return q.actif; }), ev.currentTarget); }, text: 'Imprimer la planche (PDF)' }) : null),
      h('ul', { class: 'quiz-liste' }, liste.map(function (q) {
        return h('li', { class: 'quiz-carte' },
          h('p', { class: 'quiz-carte__texte', text: q.nom + (q.actif ? '' : ' (désactivé)') }),
          h('p', { class: 'section__note', text: 'Code ' + q.code + (q.message ? ' · ' + q.message : '') }),
          h('div', { class: 'quiz-actions' },
            h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { formulaireQr(q); }, text: 'Modifier' }),
            h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function (ev) {
              ev.currentTarget.disabled = true;
              A.Api.appeler('qr_enregistrer', { jeton: s.jeton, code: q.code, donnees: { nom: q.nom, cible: q.cible, message: q.message, actif: !q.actif } }).then(function () { ecranQr(q.actif ? 'QR code désactivé.' : 'QR code réactivé.'); });
            }, text: q.actif ? 'Désactiver' : 'Réactiver' }),
            (function () { var b = h('button', { class: 'bouton bouton--discret bouton--danger', type: 'button', text: 'Supprimer' });
              b.onclick = confirmer2(b, 'Confirmer la suppression', function () { A.Api.appeler('qr_enregistrer', { jeton: s.jeton, code: q.code, donnees: { supprimer: true } }).then(function () { ecranQr('QR code supprimé.'); }); }); return b; })()));
      })));
  }
  function formulaireQr(q) {
    var s = session(), cible = q ? q.cible : '', zone = h('div', { class: 'quiz-plan quiz-plan--form' }), resume = h('p', { class: 'section__note' });
    var nom = h('input', { type: 'text', id: 'qr-nom', maxlength: '60', value: q ? q.nom : '', placeholder: 'Ex. : Salle de détente' });
    var msg = h('textarea', { id: 'qr-msg', maxlength: '300', rows: '2', placeholder: 'Message affiché quand on le trouve (facultatif)' }); msg.value = q ? q.message : '';
    var erreur = h('p', { class: 'message-erreur', role: 'alert' }), bouton = h('button', { class: 'bouton', type: 'submit', text: 'Enregistrer' }), plan = null;
    function maj() { resume.textContent = cible ? 'Emplacement choisi sur le plan ✓ (touchez ailleurs pour changer)' : 'Touchez sur le plan l\'endroit où sera caché le QR code (facultatif).'; if (plan) plan.quiz({ marques: cible ? (/^Q/.test(cible) ? [{ point: cible, couleur: VERT }] : [{ id: cible, couleur: VERT, fond: VERT }]) : [] }); }
    page(q ? 'Modifier le QR code' : 'Nouveau QR code', 'Admin', h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); if (!nom.value.trim()) { erreur.textContent = 'Indiquez le lieu.'; return; }
      bouton.disabled = true;
      A.Api.appeler('qr_enregistrer', { jeton: s.jeton, code: q ? q.code : null, donnees: { nom: nom.value.trim(), message: msg.value.trim(), cible: cible, actif: q ? q.actif : true } })
        .then(function () { ecranQr(q ? 'QR code modifié.' : 'QR code créé : pensez à imprimer la planche.'); }).catch(function (e) { bouton.disabled = false; erreur.textContent = A.message(e.code); });
    } },
      h('div', { class: 'champ' }, h('label', { for: 'qr-nom', text: 'Lieu (affiché quand on le trouve)' }), nom),
      h('div', { class: 'champ' }, h('label', { for: 'qr-msg', text: 'Message' }), msg),
      resume, zone, erreur,
      h('div', { class: 'quiz-actions' }, h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { ecranQr(); }, text: 'Annuler' }), bouton)), function () { ecranQr(); });
    chargerPlan().then(function (p) {
      plan = window.ReaPlan.creer(zone, { donnees: cloner(p.donnees), reglages: cloner(p.reglages || {}), mode: 'texte', quiz: { textes: 'tout', titres: 'normal', points: true,
        surToucher: function (c) { if (c.type === 'piece' || c.type === 'point') { cible = c.id; maj(); } } } });
      maj();
    }).catch(function () { zone.remove(); resume.textContent = 'Plan indisponible hors ligne.'; });
  }
  function chargerScript(src) {
    return new Promise(function (ok, ko) { if (document.querySelector('script[src="' + src + '"]')) return ok(); var e = document.createElement('script'); e.src = src; e.onload = ok; e.onerror = ko; document.head.appendChild(e); });
  }
  function imprimerQr(liste, bouton) {
    bouton.disabled = true;
    Promise.all([chargerScript('vendor/qrcode.js'), chargerScript('vendor/jspdf.umd.min.js')]).then(function () {
      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), parPage = 6;
      liste.forEach(function (q, i) {
        if (i && i % parPage === 0) doc.addPage();
        var k = i % parPage, col = k % 2, lig = Math.floor(k / 2), x = 15 + col * 95, y = 13 + lig * 93;
        var qr = window.qrcode(0, 'M'); qr.addData(urlQr(q.code)); qr.make();
        var n = qr.getModuleCount(), taille = 62, m = taille / n;
        doc.setDrawColor(200); doc.setLineDashPattern([2, 2], 0); doc.rect(x - 5, y - 5, 90, 89); doc.setLineDashPattern([], 0);
        doc.setFillColor(34, 59, 128);
        for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) doc.rect(x + 9 + c * m, y + r * m, m + 0.02, m + 0.02, 'F');
        doc.setTextColor(34, 59, 128); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        doc.text('Réa – chasse aux QR codes', x + 40, y + taille + 7, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Code : ' + q.code, x + 40, y + taille + 13, { align: 'center' });
        doc.setFontSize(7); doc.setTextColor(140); doc.text(q.nom, x + 40, y + taille + 18, { align: 'center' }); // repère pour la pose (à découper si besoin)
      });
      doc.save('qr-codes-rea.pdf'); bouton.disabled = false;
    }).catch(function () { bouton.disabled = false; A.alerteDouce(bouton.parentNode, 'Impression impossible (réseau ?).'); });
  }

  /* ---------- Bingo ---------- */
  function casesAuto() { // cases qui se cochent toutes seules
    var b = A.stock.lire(A.CLE.badges) || {}, q = A.stock.lire('rea.quiz') || {}, nl = A.stock.lire('rea.nl-lues') || {}, qr = A.stock.lire(CLE.qr) || {}, es = A.stock.lire(CLE.escape) || {};
    return { visite: !!b.visite, quizjour: !!(q.jours && Object.keys(q.jours).length), qr: Object.keys(qr).length > 0, plan: !!b.plan, newsletter: Object.keys(nl).length > 0,
      souvenir: aDrapeau('souvenir'), nuage: aDrapeau('nuage'), pari: aDrapeau('pari'), escape: Object.keys(es).length > 0 };
  }
  function grilleBingo(cases) {
    var g = A.stock.lire(CLE.bingo) || {}, textes = cases.map(function (c) { return c.texte; });
    var ok = Array.isArray(g.grille) && g.grille.length === 16 && g.grille.every(function (t) { return textes.indexOf(t) >= 0; });
    if (!ok) { g.grille = melanger(textes).slice(0, 16); g.coches = (g.coches || []).filter(function (t) { return g.grille.indexOf(t) >= 0; }); A.stock.ecrire(CLE.bingo, g); }
    g.coches = g.coches || []; g.recompenses = g.recompenses || {};
    return g;
  }
  var LIGNES = (function () { var l = [], i; for (i = 0; i < 4; i++) { l.push([0, 1, 2, 3].map(function (c) { return i * 4 + c; })); l.push([0, 1, 2, 3].map(function (r) { return r * 4 + i; })); } l.push([0, 5, 10, 15], [3, 6, 9, 12]); return l; })();
  function ecranBingo(flash) {
    init();
    page('Bingo', 'Sur ce téléphone', attente());
    chargerEtat().then(function (e) {
      var cfg = e.jeux.bingo; if (!cfg || !cfg.actif) return page('Bingo', '', h('p', { class: 'vide', text: 'Le bingo n\'est pas ouvert.' }));
      var cases = cfg.reglages.cases, auto = casesAuto(), g = grilleBingo(cases), parTexte = {}; cases.forEach(function (c) { parTexte[c.texte] = c; });
      function coche(t) { var c = parTexte[t]; return (c.auto && auto[c.auto]) || g.coches.indexOf(t) >= 0; }
      function verifier() {
        var lignes = LIGNES.filter(function (l) { return l.every(function (k) { return coche(g.grille[k]); }); }).length, plein = g.grille.every(coche), msgs = [];
        var b = A.stock.lire(A.CLE.badges) || {};
        if ((lignes > (g.recompenses.lignes || 0) || (plein && !g.recompenses.plein)) && window.ReaFun) window.ReaFun.succes(plein);
        if (lignes > (g.recompenses.lignes || 0)) { point('bingo_ligne'); g.recompenses.lignes = lignes; msgs.push('Bingo ! Ligne complète'); if (!b.bingo) window.ReaBadges.attribuer('bingo'); }
        if (plein && !g.recompenses.plein) { point('bingo_plein'); g.recompenses.plein = true; msgs.push('CARTON PLEIN !'); if (!b.cartonplein) window.ReaBadges.attribuer('cartonplein'); }
        A.stock.ecrire(CLE.bingo, g);
        return msgs;
      }
      var initial = verifier();
      function dessiner(msg) {
        var nb = g.grille.filter(coche).length;
        page('Bingo du déménagement', 'Sur ce téléphone', h('div', null,
          msg ? h('p', { class: 'flash bingo__flash', role: 'status', text: '🎉 ' + msg }) : (flash ? h('p', { class: 'flash', text: flash }) : null),
          h('p', { class: 'section__note', text: nb + ' / 16 cases · Touchez une case quand c\'est fait. Les cases ✦ se cochent toutes seules.' }),
          h('div', { class: 'bingo', role: 'grid' }, g.grille.map(function (t) {
            var c = parTexte[t], ok = coche(t), autoOk = c.auto && auto[c.auto];
            return h('button', { type: 'button', class: 'bingo__case' + (ok ? ' bingo__case--ok' : '') + (c.auto ? ' bingo__case--auto' : ''), 'aria-pressed': String(ok), disabled: !!autoOk,
              onclick: function () { var i = g.coches.indexOf(t); if (i >= 0) g.coches.splice(i, 1); else g.coches.push(t); var m = verifier(); dessiner(m.join(' · ')); } },
              c.auto ? h('span', { class: 'bingo__auto', 'aria-hidden': 'true', text: '✦' }) : null, h('span', { text: t }));
          }))));
      }
      dessiner(initial.join(' · '));
    }).catch(function (e) { if (!erreurSession(e)) page('Bingo', '', messageErreur(e, function () { ecranBingo(); })); });
  }

  /* ---------- Paris ---------- */
  function ecranParis(flash) {
    init();
    var s = session(); page('Paris', 'Pseudos', attente());
    A.Api.appeler('paris', { jeton: s.jeton, appareil: appareil() }).then(function (d) {
      var pseudo = h('input', { type: 'text', id: 'pa-pseudo', maxlength: '30', value: A.stock.lire(CLE.pseudo) || '', placeholder: 'Ex. : La Mangouste' });
      page('Paris', 'Pseudos', h('div', null,
        flash ? h('p', { class: 'flash', text: flash }) : null,
        h('p', { class: 'section__note', text: d.ouvert ? 'Pariez sous un pseudo (aucun nom n\'est enregistré). Paris ouverts jusqu\'au ' + (d.fermeture ? dateFr(d.fermeture) : 'jour J') + ' ; vous pouvez modifier vos paris jusque-là.' : 'Les paris sont fermés. Résultats et podiums ci-dessous dès qu\'ils sont connus.' }),
        d.ouvert ? h('div', { class: 'champ' }, h('label', { for: 'pa-pseudo', text: 'Mon pseudo' }), pseudo) : null,
        h('ul', { class: 'quiz-liste' }, d.paris.map(function (p) { return cartePari(p, d, pseudo); })),
        d.admin ? adminParis(d) : null));
    }).catch(function (e) { if (!erreurSession(e)) page('Paris', '', messageErreur(e, function () { ecranParis(); })); });
  }
  function affichePari(p, v) {
    if (v == null || v === '') return '';
    if (p.type === 'dateheure') { var s = String(v); return s.slice(8, 10) + '/' + s.slice(5, 7) + ' à ' + s.slice(11, 13) + 'h' + s.slice(14, 16); }
    return Number(v).toLocaleString('fr-FR') + (p.unite ? ' ' + p.unite : '');
  }
  function ecartTexte(p, e) { if (p.type === 'dateheure') { var hh = Math.floor(e / 60), mm = Math.round(e % 60); return hh ? hh + ' h ' + mm + ' min' : mm + ' min'; } return Number(e).toLocaleString('fr-FR') + (p.unite ? ' ' + p.unite : ''); }
  function cartePari(p, d, pseudo) {
    var s = session(), entree = h('input', { type: p.type === 'dateheure' ? 'datetime-local' : 'number', min: '0', step: p.type === 'dateheure' ? '60' : 'any', 'aria-label': 'Mon pari', value: p.monPari ? p.monPari.valeur : '' });
    var erreur = h('p', { class: 'message-erreur', role: 'alert' }), bouton = h('button', { class: 'bouton', type: 'submit', text: p.monPari ? 'Modifier' : 'Parier' });
    return h('li', { class: 'quiz-carte' },
      h('p', { class: 'quiz-carte__texte', text: p.question }),
      h('p', { class: 'section__note', text: p.participants + ' pari' + (p.participants > 1 ? 's' : '') + (p.monPari ? ' · le vôtre : ' + affichePari(p, p.monPari.valeur) + ' (' + p.monPari.pseudo + ')' : '') }),
      p.resultat != null ? h('div', { class: 'pari__resultat' }, h('p', null, h('b', { text: 'Résultat : ' + affichePari(p, p.resultat) })),
        p.podium && p.podium.length ? h('ol', { class: 'pari__podium' }, p.podium.map(function (x, i) { return h('li', { text: ['🥇', '🥈', '🥉'][i] + ' ' + x.pseudo + ' – ' + affichePari(p, x.valeur) + ' (écart ' + ecartTexte(p, x.ecart) + ')' }); })) : null) : null,
      d.ouvert && p.resultat == null ? h('form', { class: 'nuage__saisie', onsubmit: function (ev) {
        ev.preventDefault(); erreur.textContent = '';
        var ps = pseudo.value.trim(); if (ps.length < 2) { erreur.textContent = 'Choisissez d\'abord un pseudo (en haut).'; pseudo.focus(); return; }
        if (!entree.value) { erreur.textContent = 'Indiquez votre pari.'; return; }
        bouton.disabled = true; A.stock.ecrire(CLE.pseudo, ps);
        A.Api.appeler('pronostic', { jeton: s.jeton, id: p.id, donnees: { pseudo: ps, valeur: entree.value, appareil: appareil() } }).then(function () { drapeau('pari'); ecranParis('Pari enregistré !'); })
          .catch(function (e) { bouton.disabled = false; erreur.textContent = e.code === 'pseudo_pris' ? 'Ce pseudo est déjà pris pour ce pari : choisissez-en un autre.' : A.message(e.code); });
      } }, entree, bouton) : null, erreur);
  }
  function adminParis(d) {
    var s = session(), q = h('input', { type: 'text', maxlength: '160', placeholder: 'Nouvelle question de pari', 'aria-label': 'Question' });
    var t = h('select', { 'aria-label': 'Type de réponse' }, h('option', { value: 'nombre', text: 'Nombre' }), h('option', { value: 'dateheure', text: 'Jour et heure' }));
    var u = h('input', { type: 'text', maxlength: '20', placeholder: 'Unité (ex. cartons)', 'aria-label': 'Unité' });
    return h('section', { class: 'section' }, h('div', { class: 'section__tete' }, h('h2', { text: 'Administration des paris' })),
      h('ul', { class: 'quiz-liste' }, d.paris.map(function (p) {
        var r = h('input', { type: p.type === 'dateheure' ? 'datetime-local' : 'number', 'aria-label': 'Résultat réel', value: p.resultat || '' });
        return h('li', { class: 'quiz-carte' }, h('p', { class: 'quiz-carte__texte', text: p.question }),
          h('form', { class: 'nuage__saisie', onsubmit: function (ev) { ev.preventDefault(); A.Api.appeler('pari_admin', { jeton: s.jeton, id: p.id, donnees: { resultat: r.value } }).then(function () { ecranParis('Résultat enregistré.'); }); } },
            r, h('button', { class: 'bouton', type: 'submit', text: 'Résultat' })),
          h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { A.Api.appeler('pari_admin', { jeton: s.jeton, id: p.id, donnees: { actif: false } }).then(function () { ecranParis('Pari masqué.'); }); }, text: 'Masquer ce pari' }));
      })),
      h('form', { class: 'form-carte', onsubmit: function (ev) { ev.preventDefault(); if (q.value.trim().length < 5) return; A.Api.appeler('pari_admin', { jeton: s.jeton, donnees: { question: q.value.trim(), type: t.value, unite: u.value.trim() } }).then(function () { ecranParis('Pari ajouté.'); }); } },
        h('h3', { text: 'Ajouter un pari' }), q, h('div', { class: 'grille-2' }, t, u), h('button', { class: 'bouton', type: 'submit', text: 'Ajouter' })));
  }

  /* ---------- Escape game ---------- */
  function ecranEscape(flash) {
    init();
    page('Escape game', 'Missions', attente());
    chargerEtat().then(function (e) {
      var cfg = e.jeux.escape, valides = (cfg.reglages && cfg.reglages.valides) || {}, faits = A.stock.lire(CLE.escape) || {};
      var visibles = window.REA_ESCAPE.filter(function (sc) { return valides[sc.id] || e.referent; });
      page('Escape game', 'Missions', h('div', null,
        flash ? h('p', { class: 'flash', text: flash }) : null,
        e.referent ? h('p', { class: 'section__note', text: 'Référents : jouez chaque mission, puis validez-la (ou laissez une remarque). Les agents ne voient que les missions validées.' }) : null,
        visibles.length ? h('div', { class: 'quiz-themes' }, visibles.map(function (sc) {
          return h('button', { type: 'button', class: 'quiz-theme' + (faits[sc.id] ? ' quiz-theme--fait' : ''), 'data-ic': sc.ic || '🔓', onclick: function () { jouerEscape(sc, e.referent, valides); } },
            h('b', { text: (faits[sc.id] ? '✓ ' : '') + sc.titre }), h('span', { text: sc.resume }),
            h('span', { class: 'etiquette', text: sc.duree + (valides[sc.id] ? '' : ' · à valider') }));
        })) : h('p', { class: 'vide', text: 'Aucune mission validée pour le moment.' })));
    }).catch(function (e) { if (!erreurSession(e)) page('Escape game', '', messageErreur(e, function () { ecranEscape(); })); });
  }
  function jouerEscape(sc, referent, valides) {
    var etapes = sc.etapes.slice(), k = -1, erreursTot = 0;
    chargerPlan().catch(function () { return null; }).then(function (p) {
      function suivante() {
        k++;
        if (k >= etapes.length) return fin();
        var et = etapes[k];
        if (et.type === 'plan' && !(p && resoudreCible(p, et.cible))) return suivante(); // élément pas encore sur le plan : étape sautée
        afficherEtape(et);
      }
      function cadre(contenu) {
        page(sc.titre, 'Étape ' + Math.min(k + 1, etapes.length) + ' / ' + etapes.length, h('div', { class: 'escape' },
          h('div', { class: 'escape__progression' }, h('div', { style: 'width:' + Math.round(100 * (k + 1) / etapes.length) + '%' })), contenu), function () { ecranEscape(); });
      }
      function afficherEtape(et) {
        var essais = 0, retour = h('div', { class: 'quiz-retour', 'aria-live': 'polite' }), corps = h('div', { class: 'quiz-question' });
        if (k === 0) corps.appendChild(h('p', { class: 'escape__intro', text: sc.resume }));
        function reussi() {
          if (window.ReaFun) window.ReaFun.reponse(true);
          remplir(retour, h('p', { class: 'quiz-verdict quiz-verdict--ok', text: essais ? 'C\'est ça !' : 'Bravo !' }), et.explication ? h('p', { class: 'quiz-explication', text: et.explication }) : null,
            h('button', { class: 'bouton', type: 'button', onclick: suivante, text: 'Continuer' }));
          retour.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        function rate(montrer) {
          essais++; erreursTot++; if (window.ReaFun) window.ReaFun.reponse(false);
          if (essais >= 2 && montrer) { montrer(); remplir(retour, h('p', { class: 'quiz-verdict quiz-verdict--ko', text: 'Voici la solution.' }), et.explication ? h('p', { class: 'quiz-explication', text: et.explication }) : null, h('button', { class: 'bouton', type: 'button', onclick: suivante, text: 'Continuer' })); return; }
          remplir(retour, h('p', { class: 'quiz-verdict quiz-verdict--ko', text: 'Pas encore… essayez à nouveau.' }), et.indice ? h('details', { class: 'escape__indice' }, h('summary', { text: '💡 Indice' }), h('p', { text: et.indice })) : null);
        }
        if (et.type === 'recit') {
          corps.appendChild(h('p', { class: 'escape__recit', text: et.texte }));
          corps.appendChild(h('button', { class: 'bouton', type: 'button', onclick: suivante, text: k === etapes.length - 1 ? 'Terminer la mission' : 'Continuer' }));
        } else if (et.type === 'choix') {
          corps.appendChild(h('h2', { class: 'quiz-texte', text: et.question }));
          var bc = h('div', { class: 'quiz-choix' }), fini = false;
          melanger(et.choix.map(function (t, i) { return { t: t, i: i }; })).forEach(function (c) {
            var b = h('button', { type: 'button', class: 'quiz-choix__btn', onclick: function () {
              if (fini) return;
              if (c.i === et.bonne) { fini = true; b.classList.add('quiz-choix__btn--ok'); bc.querySelectorAll('button').forEach(function (x) { x.disabled = true; }); reussi(); }
              else { b.classList.add('quiz-choix__btn--ko'); b.disabled = true; rate(function () { fini = true; bc.querySelectorAll('button').forEach(function (x) { x.disabled = true; if (x.dataset.i === String(et.bonne)) x.classList.add('quiz-choix__btn--ok'); }); }); }
            } }, h('span', { text: c.t }));
            b.dataset.i = String(c.i); bc.appendChild(b);
          });
          corps.appendChild(bc);
        } else if (et.type === 'multi') {
          corps.appendChild(h('h2', { class: 'quiz-texte', text: et.question }));
          var items = melanger(et.items), cases = items.map(function (it) { var c = h('input', { type: 'checkbox' }); return h('label', { class: 'escape__item' }, c, h('span', { text: it.t })); });
          var bm = h('button', { class: 'bouton', type: 'button', text: 'Valider', onclick: function () {
            var juste = items.every(function (it, i) { return cases[i].querySelector('input').checked === it.ok; });
            if (juste) { bm.disabled = true; cases.forEach(function (c, i) { c.classList.add(items[i].ok ? 'escape__item--ok' : 'escape__item--non'); c.querySelector('input').disabled = true; }); reussi(); }
            else rate(function () { bm.disabled = true; cases.forEach(function (c, i) { var inp = c.querySelector('input'); inp.checked = items[i].ok; inp.disabled = true; c.classList.add(items[i].ok ? 'escape__item--ok' : 'escape__item--non'); }); });
          } });
          corps.appendChild(h('div', { class: 'escape__items' }, cases)); corps.appendChild(bm);
        } else if (et.type === 'ordre') {
          corps.appendChild(h('h2', { class: 'quiz-texte', text: et.question }));
          var ordre = melanger(et.items.map(function (t, i) { return { t: t, i: i }; }));
          if (ordre.every(function (x, i) { return x.i === i; })) ordre.reverse();
          var liste = h('ol', { class: 'escape__ordre' });
          function dessinerOrdre(fige) {
            remplir.apply(null, [liste].concat(ordre.map(function (x, j) {
              return h('li', { class: fige ? 'escape__ligne escape__item--ok' : 'escape__ligne' }, h('span', { text: x.t }), fige ? null : h('span', { class: 'escape__fleches' },
                h('button', { type: 'button', 'aria-label': 'Monter', disabled: j === 0, onclick: function () { var t = ordre[j - 1]; ordre[j - 1] = ordre[j]; ordre[j] = t; dessinerOrdre(); }, text: '▲' }),
                h('button', { type: 'button', 'aria-label': 'Descendre', disabled: j === ordre.length - 1, onclick: function () { var t = ordre[j + 1]; ordre[j + 1] = ordre[j]; ordre[j] = t; dessinerOrdre(); }, text: '▼' })));
            })));
          }
          dessinerOrdre();
          var bo = h('button', { class: 'bouton', type: 'button', text: 'Valider l\'ordre', onclick: function () {
            if (ordre.every(function (x, i) { return x.i === i; })) { bo.disabled = true; dessinerOrdre(true); reussi(); }
            else rate(function () { bo.disabled = true; ordre.sort(function (a, b) { return a.i - b.i; }); dessinerOrdre(true); });
          } });
          corps.appendChild(liste); corps.appendChild(bo);
        } else if (et.type === 'plan') {
          var cible = resoudreCible(p, et.cible), zone = h('div', { class: 'quiz-plan' }), plan = null, finiP = false;
          corps.appendChild(h('h2', { class: 'quiz-texte', text: et.question }));
          corps.appendChild(zone);
          setTimeout(function () {
            plan = window.ReaPlan.creer(zone, { donnees: cloner(p.donnees), reglages: cloner(p.reglages || {}), mode: 'texte', quiz: Object.assign({}, cible.vue, { surToucher: function (c) {
              if (finiP) return;
              var ok = c.type === 'piece' && cible.ids.indexOf(c.id) >= 0 || c.type === 'point' && cible.points.indexOf(c.id) >= 0;
              function montrer() { finiP = true; plan.quiz({ marques: (cible.vue.marques || []).concat(cible.ids.map(function (id) { return { id: id, couleur: VERT, fond: VERT }; }), cible.points.map(function (id) { return { point: id, couleur: VERT }; })) }); }
              if (ok) { montrer(); reussi(); } else rate(montrer);
            } }) });
          }, 0);
        }
        corps.appendChild(retour);
        cadre(corps);
      }
      function fin() {
        var faits = A.stock.lire(CLE.escape) || {}, premier = !faits[sc.id];
        faits[sc.id] = 1; A.stock.ecrire(CLE.escape, faits);
        var b = A.stock.lire(A.CLE.badges) || {}, nouveaux = [];
        if (!b.evade) { window.ReaBadges.attribuer('evade'); nouveaux.push('Évadé'); }
        if (premier) point('escape');
        if (window.ReaFun) setTimeout(function () { window.ReaFun.succes(true); }, 200);
        var remarque = h('textarea', { rows: '3', maxlength: '600', placeholder: 'Remarque pour améliorer la mission (facultatif)', 'aria-label': 'Remarque' });
        page(sc.titre, 'Mission accomplie', h('div', { class: 'quiz-fin' },
          h('p', { class: 'quiz-fin__score' }, h('b', { text: '🔓 Mission accomplie !' }), erreursTot ? erreursTot + ' erreur' + (erreursTot > 1 ? 's' : '') + ' en chemin.' : 'Sans aucune erreur.'),
          nouveaux.length ? h('p', { class: 'flash', text: 'Nouveau badge : ' + nouveaux.join(', ') + ' !' }) : null,
          referent ? h('div', { class: 'form-carte escape__validation' }, h('h3', { text: 'Validation (référents)' }),
            h('p', { class: 'section__note', text: valides[sc.id] ? 'Validée par ' + valides[sc.id].par + ' le ' + dateFr(valides[sc.id].le) + '.' : 'Cette mission n\'est pas encore visible des agents.' }),
            remarque,
            h('div', { class: 'quiz-actions' },
              h('button', { class: 'bouton', type: 'button', onclick: function (ev) { validerEscape(sc.id, true, remarque.value, ev.currentTarget); }, text: valides[sc.id] ? 'Envoyer la remarque' : 'Valider la mission' }),
              valides[sc.id] ? h('button', { class: 'bouton bouton--discret bouton--danger', type: 'button', onclick: function (ev) { validerEscape(sc.id, false, remarque.value, ev.currentTarget); }, text: 'Retirer la validation' }) : null,
              !valides[sc.id] ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function (ev) { validerEscape(sc.id, null, remarque.value, ev.currentTarget); }, text: 'Remarque sans valider' }) : null)) : null,
          h('div', { class: 'quiz-actions' }, h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { ecranEscape(); }, text: 'Autres missions' }))), function () { ecranEscape(); });
      }
      suivante();
    });
  }
  function validerEscape(id, valide, remarque, b) {
    b.disabled = true;
    A.Api.appeler('escape_valider', { jeton: session().jeton, scenario: id, valide: valide, remarque: remarque }).then(function () {
      ecranEscape(valide === true ? 'Mission validée : visible par tous si l\'escape game est activé.' : valide === false ? 'Validation retirée.' : 'Remarque envoyée, merci.');
    }).catch(function (e) { b.disabled = false; A.alerteDouce(b.parentNode, A.message(e.code)); });
  }
  function resoudreCible(p, c) { // → { ids, points, vue } ou null si absent du plan
    var src = window.ReaPlan.creer(document.createElement('div'), { donnees: cloner(p.donnees), reglages: cloner(p.reglages || {}), quiz: {} });
    var pieces = src.pieces(), points = src.points(), vue = { textes: 'chambres', neutre: true, titres: 'normal', points: false };
    if (c.chambre) { var ch = pieces.filter(function (x) { return x.type === 'chambre' && String(x.chambre) === String(c.chambre); }); return ch.length ? { ids: ch.map(function (x) { return x.id; }), points: [], vue: { textes: 'chambres', grisChambres: true, titres: 'masques', neutre: true, points: false } } : null; }
    if (c.section) { var se = pieces.filter(function (x) { return x.type === 'piece' && x.rea && x.categorie === c.section; }); return se.length ? { ids: se.map(function (x) { return x.id; }), points: [], vue: vue } : null; }
    if (c.point) {
      var l = points.filter(function (q) { return q.type === c.point; }); if (!l.length) return null;
      var ok = l.map(function (q) { return q.id; }), v = { textes: 'chambres', titres: 'normal', points: true };
      if (c.proche) {
        var ref = pieces.filter(function (x) { return x.type === 'chambre' && String(x.chambre) === String(c.proche); })[0];
        if (ref) { var d = l.map(function (q) { return Math.hypot(q.x - ref.centre[0], q.y - ref.centre[1]); }), m = Math.min.apply(null, d); ok = l.filter(function (q, i) { return d[i] <= m * 1.25 + 30; }).map(function (q) { return q.id; }); v.marques = [{ id: ref.id, couleur: '#223b80' }]; }
      }
      return { ids: [], points: ok, vue: v };
    }
    return null;
  }

  /* ---------- Réglages des jeux (administrateur) ---------- */
  function reglages(flash) {
    init();
    var s = session(); page('Réglages des jeux', 'Administrateur', attente());
    chargerEtat().then(function (e) {
      if (!e.admin) return hub();
      var ordre = ['jauge', 'souvenirs', 'concours', 'nuage', 'qr', 'escape', 'bingo', 'paris'], noms = { jauge: 'Jauge du déménagement', souvenirs: 'Souvenirs', concours: 'Concours photo', nuage: 'Le nuage', qr: 'QR codes cachés', escape: 'Escape game', bingo: 'Bingo', paris: 'Paris' };
      page('Réglages des jeux', 'Administrateur', h('div', null,
        flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
        h('p', { class: 'section__note', text: 'Activez chaque jeu ; les dates (facultatives) l\'ouvrent et le ferment automatiquement (fermeture : le soir de la date). Concours : le podium s\'affiche après la fermeture. Paris : fermés la veille du jour J si aucune date n\'est fixée.' }),
        ordre.map(function (id) { return carteReglage(id, noms[id], e.jeux[id], s); })), hub);
    }).catch(function (e) { if (!erreurSession(e)) page('Réglages des jeux', '', messageErreur(e, function () { reglages(); }), hub); });
  }
  function carteReglage(id, nom, j, s) {
    var actif = h('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Activer ' + nom }); actif.checked = !!j.actifBrut;
    var ouv = h('input', { type: 'date', value: j.ouverture || '', 'aria-label': 'Ouverture' }), fer = h('input', { type: 'date', value: j.fermeture || '', 'aria-label': 'Fermeture' });
    var extra = h('div'), lire = function () { return null; }, etat = h('p', { class: 'section__note', role: 'status' });
    var g = j.reglages || {};
    if (id === 'jauge') {
      var obj = h('input', { type: 'number', min: '10', value: g.objectif || 4000, 'aria-label': 'Objectif en points' });
      var pal = (g.paliers || []).map(function (p) { return { pc: h('input', { type: 'number', min: '1', max: '100', value: p.pc, 'aria-label': 'Pourcentage' }), titre: h('input', { type: 'text', value: p.titre, 'aria-label': 'Titre du palier' }), texte: h('input', { type: 'text', value: p.texte, 'aria-label': 'Message du palier' }) }; });
      remplir(extra, h('label', { class: 'plan__label', text: 'Objectif (points : 1 par réponse au quiz, 2 par QR code, 3 par inscription à une visite, 5 par souvenir publié…)' }), obj,
        h('span', { class: 'plan__label', text: 'Paliers' }), h('div', { class: 'reglage-liste' }, pal.map(function (p) { return h('div', { class: 'reglage-palier' }, p.pc, p.titre, p.texte); })));
      lire = function () { return { objectif: Number(obj.value), paliers: pal.map(function (p) { return { pc: Number(p.pc.value), titre: p.titre.value, texte: p.texte.value }; }) }; };
    } else if (id === 'nuage') {
      var qs = h('textarea', { rows: '4', 'aria-label': 'Questions du nuage (une par ligne)' }); qs.value = (g.questions || []).join('\n');
      remplir(extra, h('label', { class: 'plan__label', text: 'Questions (une par ligne)' }), qs);
      lire = function () { return { questions: qs.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) }; };
    } else if (id === 'bingo') {
      var AUTOS = [['', 'À cocher soi-même'], ['visite', 'Auto : visite faite'], ['quizjour', 'Auto : quiz du jour'], ['qr', 'Auto : QR code trouvé'], ['plan', 'Auto : plan exploré'], ['newsletter', 'Auto : newsletter lue'], ['souvenir', 'Auto : souvenir partagé'], ['nuage', 'Auto : mot dans le nuage'], ['pari', 'Auto : pari fait'], ['escape', 'Auto : escape game']];
      var lignes = h('div', { class: 'reglage-liste' });
      function ligneCase(c) {
        var t = h('input', { type: 'text', maxlength: '90', value: c ? c.texte : '', 'aria-label': 'Texte de la case' }), a = h('select', { 'aria-label': 'Cochage' }, AUTOS.map(function (x) { var o = h('option', { value: x[0], text: x[1] }); if (c && c.auto === x[0]) o.selected = true; return o; }));
        var l = h('div', { class: 'reglage-case' }, t, a, h('button', { type: 'button', class: 'bouton bouton--discret', 'aria-label': 'Supprimer la case', onclick: function () { l.remove(); }, text: '×' }));
        lignes.appendChild(l);
      }
      (g.cases || []).forEach(ligneCase);
      remplir(extra, h('span', { class: 'plan__label', text: 'Cases (16 au minimum ; chaque téléphone tire 16 cases dans un ordre différent)' }), lignes,
        h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { ligneCase(null); }, text: '+ Ajouter une case' }));
      lire = function () { return { cases: Array.prototype.map.call(lignes.querySelectorAll('.reglage-case'), function (l) { return { texte: l.querySelector('input').value.trim(), auto: l.querySelector('select').value || undefined }; }).filter(function (c) { return c.texte; }) }; };
    } else if (id === 'escape') {
      var v = g.valides || {};
      remplir(extra, h('p', { class: 'section__note', text: 'Missions validées par les référents : ' + ((window.REA_ESCAPE || []).filter(function (sc) { return v[sc.id]; }).map(function (sc) { return sc.titre; }).join(', ') || 'aucune pour l\'instant') + '. Une fois le jeu activé, les référents peuvent jouer et valider les missions ; les agents ne voient que les missions validées.' }));
    }
    var bouton = h('button', { class: 'bouton', type: 'button', text: 'Enregistrer', onclick: function () {
      var d = { actif: actif.checked, ouverture: ouv.value, fermeture: fer.value }, r = lire(); if (r) d.reglages = r;
      bouton.disabled = true; etat.textContent = 'Enregistrement…';
      A.Api.appeler('jeux_reglage', { jeton: s.jeton, id: id, donnees: d }).then(function () { reglages(nom + ' : enregistré.'); })
        .catch(function (e) { bouton.disabled = false; etat.textContent = e.code === 'bingo_cases' ? 'Il faut au moins 16 cases (60 au plus).' : A.message(e.code); });
    } });
    return h('section', { class: 'quiz-carte reglage' },
      h('label', { class: 'reglage__tete' }, actif, h('b', { text: nom }), h('span', { class: 'etiquette', text: j.actif ? 'Ouvert' : (j.actifBrut ? 'Activé (hors dates)' : 'Désactivé') })),
      h('div', { class: 'grille-2' }, h('label', { class: 'champ' }, h('span', { text: 'Ouverture' }), ouv), h('label', { class: 'champ' }, h('span', { text: 'Fermeture' }), fer)),
      extra, etat, bouton);
  }

  lireLienQr();
  window.addEventListener('hashchange', function () { lireLienQr(); if (window.ReaApp && window.ReaApp.stock.lire(window.ReaApp.CLE.session)) apresAccueil(); });
  window.ReaJeux = { hub: hub, souvenirs: ecranSouvenirs, sectionJauge: sectionJauge, apresAccueil: apresAccueil, point: point, chargerEtat: function () { init(); return chargerEtat(); }, actif: jeuActif };
})();
