/* Réa – Nouveau CHU · module Quiz
   - Questions automatiques fabriquées à partir du plan EN DIRECT (chambres, unités, couleurs, pièces, sections, équipements) :
     elles suivent toutes les modifications faites par les référents.
   - Questions rédigées (QCM, vrai/faux, toucher sur le plan) : servies par le moteur (onglet Quiz).
   - Quiz du jour (3 questions), entraînement libre par thème, jeux du plan (étiquettes, couleurs, niveau ultime).
   - Révision espacée, score et badges : uniquement sur ce téléphone. Seul un total anonyme de réponses est envoyé (défi d'équipe). */
(function () {
  'use strict';
  var A = null, h = null;
  var CLE_Q = 'rea.quiz', CLE_CACHE = 'quiz/liste';
  var TAILLE_SERIE = 10, TAILLE_ZONE = 10;
  var VERT = '#048e39', ROUGE = '#d93a2f', BLEU = '#223b80';

  /* ---------- Mémoire locale ---------- */
  function memoire() {
    var s = A.stock.lire(CLE_Q) || {};
    s.s = s.s || {}; s.jours = s.jours || {}; s.urg = s.urg || {}; s.urgTypes = s.urgTypes || {};
    s.okPlan = s.okPlan || 0; s.okTotal = s.okTotal || 0; s.attente = s.attente || 0; s.recents = s.recents || []; s.jeux = s.jeux || {};
    return s;
  }
  function sauver(s) { A.stock.ecrire(CLE_Q, s); }
  function melanger(l) { l = l.slice(); for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; } return l; }
  function hasard(l) { return l[Math.floor(Math.random() * l.length)]; }
  function sansAccent(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function remplir(el) { el.replaceChildren.apply(el, Array.prototype.slice.call(arguments, 1).filter(function (x) { return x != null && x !== false; })); }
  function plusieurs(l, n, sauf) { return melanger(l.filter(function (x) { return x !== sauf; })).slice(0, n); }

  /* ---------- Données : plan + questions rédigées (réseau, sinon copie du téléphone) ---------- */
  var CTX = null; // { session, plan: {donnees, reglages}, ecrites, total, objectif, peutGerer, admin, source, pool }
  function cloner(o) { return JSON.parse(JSON.stringify(o)); }
  function lireCache(cle) {
    if (!window.caches) return Promise.resolve(null);
    return caches.open(A.CACHE_DONNEES).then(function (c) { return c.match(cle); }).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
  }
  function ecrireCache(cle, d) {
    if (!window.caches || !A.stock.lire(A.CLE.session)) return;
    caches.open(A.CACHE_DONNEES).then(function (c) { return c.put(cle, new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } })); }).catch(function () {});
  }
  function charger(session) {
    var plan = A.Api.appeler('plan', { jeton: session.jeton }).then(function (r) { A.mettrePlanEnCache(r); return r; })
      .catch(function (e) { return A.planEnCache().then(function (c) { if (c) return c; throw e; }); });
    var quiz = A.Api.appeler('quiz_liste', { jeton: session.jeton }).then(function (r) { ecrireCache(CLE_CACHE, r); A.majBandeaux({ horsLigne: false }); return r; })
      .catch(function (e) {
        if (A.ERREURS_SESSION.indexOf(e.code) >= 0) throw e;
        if (e.code === 'reseau') A.majBandeaux({ horsLigne: true, depuis: null });
        return lireCache(CLE_CACHE).then(function (c) { if (c) { c.horsLigne = true; return c; } return { questions: [], total: null, objectif: null, horsLigne: true }; });
      });
    return Promise.all([plan, quiz]).then(function (t) {
      var r = t[0], q = t[1];
      var source = window.ReaPlan.creer(document.createElement('div'), { donnees: cloner(r.donnees), reglages: cloner(r.reglages || {}), quiz: {} });
      CTX = { session: session, plan: r, ecrites: q.questions || [], total: q.total, objectif: q.objectif, peutGerer: !!q.peutGerer && !q.horsLigne, admin: !!q.admin, horsLigne: !!q.horsLigne, source: source };
      CTX.pool = construirePool();
      envoyerCompteur();
      return CTX;
    });
  }
  function envoyerCompteur() { // défi d'équipe : seulement un nombre, jamais qui a répondu
    var s = memoire(); if (!s.attente || !CTX) return;
    var n = Math.min(50, s.attente);
    A.Api.appeler('quiz_compteur', { jeton: CTX.session.jeton, n: n }).then(function (r) {
      var m = memoire(); m.attente = Math.max(0, m.attente - n); sauver(m); CTX.total = r.total;
      var c = document.querySelector('[data-compteur]'); if (c) c.replaceWith(sectionCompteur());
    }).catch(function () { /* hors ligne : envoyé plus tard */ });
  }

  /* ---------- Questions automatiques (depuis le plan) ---------- */
  var SECTIONS = { poste: 'un poste de soins', soins: 'une salle de soins', wc: 'des WC', pharmacie: 'la pharmacie', dm: 'un local DM (dispositifs médicaux)',
    logistique: 'un local logistique', biomed: 'le local biomédical', secretariat: 'un secrétariat', entretien: 'une salle d\'entretien', familles: 'un espace familles' };
  function unitesDuPlan() {
    var D = CTX.source.donnees, presentes = {};
    CTX.source.pieces().forEach(function (p) { if (p.type === 'chambre' && p.unite && D.unites[p.unite]) presentes[p.unite] = 1; });
    return Object.keys(presentes).map(function (k) { var u = D.unites[k]; return { id: k, nom: u.nom, info: u.info || '', couleur: u.pastille || u.trait }; });
  }
  function bboxDe(ids) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    ids.forEach(function (x) { b[0] = Math.min(b[0], x[0]); b[1] = Math.min(b[1], x[1]); b[2] = Math.max(b[2], x[2]); b[3] = Math.max(b[3], x[3]); });
    return b;
  }
  function construirePool() {
    var pieces = CTX.source.pieces(), points = CTX.source.points(), U = unitesDuPlan(), POINTS = window.ReaPlan.POINTS, pool = [];
    var TP = {}; POINTS.forEach(function (t) { TP[t.id] = t; });
    var chambres = pieces.filter(function (p) { return p.type === 'chambre' && p.unite && p.rea && p.chambre; });
    var UN = {}; U.forEach(function (u) { UN[u.id] = u; });
    var nommees = pieces.filter(function (p) { return p.type === 'piece' && p.rea && p.nom; });
    var VUE_PLAN = { textes: 'chambres', neutre: true, titres: 'normal', points: false };
    // 1. Chambre → unité
    chambres.forEach(function (c) {
      var u = UN[c.unite]; if (!u || U.length < 2) return;
      var choix = melanger([u].concat(plusieurs(U, 3, u)));
      pool.push({ id: 'a:uc:' + c.chambre, groupe: 'uc', theme: 'plan', type: 'qcm', texte: 'La chambre ' + c.chambre + ' fait partie de quelle unité ?',
        choix: choix.map(function (x) { return { t: x.nom }; }), bonne: choix.indexOf(u), explication: 'Chambre ' + c.chambre + ' : unité ' + u.nom + (u.info ? ' (' + u.info + ')' : '') + '.',
        apres: { vue: { textes: 'chambres', titres: 'normal', points: false }, marques: [{ id: c.id, couleur: VERT }], cadre: c.bbox } });
    });
    // 2. Toucher une chambre d'une unité (chambres en gris, titres masqués)
    U.forEach(function (u) {
      var ids = chambres.filter(function (c) { return c.unite === u.id; }).map(function (c) { return c.id; });
      if (!ids.length) return;
      pool.push({ id: 'a:tu:' + u.id, groupe: 'tu', theme: 'plan', type: 'plan', texte: 'Touchez une chambre de l\'unité ' + u.nom + '.', accepte: ids,
        vue: { textes: 'chambres', grisChambres: true, titres: 'masques', neutre: true, points: false }, explication: u.nom + (u.info ? ' : ' + u.info : '') + '.' });
    });
    // 3. Toucher une pièce nommée (noms masqués)
    var parNom = {};
    nommees.forEach(function (p) { var k = sansAccent(p.nom); (parNom[k] = parNom[k] || { nom: p.nom, ids: [] }).ids.push(p.id); });
    Object.keys(parNom).forEach(function (k) {
      var g = parNom[k]; if (g.ids.length > 8 || /couloir|circulation|^local$|^piece$/.test(k)) return;
      pool.push({ id: 'a:tp:' + k, groupe: 'tp', theme: 'plan', type: 'plan', texte: g.ids.length > 1 ? 'Touchez une pièce « ' + g.nom + ' ».' : 'Où se trouve « ' + g.nom + ' » ? Touchez-la.',
        accepte: g.ids, vue: VUE_PLAN, explication: g.ids.length > 1 ? 'Il y a ' + g.ids.length + ' pièces « ' + g.nom + ' » : elles sont entourées en vert.' : '' });
    });
    // 4. Toucher une section
    Object.keys(SECTIONS).forEach(function (cat) {
      var ids = nommees.filter(function (p) { return p.categorie === cat; }).map(function (p) { return p.id; });
      if (!ids.length) return;
      pool.push({ id: 'a:ts:' + cat, groupe: 'ts', theme: 'plan', type: 'plan', texte: 'Touchez ' + SECTIONS[cat] + '.', accepte: ids, vue: VUE_PLAN,
        explication: ids.length > 1 ? ids.length + ' pièces de ce type sur le plan : elles sont entourées en vert.' : '' });
    });
    // 5. Équipement le plus proche d'une chambre
    var parType = {};
    points.forEach(function (q) { (parType[q.type] = parType[q.type] || []).push(q); });
    Object.keys(parType).forEach(function (type) {
      var t = TP[type]; if (!t) return;
      var l = parType[type], theme = t.urgence ? 'urgences' : 'plan', nomArt = (t.article === 'le' ? 'le ' : t.article || 'le ') + t.nom.charAt(0).toLowerCase() + t.nom.slice(1);
      if (l.length === 1) {
        var q1 = l[0];
        pool.push({ id: 'a:pp:' + type, groupe: 'pp:' + type, theme: theme, urgType: t.urgence ? type : null, type: 'plan', texte: 'Touchez ' + nomArt + '.',
          acceptePoints: [q1.id], vue: { textes: 'chambres', neutre: false, titres: 'normal', points: true } });
      } else chambres.forEach(function (c) {
        var d = l.map(function (q) { return Math.hypot(q.x - c.centre[0], q.y - c.centre[1]); }), dmin = Math.min.apply(null, d);
        var ok = l.filter(function (q, i) { return d[i] <= dmin * 1.25 + 30; }).map(function (q) { return q.id; });
        pool.push({ id: 'a:pp:' + type + ':' + c.chambre, groupe: 'pp:' + type, theme: theme, urgType: t.urgence ? type : null, type: 'plan',
          texte: 'Touchez ' + nomArt + ' le plus proche de la chambre ' + c.chambre + ' (entourée en bleu).',
          acceptePoints: ok, vue: { textes: 'chambres', neutre: false, titres: 'normal', points: true, marques: [{ id: c.id, couleur: BLEU }] },
          cadre: bboxDe([c.bbox].concat(l.filter(function (q) { return ok.indexOf(q.id) >= 0; }).map(function (q) { return [q.x, q.y, q.x, q.y]; }))) });
      });
      // 6. Près de quelle pièce se trouve tel équipement ?
      l.forEach(function (q) {
        if (!q.proche || (l.length > 1 && !q.precision)) return;
        var autres = [];
        pieces.forEach(function (p) { var n = p.type === 'chambre' && p.rea && p.chambre ? 'chambre ' + p.chambre : (p.type === 'piece' && p.rea ? p.nom : null); if (n && n !== q.proche.nom && autres.indexOf(n) < 0) autres.push(n); });
        if (autres.length < 3) return;
        var choix = melanger([q.proche.nom].concat(plusieurs(autres, 3)));
        pool.push({ id: 'a:pq:' + q.id, groupe: 'pq', theme: theme, urgType: t.urgence ? type : null, type: 'qcm', texte: 'Près de quelle pièce se trouve ' + nomArt + (q.precision ? ' « ' + q.precision + ' »' : '') + ' ?',
          choix: choix.map(function (x) { return { t: x.charAt(0).toUpperCase() + x.slice(1) }; }), bonne: choix.indexOf(q.proche.nom),
          apres: { vue: { textes: 'chambres', titres: 'normal', points: true }, marques: [{ point: q.id, couleur: VERT }, { id: q.proche.id, couleur: VERT }], cadre: [q.x - 150, q.y - 150, q.x + 150, q.y + 150] } });
      });
    });
    // 7–8. Couleurs des unités
    if (U.length >= 2) U.forEach(function (u) {
      var autres = plusieurs(U, Math.min(3, U.length - 1), u), c1 = melanger([u].concat(autres));
      pool.push({ id: 'a:cu:' + u.id, groupe: 'cu', theme: 'plan', sous: 'couleurs', type: 'qcm', texte: 'Quelle est la couleur de l\'unité ' + u.nom + ' ?',
        choix: c1.map(function (x, i) { return { couleur: x.couleur, aria: 'Couleur ' + (i + 1), nomApres: x.nom }; }), bonne: c1.indexOf(u) });
      var c2 = melanger([u].concat(plusieurs(U, Math.min(3, U.length - 1), u)));
      pool.push({ id: 'a:uc2:' + u.id, groupe: 'uc2', theme: 'plan', sous: 'couleurs', type: 'qcm', texte: 'Quelle unité a cette couleur sur le plan ?', pastille: u.couleur,
        choix: c2.map(function (x) { return { t: x.nom }; }), bonne: c2.indexOf(u) });
    });
    // Questions rédigées (publiées et à jour)
    var existe = {}; pieces.forEach(function (p) { existe[p.id] = 1; }); points.forEach(function (q) { existe[q.id] = 1; });
    CTX.ecrites.forEach(function (w) {
      if (w.statut && (w.statut !== 'publiée' || w.aReverifier)) return; // vue référent : seulement ce que voient les agents
      var q = { id: 'w:' + w.id, groupe: 'w', ecrite: true, theme: w.theme === 'urgences' ? 'urgences' : 'plan', type: w.type, texte: w.texte, explication: w.explication || '' };
      if (w.type === 'qcm') { if (!Array.isArray(w.choix) || w.choix.length < 2) return; q.choix = w.choix.map(function (t) { return { t: t }; }); q.bonne = Number(w.bonne); }
      else if (w.type === 'vf') { q.choix = [{ t: 'Vrai' }, { t: 'Faux' }]; q.bonne = w.bonne === 'vrai' ? 0 : 1; q.type = 'qcm'; q.vf = true; }
      else if (w.type === 'plan') {
        var cibles = String(w.bonne || '').split(',').filter(function (x) { return existe[x]; });
        if (!cibles.length) return;
        q.accepte = cibles.filter(function (x) { return !/^Q/.test(x); }); q.acceptePoints = cibles.filter(function (x) { return /^Q/.test(x); });
        q.vue = { textes: 'chambres', neutre: true, titres: 'normal', points: true };
      } else return;
      pool.push(q);
    });
    return pool;
  }

  /* ---------- Choix des questions (révision espacée : les questions ratées reviennent plus souvent) ---------- */
  var POIDS = [6, 3, 2, 1, 0.5];
  function poids(q, s) { var x = s.s[q.id]; return x ? POIDS[Math.min(4, x.b)] : 3; }
  function tirer(filtre, n, exclure) {
    var s = memoire(), dispo = CTX.pool.filter(function (q) { return filtre(q) && (!exclure || exclure.indexOf(q.id) < 0); });
    var choisis = [], recents = s.recents.slice(-12);
    for (var k = 0; k < n && dispo.length; k++) {
      var groupes = {}; dispo.forEach(function (q) { (groupes[q.groupe] = groupes[q.groupe] || []).push(q); });
      var g = Object.keys(groupes), pg = g.map(function (x) { return x === 'w' ? 3 : 1; }), tot = pg.reduce(function (a, b) { return a + b; }, 0), r = Math.random() * tot, gi = 0;
      while (r > pg[gi] && gi < g.length - 1) { r -= pg[gi]; gi++; }
      var l = groupes[g[gi]], frais = l.filter(function (q) { return recents.indexOf(q.id) < 0; }); if (frais.length) l = frais;
      var w = l.map(function (q) { return poids(q, s); }), t = w.reduce(function (a, b) { return a + b; }, 0), r2 = Math.random() * t, i = 0;
      while (r2 > w[i] && i < l.length - 1) { r2 -= w[i]; i++; }
      choisis.push(l[i]);
      dispo = dispo.filter(function (q) { return q !== l[i]; });
    }
    return choisis;
  }
  function parId(id) { for (var i = 0; i < CTX.pool.length; i++) if (CTX.pool[i].id === id) return CTX.pool[i]; return null; }
  function quizDuJour() {
    var s = memoire(), jour = A.aujourdhui();
    if (s.jour && s.jour.date === jour) {
      var l = s.jour.ids.map(parId).filter(Boolean);
      if (l.length === s.jour.ids.length) return { questions: l, fait: !!s.jours[jour] };
    }
    var urg = tirer(function (q) { return q.theme === 'urgences'; }, 1), plan = tirer(function (q) { return q.theme === 'plan'; }, 3 - urg.length);
    var qs = melanger(urg.concat(plan));
    s.jour = { date: jour, ids: qs.map(function (q) { return q.id; }) }; sauver(s);
    return { questions: qs, fait: !!s.jours[jour] };
  }

  /* ---------- Résultats, badges ---------- */
  var BADGES_QUIZ = [
    { id: 'boussole', nom: 'Boussole', aide: '20 bonnes réponses sur le plan' },
    { id: 'urgence', nom: 'Prêt pour l\'urgence', aide: 'Toutes les questions Urgences réussies au moins une fois' },
    { id: 'fidele', nom: 'Fidèle', aide: '7 quiz du jour' },
    { id: 'expert', nom: 'Expert', aide: '100 bonnes réponses' }
  ];
  function progression(s) {
    var urgEcrites = CTX.pool.filter(function (q) { return q.ecrite && q.theme === 'urgences'; }).map(function (q) { return q.id; });
    var urgTypes = {}; CTX.pool.forEach(function (q) { if (q.urgType) urgTypes[q.urgType] = 1; });
    var aFaire = urgEcrites.length + Object.keys(urgTypes).length;
    var faits = urgEcrites.filter(function (id) { return s.urg[id]; }).length + Object.keys(urgTypes).filter(function (t) { return s.urgTypes[t]; }).length;
    return { boussole: [Math.min(20, s.okPlan), 20], expert: [Math.min(100, s.okTotal), 100], fidele: [Math.min(7, Object.keys(s.jours).length), 7], urgence: [faits, aFaire] };
  }
  function verifierBadges() {
    var s = memoire(), p = progression(s), obtenus = A.stock.lire(A.CLE.badges) || {}, nouveaux = [];
    BADGES_QUIZ.forEach(function (b) {
      var x = p[b.id]; if (obtenus[b.id] || !x[1] || x[0] < x[1]) return;
      window.ReaBadges.attribuer(b.id); nouveaux.push(b.nom);
    });
    return nouveaux;
  }
  function noter(q, ok) {
    var s = memoire(), x = s.s[q.id] || { b: 1, n: 0 };
    x.b = ok ? Math.min(4, x.b + 1) : 0; x.n++; s.s[q.id] = x;
    if (ok) { s.okTotal++; if (q.theme === 'plan') s.okPlan++; if (q.ecrite && q.theme === 'urgences') s.urg[q.id] = 1; if (q.urgType) s.urgTypes[q.urgType] = 1; }
    s.recents.push(q.id); s.recents = s.recents.slice(-20);
    s.attente++;
    sauver(s);
    return verifierBadges();
  }

  /* ---------- Écrans ---------- */
  /* Retours : la page d'où l'on vient (accueil, rubrique Plan, Quiz et jeux) ; null = écran « Quiz » */
  var RETOUR = null, HAUT = null;
  function retourBase(flash) { if (RETOUR) RETOUR(flash); else accueilQuiz(flash); }
  function page(titre, sous, contenu, retour) {
    var session = A.stock.lire(A.CLE.session);
    A.afficher(h('div', { class: 'page page--large quiz' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { (retour || retourBase)(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: titre }),
        h('span', { class: 'entete__role', text: sous || (session && session.role !== 'agent' ? 'Mode référent' : 'Quiz') })),
      contenu));
    window.scrollTo(0, 0);
  }
  function pret(titre, retour, suite) { // charge les questions et le plan si besoin, puis lance « suite »
    A = window.ReaApp; h = A.h;
    var session = A.stock.lire(A.CLE.session);
    if (!session) return A.ecranConnexion();
    A.definirEcran(null);
    if (CTX && CTX.session && CTX.session.jeton === session.jeton) return suite();
    page(titre, null, h('div', null, h('div', { class: 'squelette', style: 'height:160px' }), h('div', { class: 'squelette', style: 'height:220px;margin-top:12px' })), retour);
    charger(session).then(suite).catch(function (e) {
      if (A.ERREURS_SESSION.indexOf(e.code) >= 0) { A.stock.effacer(A.CLE.session); return A.ecranConnexion(A.message(e.code)); }
      page(titre, null, h('div', null, h('p', { class: 'vide', text: e.code === 'reseau' ? 'Il faut le plan : ouvrez-le une première fois avec du réseau.' : A.message(e.code) }),
        h('button', { class: 'bouton', type: 'button', onclick: function () { pret(titre, retour, suite); }, text: 'Réessayer' })), retour);
    });
  }
  // Écran « Quiz » (badges, défi d'équipe, questions des référents), ouvert depuis « Quiz et jeux »
  function ouvrir(depuis) { HAUT = depuis || HAUT || window.ReaApp.ecranAccueil; RETOUR = null; RELIRE = false; pret('Quiz', HAUT, function () { accueilQuiz(); }); }
  // Référents et administrateur : relire et valider les questions (les brouillons d'abord pour l'administrateur)
  var RELIRE = false;
  function relire(depuis) {
    HAUT = depuis || HAUT || window.ReaApp.ecranAccueil; RETOUR = null; RELIRE = true;
    pret('Questions du quiz', HAUT, function () {
      if (!CTX.peutGerer) return accueilQuiz();
      var b = CTX.ecrites.filter(function (w) { return w.statut === 'brouillon'; }).length, r = CTX.ecrites.filter(function (w) { return w.aReverifier && w.statut === 'publiée'; }).length;
      gestion(null, CTX.admin && b ? 'brouillon' : r ? 'reverifier' : 'tous');
    });
  }
  // Une série d'un thème, directement
  var THEMES = {
    plan: { nom: 'Plan et équipements', filtre: function (q) { return q.theme === 'plan' && !q.sous; } },
    urgences: { nom: 'Urgences et sécurité', filtre: function (q) { return q.theme === 'urgences'; } },
    couleurs: { nom: 'Couleurs des unités', filtre: function (q) { return q.sous === 'couleurs'; } }
  };
  function theme(cle, depuis) {
    var t = THEMES[cle]; RETOUR = depuis || null;
    pret(t.nom, depuis, function () {
      var l = tirer(t.filtre, TAILLE_SERIE);
      if (!l.length) return retourBase('Pas encore de questions pour ce thème.');
      serie(l, { titre: t.nom, filtre: t.filtre });
    });
  }
  // Quiz du jour, lancé depuis l'accueil
  function jour() {
    RETOUR = function () { window.ReaApp.ecranAccueil(); };
    pret('Quiz du jour', RETOUR, function () {
      var qj = quizDuJour();
      if (!qj.questions.length) return page('Quiz du jour', null, h('p', { class: 'vide', text: 'Pas encore de questions : le plan doit contenir des pièces nommées.' }));
      serie(qj.questions, { jour: true, titre: 'Quiz du jour' });
    });
  }
  // Jeux du plan, lancés depuis la rubrique Plan
  var JEUX = { etiquettes: ['Placer le nom des unités', function () { return jeuEtiquettes; }], couleurs: ['Colorier les unités', function () { return jeuCouleurs; }],
    chambres: ['Colorier les chambres', function () { return jeuChambres; }], ultime: ['Niveau ultime', function () { return jeuUltime; }] };
  function jeu(nom, depuis) { RETOUR = depuis || null; pret(JEUX[nom][0], depuis, function () { JEUX[nom][1]()(); }); }
  function records() { A = window.ReaApp; h = A.h; return memoire().jeux || {}; }
  // Carte de l'accueil (sans réseau ni plan : seulement ce qui est noté sur le téléphone)
  function carteAccueil() {
    A = window.ReaApp; h = A.h;
    var s = memoire(), fait = !!(s.jours && s.jours[A.aujourdhui()]);
    return h('section', { class: 'section quiz-jour quiz-jour--accueil' + (fait ? ' quiz-jour--fait' : '') },
      h('div', { class: 'section__tete' }, h('h2', { text: '🎯 Quiz du jour' }), h('span', { class: 'section__note', text: fait ? 'Fait ✓' : '3 questions · 2 min' })),
      h('p', { class: 'section__note', text: fait ? 'Bravo ! Revenez demain pour une nouvelle série.' : 'Une nouvelle série chaque jour jusqu\'au déménagement.' }),
      h('button', { class: fait ? 'bouton bouton--discret' : 'bouton', type: 'button', onclick: jour, text: fait ? 'Refaire la série du jour' : 'Commencer' }));
  }
  function sectionCompteur() {
    if (CTX.total == null) return h('div', { 'data-compteur': '1' });
    var obj = CTX.objectif || 3000, n = CTX.total, pc = Math.min(100, Math.round(100 * n / obj));
    return h('section', { class: 'section quiz-equipe', 'data-compteur': '1' },
      h('div', { class: 'section__tete' }, h('h2', { text: 'Défi d\'équipe' }), h('span', { class: 'section__note', text: 'Total anonyme' })),
      h('p', { class: 'quiz-equipe__chiffre' }, h('b', { text: n.toLocaleString('fr-FR') }), ' réponses données par l\'équipe · objectif ' + obj.toLocaleString('fr-FR')),
      h('div', { class: 'remplissage', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(obj), 'aria-valuenow': String(n), 'aria-label': 'Défi d\'équipe' },
        h('div', { style: 'width:' + pc + '%;background:var(--succes)' })));
  }
  function accueilQuiz(flash) {
    if (!CTX) return ouvrir();
    A.definirEcran(null); RETOUR = null;
    var s = memoire(), qj = quizDuJour(), p = progression(s), obtenus = A.stock.lire(A.CLE.badges) || {};
    var nb = function (f) { return CTX.pool.filter(f).length; };
    var nUrg = nb(function (q) { return q.theme === 'urgences'; }), nPlan = nb(function (q) { return q.theme === 'plan' && !q.sous; }), nCoul = nb(function (q) { return q.sous === 'couleurs'; });
    var ecr = CTX.ecrites, aRev = ecr.filter(function (w) { return w.aReverifier && w.statut === 'publiée'; }).length, brouillons = ecr.filter(function (w) { return w.statut === 'brouillon'; }).length;
    page('Quiz', null, h('div', null,
      flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
      CTX.horsLigne ? h('p', { class: 'section__note', text: 'Hors ligne : questions enregistrées sur ce téléphone.' }) : null,
      h('section', { class: 'section quiz-jour' + (qj.fait ? ' quiz-jour--fait' : '') },
        h('div', { class: 'section__tete' }, h('h2', { text: 'Quiz du jour' }), h('span', { class: 'section__note', text: qj.fait ? 'Fait ✓' : '3 questions · 2 min' })),
        h('p', { class: 'section__note', text: qj.fait ? 'Bravo, revenez demain pour une nouvelle série. Vous pouvez vous entraîner librement en attendant.' : 'Une nouvelle série chaque jour jusqu\'au déménagement.' }),
        qj.questions.length ? h('button', { class: 'bouton', type: 'button', onclick: function () { serie(qj.questions, { jour: true, titre: 'Quiz du jour' }); }, text: qj.fait ? 'Refaire la série du jour' : 'Commencer' })
          : h('p', { class: 'vide', text: 'Pas encore de questions : le plan doit contenir des pièces nommées.' })),
      h('section', { class: 'section' },
        h('div', { class: 'section__tete' }, h('h2', { text: 'Entraînement libre' }), h('span', { class: 'section__note', text: 'Les questions ratées reviennent plus souvent' })),
        h('div', { class: 'quiz-themes' },
          boutonTheme('Plan et équipements', nPlan, '🧭', function (q) { return q.theme === 'plan' && !q.sous; }),
          boutonTheme('Urgences et sécurité', nUrg, '🚨', function (q) { return q.theme === 'urgences'; }),
          boutonTheme('Couleurs des unités', nCoul, '🎨', function (q) { return q.sous === 'couleurs'; }))),
      h('section', { class: 'section' },
        h('div', { class: 'section__tete' }, h('h2', { text: 'Badges du quiz' }), h('span', { class: 'section__note', text: 'Sur ce téléphone uniquement' })),
        h('ul', { class: 'quiz-badges' }, BADGES_QUIZ.map(function (b) {
          var x = p[b.id], ok = !!obtenus[b.id];
          return h('li', { class: ok ? 'quiz-badge quiz-badge--ok' : 'quiz-badge' },
            h('b', { text: (ok ? '★ ' : '') + b.nom }), h('span', { text: b.aide }),
            !ok && x[1] ? h('span', { class: 'quiz-badge__compte', text: x[0] + ' / ' + x[1] }) : null);
        }))),
      sectionCompteur(),
      CTX.peutGerer ? h('section', { class: 'section' },
        h('div', { class: 'section__tete' }, h('h2', { text: 'Questions rédigées' }), h('span', { class: 'section__note', text: 'Référents' })),
        h('p', { class: 'section__note', text: ecr.length + ' question(s)' + (aRev ? ' · ' + aRev + ' à revérifier' : '') + (brouillons ? ' · ' + brouillons + ' brouillon(s) à relire' : '') }),
        h('button', { class: 'bouton', type: 'button', onclick: function () { gestion(); }, text: 'Gérer les questions' })) : null), function () { (HAUT || A.ecranAccueil)(); });
  }
  function boutonTheme(nom, n, ic, filtre) {
    return h('button', { type: 'button', class: 'quiz-theme', 'data-ic': ic, disabled: !n, onclick: function () { serie(tirer(filtre, TAILLE_SERIE), { titre: nom, filtre: filtre }); } },
      h('b', { text: nom }), h('span', { text: n ? n + ' question' + (n > 1 ? 's' : '') : 'Bientôt' }));
  }

  /* ---------- Série de questions ---------- */
  function serie(questions, o) {
    var i = 0, bonnes = 0, badges = [];
    function suivante() {
      if (i >= questions.length) return fin();
      var q = questions[i];
      afficherQuestion(q, i, questions.length, function (ok, nouveaux) { if (ok) bonnes++; badges = badges.concat(nouveaux); i++; suivante(); }, o);
    }
    function fin() {
      if (o.jour) { var s = memoire(); s.jours[A.aujourdhui()] = 1; sauver(s); badges = badges.concat(verifierBadges()); }
      envoyerCompteur();
      page(o.titre, null, h('div', { class: 'quiz-fin' },
        h('p', { class: 'quiz-fin__score' }, h('b', { text: bonnes + ' / ' + questions.length }), ' bonne' + (bonnes > 1 ? 's' : '') + ' réponse' + (bonnes > 1 ? 's' : '')),
        h('p', { text: bonnes === questions.length ? 'Sans faute, bravo !' : 'Les questions ratées reviendront plus souvent.' }),
        badges.length ? h('p', { class: 'flash', text: 'Nouveau badge : ' + badges.join(', ') + ' !' }) : null,
        (bonnes === questions.length && window.ReaFun ? (setTimeout(function () { window.ReaFun.succes(); }, 200), null) : null),
        h('div', { class: 'quiz-actions' },
          o.filtre ? h('button', { class: 'bouton', type: 'button', onclick: function () { serie(tirer(o.filtre, TAILLE_SERIE), o); }, text: 'Continuer l\'entraînement' }) : null,
          h('button', { class: o.filtre ? 'bouton bouton--discret' : 'bouton', type: 'button', onclick: function () { retourBase(); }, text: 'Retour' }))));
    }
    suivante();
  }
  function afficherQuestion(q, i, n, suite, o) {
    var zonePlan = h('div', { class: 'quiz-plan', hidden: true }), retour = h('div', { class: 'quiz-retour', 'aria-live': 'polite' }), repondu = false, plan = null;
    var corps = h('div', { class: 'quiz-question' },
      h('div', { class: 'quiz-progression' }, h('span', { text: 'Question ' + (i + 1) + ' / ' + n }), h('span', { class: 'etiquette', text: q.theme === 'urgences' ? 'Urgences' : (q.sous === 'couleurs' ? 'Couleurs' : 'Plan') })),
      h('h2', { class: 'quiz-texte', text: q.texte }),
      q.pastille ? h('span', { class: 'quiz-pastille', style: 'background:' + q.pastille, role: 'img', 'aria-label': 'Couleur à identifier' }) : null);
    function repondre(ok, details) {
      if (repondu) return; repondu = true;
      var nouveaux = noter(q, ok); if (window.ReaFun) window.ReaFun.reponse(ok);
      remplir(retour,
        h('p', { class: 'quiz-verdict quiz-verdict--' + (ok ? 'ok' : 'ko'), text: ok ? 'Bonne réponse !' : 'Pas tout à fait.' }),
        details ? h('p', { text: details }) : null,
        q.explication ? h('p', { class: 'quiz-explication', text: q.explication }) : null,
        nouveaux.length ? h('p', { class: 'flash', text: 'Nouveau badge : ' + nouveaux.join(', ') + ' !' }) : null,
        h('button', { class: 'bouton', type: 'button', onclick: function () { suite(ok, []); }, text: i + 1 < n ? 'Question suivante' : 'Voir le résultat' }));
      retour.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return nouveaux;
    }
    if (q.type === 'qcm') {
      var boutons = h('div', { class: 'quiz-choix' + (q.choix.some(function (c) { return c.couleur; }) ? ' quiz-choix--couleurs' : '') });
      q.choix.forEach(function (c, k) {
        var b = h('button', { type: 'button', class: 'quiz-choix__btn', 'aria-label': c.aria || null, onclick: function () {
          if (repondu) return;
          var ok = k === q.bonne;
          boutons.querySelectorAll('button').forEach(function (x, j) { x.disabled = true; if (j === q.bonne) x.classList.add('quiz-choix__btn--ok'); });
          if (!ok) b.classList.add('quiz-choix__btn--ko');
          if (c.couleur) boutons.querySelectorAll('button').forEach(function (x, j) { x.appendChild(h('small', { text: q.choix[j].nomApres })); });
          repondre(ok, ok ? '' : 'La bonne réponse : ' + (q.choix[q.bonne].t || q.choix[q.bonne].nomApres) + '.');
          if (q.apres) { zonePlan.hidden = false; plan = monterPlan(zonePlan, Object.assign({}, q.apres.vue, { marques: q.apres.marques })); if (q.apres.cadre) plan.voir(q.apres.cadre, 3); }
        } }, c.couleur ? h('span', { class: 'quiz-couleur', style: 'background:' + c.couleur }) : null, c.t ? h('span', { text: c.t }) : null);
        boutons.appendChild(b);
      });
      corps.appendChild(boutons);
    } else {
      corps.appendChild(h('p', { class: 'section__note', text: 'Touchez le plan (zoom possible à deux doigts).' }));
      zonePlan.hidden = false;
    }
    corps.appendChild(zonePlan); corps.appendChild(retour);
    page(o.titre, null, corps, function () { retourBase(); });
    if (q.type === 'plan') {
      var accepte = q.accepte || [], accepteP = q.acceptePoints || [];
      plan = monterPlan(zonePlan, Object.assign({}, q.vue, { surToucher: function (c) {
        if (repondu || c.type === 'dehors') return;
        var ok = c.type === 'piece' && accepte.indexOf(c.id) >= 0 || c.type === 'point' && accepteP.indexOf(c.id) >= 0;
        var marques = (q.vue.marques || []).concat(accepte.map(function (id) { return { id: id, couleur: VERT, fond: VERT }; }), accepteP.map(function (id) { return { point: id, couleur: VERT }; }));
        if (!ok && c.type === 'piece') marques.push({ id: c.id, couleur: ROUGE });
        plan.quiz({ marques: marques, poses: !ok && c.xy ? [{ x: c.xy[0], y: c.xy[1] - 40, texte: 'Votre réponse', fond: ROUGE, taille: 26 }] : [] });
        var cadreOk = bboxDe(accepte.map(function (id) { var p = CTX.source.pieces().filter(function (x) { return x.id === id; })[0]; return p ? p.bbox : null; }).filter(Boolean)
          .concat(accepteP.map(function (id) { var r = CTX.plan.reglages.points && CTX.plan.reglages.points[id]; return r ? [r.x, r.y, r.x, r.y] : null; }).filter(Boolean)));
        if (!ok && isFinite(cadreOk[0])) plan.voir(cadreOk, 2.5);
        repondre(ok, ok ? '' : 'La bonne réponse est entourée en vert.');
      } }));
      if (q.cadre) plan.voir(q.cadre, 2);
    }
  }
  function monterPlan(zone, vue) {
    zone.replaceChildren();
    return window.ReaPlan.creer(zone, { donnees: cloner(CTX.plan.donnees), reglages: cloner(CTX.plan.reglages || {}), quiz: vue, mode: 'texte' });
  }

  /* ---------- Jeux du plan : étiquettes à glisser (ou toucher l'étiquette puis le plan) ---------- */
  function plateau(o) { // o: titre, consigne, vue, jetons [{id, texte?, couleur?}], verifier(jeton, cible) → bool|objet, surReussite, fin
    var choisi = null, erreurs = 0, restants = o.jetons.slice(), zonePlan = h('div', { class: 'quiz-plan quiz-plan--jeu' });
    var bac = h('div', { class: 'quiz-bac', role: 'list' }), info = h('p', { class: 'quiz-consigne', 'aria-live': 'polite', text: o.consigne });
    var compte = h('span', { class: 'etiquette' });
    // o.reutilisable : les jetons restent dans le bac (couleurs) ; o.compte() → [faits, total] ; o.termine() → fin de partie
    function majCompte() { var c = o.compte ? o.compte() : [o.jetons.length - restants.length, o.jetons.length]; compte.textContent = c[0] + ' / ' + c[1] + (erreurs ? ' · ' + erreurs + ' erreur' + (erreurs > 1 ? 's' : '') : ''); }
    page(o.titre, o.sousTitre || 'Jeu', h('div', { class: 'quiz-jeu' },
      h('div', { class: 'quiz-progression' }, h('span', { text: o.etape || '' }), compte), info, zonePlan, bac,
      h('p', { class: 'section__note', text: o.aide || 'Glissez une étiquette sur le plan, ou touchez-la puis touchez le bon endroit.' })), function () { retourBase(); });
    var plan = monterPlan(zonePlan, Object.assign({}, o.vue, { surToucher: function (c) { if (choisi) deposer(choisi, c); } }));
    // marge à droite : les boutons du plan (zoom, plein écran) ne doivent cacher aucune pièce
    if (o.cadre) { var cad = o.cadre.slice(); cad[2] += (cad[2] - cad[0]) * 0.24; cad[0] -= (cad[2] - cad[0]) * 0.02; plan.voir(cad, 1.05); }
    function dessinerBac() {
      bac.replaceChildren.apply(bac, restants.map(function (j) {
        var b = h('button', { type: 'button', class: 'quiz-jeton' + (j.couleur && !j.texte ? ' quiz-jeton--couleur' : '') + (choisi === j ? ' quiz-jeton--choisi' : ''), role: 'listitem',
          style: j.couleur && !j.texte ? 'background:' + j.couleur : null, 'aria-label': j.aria || j.texte, 'aria-pressed': String(choisi === j) }, j.texte || '');
        glissable(b, j);
        return b;
      }));
    }
    function glissable(b, j) {
      b.addEventListener('pointerdown', function (e) {
        var x0 = e.clientX, y0 = e.clientY, fantome = null, pid = e.pointerId;
        function bouge(ev) {
          if (ev.pointerId !== pid) return;
          if (!fantome && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { fantome = b.cloneNode(true); fantome.classList.add('quiz-fantome'); document.body.appendChild(fantome); }
          if (fantome) { ev.preventDefault(); fantome.style.left = ev.clientX + 'px'; fantome.style.top = ev.clientY + 'px'; }
        }
        function lache(ev) {
          if (ev.pointerId !== pid) return;
          document.removeEventListener('pointermove', bouge); document.removeEventListener('pointerup', lache); document.removeEventListener('pointercancel', lache);
          if (fantome) { var rf = fantome.getBoundingClientRect(); fantome.remove(); if (ev.type === 'pointerup') deposer(j, plan.cibleEcran(rf.left + rf.width / 2, rf.bottom + 10)); } // dépôt à la pointe de la flèche, visible au-dessus du doigt
          else if (ev.type === 'pointerup') { choisi = choisi === j ? null : j; info.textContent = choisi ? 'Touchez maintenant le bon endroit sur le plan.' : o.consigne; dessinerBac(); }
        }
        document.addEventListener('pointermove', bouge, { passive: false }); document.addEventListener('pointerup', lache); document.addEventListener('pointercancel', lache);
      });
    }
    function deposer(j, c) {
      if (!c || c.type === 'dehors') { info.textContent = 'Lâchez l\'étiquette sur le plan.'; return; }
      var r = o.verifier(j, c);
      if (r === null || (r && r.indice)) { // lâchée dans un couloir ou un espace vide : pas d'erreur comptée ({ indice } : message propre au jeu)
        info.textContent = r ? r.indice : (o.indice || 'Rapprochez-la un peu plus de son emplacement.'); if (window.ReaFun) window.ReaFun.vibrer(15);
        if (choisi !== j) { choisi = j; dessinerBac(); }
        return;
      }
      if (r) {
        if (!o.reutilisable) { restants = restants.filter(function (x) { return x !== j; }); choisi = null; }
        o.surReussite(j, c, r, plan); var fini = o.termine ? o.termine() : !restants.length;
        info.textContent = fini ? '' : (o.reutilisable && choisi ? 'Bien joué ! Touchez la chambre suivante, ou changez de couleur.' : 'Bien joué !'); if (window.ReaFun) window.ReaFun.reponse(true);
        var s = memoire(); s.attente++; s.okTotal++; s.okPlan++; sauver(s); verifierBadges();
      } else {
        erreurs++; info.textContent = 'Ce n\'est pas le bon endroit, essayez encore.'; if (window.ReaFun) window.ReaFun.reponse(false);
        var s2 = memoire(); s2.attente++; sauver(s2);
      }
      majCompte(); dessinerBac();
      if (o.termine ? o.termine() : !restants.length) setTimeout(function () { o.fin(erreurs, plan); }, 500);
    }
    majCompte(); dessinerBac();
    return plan;
  }
  /* Tolérance des dépôts : on juge à la distance, en pixels d'écran (donc indépendamment du zoom).
     - à moins de PRES px du bon endroit : réussi (le bord d'une pièce ou un léger décalage du doigt suffisent) ;
     - posée franchement à l'intérieur d'un mauvais endroit : erreur ;
     - dans un couloir ou entre deux : réussi si le bon endroit est le plus proche et à moins de « tol » px, sinon simple indice. */
  var PRES = 14;
  function distRect(xy, b) { return Math.hypot(Math.max(b[0] - xy[0], 0, xy[0] - b[2]), Math.max(b[1] - xy[1], 0, xy[1] - b[3])); }
  function juger(dBon, dAutre, k, tol) {
    var bon = dBon / k, autre = dAutre / k;
    if (bon <= PRES) return true;
    if (autre === 0) return false;
    if (bon <= tol && bon <= autre) return true;
    return null; // entre deux : simple indice, jamais une erreur
  }
  function distUnite(u, xy) { // distance aux pièces de l'unité et à l'emplacement de son nom
    var d = Infinity;
    CTX.source.pieces().forEach(function (p) { if (p.unite === u) d = Math.min(d, distRect(xy, p.bbox)); });
    (CTX.source.donnees.titres || []).forEach(function (t) { if (t.unite === u) d = Math.min(d, distRect(xy, [t.x - 90, t.y - 30, t.x + 90, t.y + 30])); });
    return d;
  }
  function jugerUnite(id, U, c) {
    if (!c.xy) return null;
    var dBon = distUnite(id, c.xy), dAutre = Infinity;
    U.forEach(function (u) { if (u.id !== id) dAutre = Math.min(dAutre, distUnite(u.id, c.xy)); });
    return juger(dBon, dAutre, c.k || 1, 70);
  }
  function centreTitre(u) {
    var t = (CTX.source.donnees.titres || []).filter(function (x) { return x.unite === u; })[0];
    if (t) return [t.x, t.y];
    var b = bboxDe(CTX.source.pieces().filter(function (p) { return p.unite === u; }).map(function (p) { return p.bbox; }));
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }
  function cadreUnites() { // cadrage serré sur les chambres des unités (cibles plus grandes à l'écran)
    var l = CTX.source.pieces().filter(function (p) { return p.type === 'chambre' && p.unite; }).map(function (p) { return p.bbox; });
    return l.length ? bboxDe(l) : cadreRea();
  }
  function cadreRea() {
    var l = CTX.source.pieces().filter(function (p) { return p.rea && (p.type === 'chambre' || p.type === 'piece'); }).map(function (p) { return p.bbox; });
    (CTX.source.donnees.titres || []).forEach(function (t) { l.push([t.x - 150, t.y - 60, t.x + 150, t.y + 60]); });
    return bboxDe(l);
  }
  function finJeu(titre, erreurs, total, rejouer, cle, quoi) {
    var s = memoire(); if (cle) { if (s.jeux[cle] == null || erreurs < s.jeux[cle]) s.jeux[cle] = erreurs; sauver(s); }
    if (cle === 'ultime' && window.ReaJeux) window.ReaJeux.point('ultime');
    envoyerCompteur();
    var badges = verifierBadges(); if (window.ReaFun) setTimeout(function () { window.ReaFun.succes(!erreurs); }, 200);
    page(titre, 'Jeu', h('div', { class: 'quiz-fin' },
      h('p', { class: 'quiz-fin__score' }, h('b', { text: erreurs ? erreurs + ' erreur' + (erreurs > 1 ? 's' : '') : 'Sans faute !' }), ' · ' + total + ' ' + (quoi || 'étiquettes placées')),
      cle && s.jeux[cle] != null ? h('p', { class: 'section__note', text: 'Votre record : ' + s.jeux[cle] + ' erreur' + (s.jeux[cle] > 1 ? 's' : '') + '.' }) : null,
      badges.length ? h('p', { class: 'flash', text: 'Nouveau badge : ' + badges.join(', ') + ' !' }) : null,
      h('div', { class: 'quiz-actions' },
        h('button', { class: 'bouton', type: 'button', onclick: rejouer, text: 'Rejouer' }),
        h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { retourBase(); }, text: 'Retour' }))));
  }
  // Étiquettes des unités : couleurs des chambres conservées, étiquettes grises à replacer
  function jeuEtiquettes() {
    var U = unitesDuPlan(), poses = [];
    if (U.length < 2) return retourBase('Pas assez d\'unités sur le plan pour ce jeu.');
    plateau({ titre: 'Placer les étiquettes', cadre: cadreUnites(), consigne: 'Glissez chaque nom d\'unité sur ses chambres (zoom possible à deux doigts).',
      vue: { textes: 'chambres', titres: 'masques', neutre: true, points: false, poses: poses },
      jetons: melanger(U.map(function (u) { return { id: u.id, texte: u.nom, u: u }; })),
      indice: 'Lâchez le nom sur les chambres de l\'unité (pas besoin d\'être précis).',
      verifier: function (j, c) { return jugerUnite(j.id, U, c); },
      surReussite: function (j, c, r, plan) { var xy = centreTitre(j.id); poses.push({ x: xy[0], y: xy[1], texte: j.u.nom, fond: j.u.couleur, couleur: '#fff', taille: 44 }); plan.quiz({ poses: poses }); },
      fin: function (err) { finJeu('Placer les étiquettes', err, U.length, jeuEtiquettes, 'etiquettes'); } });
  }
  // Couleurs : chambres et étiquettes grises, ronds de couleur à glisser sur les étiquettes
  function jeuCouleurs() {
    var U = unitesDuPlan().filter(function (u) { return (CTX.source.donnees.titres || []).some(function (t) { return t.unite === u.id; }); }), faits = {};
    if (U.length < 2) return retourBase('Pas assez d\'unités sur le plan pour ce jeu.');
    plateau({ titre: 'Colorier les unités', cadre: cadreUnites(), consigne: 'Glissez chaque couleur sur l\'étiquette grise de son unité.',
      vue: { textes: 'chambres', titres: 'gris', grisChambres: true, neutre: true, points: false, couleursTitres: faits },
      jetons: melanger(U.map(function (u, i) { return { id: u.id, couleur: u.couleur, aria: 'Couleur ' + (i + 1) }; })),
      indice: 'Lâchez la couleur sur l\'étiquette grise ou sur les chambres de l\'unité.',
      verifier: function (j, c) { if (c.type === 'titre') return c.unite === j.id; return jugerUnite(j.id, U, c); },
      surReussite: function (j, c, r, plan) { faits[j.id] = true; plan.quiz({ couleursTitres: faits }); },
      fin: function (err) { finJeu('Colorier les unités', err, U.length, jeuCouleurs, 'couleurs'); } });
  }
  // Chambres : toutes les chambres grises (numéros visibles), chaque chambre à colorier avec la couleur de son unité
  function jeuChambres() {
    var U = unitesDuPlan(), parId = {}, colorees = {}, marques = [];
    var ch = CTX.source.pieces().filter(function (p) { return p.type === 'chambre' && p.unite && U.some(function (u) { return u.id === p.unite; }); });
    if (U.length < 2 || ch.length < 2) return retourBase('Pas assez de chambres sur le plan pour ce jeu.');
    ch.forEach(function (p) { parId[p.id] = p; });
    var coul = {}; U.forEach(function (u) { coul[u.id] = u.couleur; });
    plateau({ titre: 'Colorier les chambres', cadre: cadreUnites(), reutilisable: true,
      consigne: 'Coloriez chaque chambre avec la couleur de son unité.',
      aide: 'Touchez une couleur puis les chambres une à une (la couleur reste choisie), ou glissez-la sur chaque chambre. Zoom possible à deux doigts.',
      vue: { textes: 'chambres', titres: 'masques', grisChambres: true, neutre: true, points: false, marques: marques },
      jetons: melanger(U.map(function (u, i) { return { id: u.id, couleur: u.couleur, aria: 'Couleur ' + (i + 1) }; })),
      compte: function () { return [Object.keys(colorees).length, ch.length]; },
      termine: function () { return Object.keys(colorees).length >= ch.length; },
      verifier: function (j, c) {
        if (!c.xy) return null;
        // la chambre visée : celle sous le doigt, sinon la chambre la plus proche (à moins de PRES px)
        var cible = c.type === 'piece' && parId[c.id] ? parId[c.id] : null;
        if (!cible) { var dmin = Infinity; ch.forEach(function (p) { var d = distRect(c.xy, p.bbox); if (d < dmin) { dmin = d; cible = p; } }); if (dmin / (c.k || 1) > PRES) return { indice: 'Touchez une chambre (zoom possible à deux doigts).' }; }
        if (colorees[cible.id]) return { indice: 'La chambre ' + (cible.chambre || '') + ' est déjà coloriée.' };
        return cible.unite === j.id ? cible.id : false;
      },
      surReussite: function (j, c, id, plan) { colorees[id] = 1; marques.push({ id: id, couleur: coul[parId[id].unite], fond: coul[parId[id].unite], opacite: 0.75, epaisseur: 5 }); plan.quiz({ marques: marques }); },
      fin: function (err) { finJeu('Colorier les chambres', err, ch.length, jeuChambres, 'chambres', 'chambres coloriées'); } });
  }
  // Niveau ultime : contours seuls, toutes les pièces à replacer, zone par zone
  function zonesUltime() {
    var items = CTX.source.pieces().filter(function (p) { return p.rea && (p.type === 'chambre' && p.chambre && p.unite || p.type === 'piece' && p.nom); });
    var k = Math.max(1, Math.ceil(items.length / TAILLE_ZONE));
    var tri = items.slice().sort(function (a, b) { return a.centre[1] - b.centre[1] || a.centre[0] - b.centre[0]; });
    var centres = []; for (var i = 0; i < k; i++) { var p = tri[Math.floor((i + 0.5) * tri.length / k)]; centres.push(p.centre.slice()); }
    var groupes = [];
    for (var it = 0; it < 12; it++) { // regroupement par proximité (k-moyennes), avec un plafond de taille par zone
      groupes = centres.map(function () { return []; });
      var cap = Math.ceil(items.length / k) + 3;
      items.slice().sort(function (a, b) { return a.centre[0] - b.centre[0]; }).forEach(function (p) {
        var ordre = centres.map(function (c, j) { return [Math.hypot(c[0] - p.centre[0], c[1] - p.centre[1]), j]; }).sort(function (a, b) { return a[0] - b[0]; });
        for (var o = 0; o < ordre.length; o++) if (groupes[ordre[o][1]].length < cap) { groupes[ordre[o][1]].push(p); return; }
        groupes[ordre[0][1]].push(p);
      });
      centres = groupes.map(function (g, j) { if (!g.length) return centres[j]; var x = 0, y = 0; g.forEach(function (p) { x += p.centre[0]; y += p.centre[1]; }); return [x / g.length, y / g.length]; });
    }
    groupes = groupes.filter(function (g) { return g.length; });
    for (var m = 0; m < groupes.length; m++) { // les petites zones (< 6 pièces) rejoignent la zone voisine la plus proche
      var g0 = groupes[m]; if (g0.length >= 6 || groupes.length < 2) continue;
      var c0 = moyenneCentres(g0), meilleur = -1, dmin = Infinity;
      groupes.forEach(function (g, j) { if (j === m) return; var c = moyenneCentres(g), d = Math.hypot(c[0] - c0[0], c[1] - c0[1]); if (d < dmin) { dmin = d; meilleur = j; } });
      groupes[meilleur] = groupes[meilleur].concat(g0); groupes.splice(m, 1); m = -1;
    }
    return groupes.sort(function (a, b) {
      var ca = a.reduce(function (s, p) { return s + p.centre[1]; }, 0) / a.length, cb = b.reduce(function (s, p) { return s + p.centre[1]; }, 0) / b.length;
      var xa = a.reduce(function (s, p) { return s + p.centre[0]; }, 0) / a.length, xb = b.reduce(function (s, p) { return s + p.centre[0]; }, 0) / b.length;
      return Math.round(ca / 400) - Math.round(cb / 400) || xa - xb;
    });
  }
  function moyenneCentres(g) { var x = 0, y = 0; g.forEach(function (p) { x += p.centre[0]; y += p.centre[1]; }); return [x / g.length, y / g.length]; }
  function jeuUltime() {
    var zones = zonesUltime(), total = 0, erreursTot = 0, z = 0, places = {}, poses = [], marques = [];
    zones.forEach(function (g) { total += g.length; });
    if (!total) return retourBase('Le plan ne contient pas encore de pièces nommées.');
    function libelle(p) { return p.type === 'chambre' ? p.chambre : p.nom; }
    function manche() {
      var g = zones[z], zoneIds = {}; g.forEach(function (p) { zoneIds[p.id] = 1; });
      var parLib = {}; g.forEach(function (p) { (parLib[sansAccent(libelle(p))] = parLib[sansAccent(libelle(p))] || []).push(p); });
      plateau({ titre: 'Niveau ultime', sousTitre: 'Zone ' + (z + 1) + ' / ' + zones.length, etape: 'Zone ' + (z + 1) + ' sur ' + zones.length,
        consigne: 'Replacez les ' + g.length + ' pièces de la zone en bleu.', cadre: bboxDe(g.map(function (p) { return p.bbox; })),
        vue: { textes: 'aucun', titres: 'masques', grisChambres: true, neutre: true, points: false, zone: zoneIds, poses: poses, marques: marques },
        jetons: melanger(g.map(function (p) { return { id: p.id, texte: libelle(p), cle: sansAccent(libelle(p)) }; })),
        indice: 'Lâchez le nom sur une pièce de la zone en bleu.',
        verifier: function (j, c) {
          if (!c.xy) return null;
          // pièces de même nom : n'importe laquelle encore libre ; les pièces déjà placées ne comptent plus
          var bonne = null, dBon = Infinity, dAutre = Infinity;
          g.forEach(function (p) {
            if (places[p.id]) return;
            var d = distRect(c.xy, p.bbox);
            if (sansAccent(libelle(p)) === j.cle) { if (d < dBon) { dBon = d; bonne = p.id; } } else dAutre = Math.min(dAutre, d);
          });
          var r = juger(dBon, dAutre, c.k || 1, 40);
          return r ? bonne : r;
        },
        surReussite: function (j, c, id, plan) {
          places[id] = 1; var p = g.filter(function (x) { return x.id === id; })[0];
          var w = p.bbox[2] - p.bbox[0], hh = p.bbox[3] - p.bbox[1], taille = Math.max(14, Math.min(34, Math.min(w, hh) / 3.2));
          marques.push({ id: id, couleur: VERT, fond: VERT }); poses.push({ x: p.centre[0], y: p.centre[1], texte: j.texte, fond: '#ffffff', couleur: '#1b2a52', taille: taille });
          plan.quiz({ marques: marques, poses: poses });
        },
        fin: function (err) {
          erreursTot += err; z++;
          if (z < zones.length) {
            page('Niveau ultime', 'Zone ' + z + ' / ' + zones.length, h('div', { class: 'quiz-fin' },
              h('p', { class: 'quiz-fin__score' }, h('b', { text: 'Zone ' + z + ' terminée' }), err ? ' · ' + err + ' erreur' + (err > 1 ? 's' : '') : ' · sans faute'),
              h('p', { text: (total - zones.slice(z).reduce(function (s, x) { return s + x.length; }, 0)) + ' pièces placées sur ' + total + '.' }),
              h('div', { class: 'quiz-actions' },
                h('button', { class: 'bouton', type: 'button', onclick: manche, text: 'Zone suivante' }),
                h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { retourBase(); }, text: 'Arrêter' }))), function () { retourBase(); });
          } else finJeu('Niveau ultime', erreursTot, total, jeuUltime, 'ultime');
        } });
    }
    manche();
  }

  /* ---------- Gestion des questions (référents) ---------- */
  function recharger() {
    return A.Api.appeler('quiz_liste', { jeton: CTX.session.jeton }).then(function (r) {
      ecrireCache(CLE_CACHE, r); CTX.ecrites = r.questions || []; CTX.total = r.total; CTX.pool = construirePool();
    });
  }
  function gestion(flash, filtreInitial) {
    var filtre = filtreInitial || 'tous', zone = h('div');
    function dessiner() {
      var l = CTX.ecrites;
      var cats = [['tous', 'Toutes'], ['reverifier', 'À revérifier'], ['publiee', 'Publiées'], ['retiree', 'Retirées']];
      if (CTX.admin) cats.splice(1, 0, ['brouillon', 'Brouillons']);
      var vis = l.filter(function (w) {
        if (filtre === 'reverifier') return w.aReverifier && w.statut === 'publiée';
        if (filtre === 'publiee') return w.statut === 'publiée' && !w.aReverifier;
        if (filtre === 'retiree') return w.statut === 'retirée';
        if (filtre === 'brouillon') return w.statut === 'brouillon';
        return true;
      });
      var brouillons = l.filter(function (w) { return w.statut === 'brouillon'; });
      remplir(zone,
        flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
        h('div', { class: 'quiz-actions' }, h('button', { class: 'bouton', type: 'button', onclick: function () { formulaire(null); }, text: '+ Nouvelle question' })),
        h('div', { class: 'plan__filtres quiz-filtres' }, cats.map(function (c) {
          var nb = c[0] === 'tous' ? l.length : l.filter(function (w) { return c[0] === 'reverifier' ? w.aReverifier && w.statut === 'publiée' : c[0] === 'publiee' ? w.statut === 'publiée' && !w.aReverifier : c[0] === 'retiree' ? w.statut === 'retirée' : w.statut === 'brouillon'; }).length;
          return h('button', { type: 'button', 'aria-pressed': String(filtre === c[0]), onclick: function () { filtre = c[0]; flash = null; dessiner(); } }, c[1] + ' (' + nb + ')');
        })),
        filtre === 'brouillon' && CTX.admin && brouillons.length ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function (ev) {
          var b = ev.currentTarget; if (b.dataset.confirme !== '1') { b.dataset.confirme = '1'; b.textContent = 'Confirmer : publier les ' + brouillons.length + ' brouillons'; return; }
          b.disabled = true; action(brouillons.map(function (w) { return w.id; }), 'publier', b, brouillons.length + ' questions publiées.');
        }, text: 'Publier tous les brouillons' }) : null,
        vis.length ? h('ul', { class: 'quiz-liste' }, vis.map(carteQuestion)) : h('p', { class: 'vide', text: 'Aucune question ici.' }));
    }
    function carteQuestion(w) {
      var etat = w.statut === 'brouillon' ? 'Brouillon' : w.statut === 'retirée' ? 'Retirée' : w.aReverifier ? 'À revérifier' : 'Publiée';
      var rep = w.type === 'qcm' && w.choix ? 'Réponse : ' + w.choix[Number(w.bonne)] : w.type === 'vf' ? 'Réponse : ' + (w.bonne === 'vrai' ? 'Vrai' : 'Faux') : w.type === 'plan' ? 'Réponse : ' + nomsCibles(String(w.bonne).split(',')).join(', ') : '';
      var actions = h('div', { class: 'quiz-actions' },
        h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { formulaire(w); }, text: 'Modifier' }),
        w.statut === 'brouillon' ? h('button', { class: 'bouton', type: 'button', onclick: function (ev) { action([w.id], 'publier', ev.currentTarget, 'Question publiée.'); }, text: 'Publier' }) : null,
        w.statut === 'retirée' ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function (ev) { action([w.id], 'publier', ev.currentTarget, 'Question remise en ligne.'); }, text: 'Remettre en ligne' }) : null,
        w.aReverifier && w.statut === 'publiée' ? h('button', { class: 'bouton', type: 'button', onclick: function (ev) { action([w.id], 'confirmer', ev.currentTarget, 'Question confirmée.'); }, text: 'Toujours juste' }) : null,
        w.statut !== 'retirée' ? h('button', { class: 'bouton bouton--discret bouton--danger', type: 'button', onclick: function (ev) {
          var b = ev.currentTarget; if (b.dataset.confirme !== '1') { b.dataset.confirme = '1'; b.textContent = 'Confirmer le retrait'; return; }
          action([w.id], 'retirer', b, 'Question retirée.');
        }, text: 'Retirer' }) : null);
      return h('li', { class: 'quiz-carte' + (w.aReverifier && w.statut === 'publiée' ? ' quiz-carte--alerte' : '') },
        h('div', { class: 'quiz-carte__tags' }, h('span', { class: 'etiquette', text: w.theme === 'urgences' ? 'Urgences' : 'Plan' }),
          h('span', { class: 'etiquette', text: { qcm: 'QCM', vf: 'Vrai / faux', plan: 'Sur le plan' }[w.type] || w.type }), h('span', { class: 'etiquette', text: etat })),
        h('p', { class: 'quiz-carte__texte', text: w.texte }), rep ? h('p', { class: 'section__note', text: rep }) : null,
        w.aReverifier && w.statut === 'publiée' ? h('p', { class: 'message-erreur', text: 'Une pièce ou un équipement lié a été modifié depuis : vérifiez que la question est toujours juste. Elle est masquée en attendant.' }) : null,
        h('p', { class: 'section__note', text: (w.auteur ? 'Par ' + w.auteur : '') + (w.modifiee ? ' · ' + w.modifiee : '') }), actions);
    }
    function action(ids, statut, bouton, msg) {
      bouton.disabled = true;
      A.Api.appeler('quiz_statut', { jeton: CTX.session.jeton, ids: ids, statut: statut }).then(recharger).then(function () { gestion(msg, filtre); })
        .catch(function (e) { bouton.disabled = false; A.alerteDouce(bouton.parentNode, A.message(e.code)); });
    }
    page('Questions du quiz', 'Référents', zone, function () { if (RELIRE) { RELIRE = false; (HAUT || A.ecranAccueil)(); } else accueilQuiz(); });
    dessiner();
  }
  function nomsCibles(ids) {
    var pieces = CTX.source.pieces(), points = CTX.source.points();
    return ids.map(function (id) {
      var p = pieces.filter(function (x) { return x.id === id; })[0]; if (p) return p.type === 'chambre' ? 'chambre ' + p.chambre : (p.nom || 'pièce sans nom');
      var q = points.filter(function (x) { return x.id === id; })[0]; if (q) return q.nom + (q.precision ? ' ' + q.precision : '') + (q.proche ? ' (près de ' + q.proche.nom + ')' : '');
      return 'élément supprimé';
    });
  }
  function formulaire(w) {
    var type = w ? w.type : 'qcm', cibles = w && w.type === 'plan' ? String(w.bonne).split(',').filter(Boolean) : [], lies = w ? (w.lies || []).filter(function (x) { return cibles.indexOf(x) < 0; }) : [];
    var theme = h('select', { id: 'qz-theme' }, [['plan', 'Plan et équipements'], ['urgences', 'Urgences et sécurité']].map(function (t) { var o = h('option', { value: t[0], text: t[1] }); if (w && w.theme === t[0]) o.selected = true; return o; }));
    var texte = h('textarea', { id: 'qz-texte', maxlength: '300', rows: '3', required: true }); texte.value = w ? w.texte : '';
    var expl = h('textarea', { id: 'qz-expl', maxlength: '400', rows: '2', placeholder: 'Affichée après la réponse (facultatif)' }); expl.value = w ? w.explication || '' : '';
    var types = h('div', { class: 'plan__bascule', role: 'radiogroup', 'aria-label': 'Type de question' });
    var zoneType = h('div'), erreur = h('p', { class: 'message-erreur', role: 'alert' }), bouton = h('button', { class: 'bouton', type: 'submit', text: w ? 'Enregistrer' : 'Publier la question' });
    var choixInputs = [0, 1, 2, 3].map(function (k) { var i = h('input', { type: 'text', maxlength: '120', placeholder: 'Réponse ' + (k + 1) + (k > 1 ? ' (facultatif)' : '') }); if (w && w.choix && w.choix[k]) i.value = w.choix[k]; return i; });
    var bonneQcm = w && w.type === 'qcm' ? Number(w.bonne) : 0, bonneVf = w && w.type === 'vf' ? w.bonne : 'vrai';
    var miniPlan = null;
    function dessinerTypes() {
      types.replaceChildren.apply(types, [['qcm', 'QCM'], ['vf', 'Vrai / faux'], ['plan', 'Sur le plan']].map(function (t) {
        return h('button', { type: 'button', role: 'radio', 'aria-checked': String(type === t[0]), 'aria-pressed': String(type === t[0]), onclick: function () { type = t[0]; dessinerTypes(); dessinerZone(); } }, t[1]);
      }));
    }
    function selecteur(liste, consigne) { // mini-plan : toucher pour (dé)sélectionner pièces et équipements
      var resume = h('p', { class: 'section__note' }), zp = h('div', { class: 'quiz-plan quiz-plan--form' });
      function maj() {
        resume.textContent = liste.length ? 'Sélection : ' + nomsCibles(liste).join(', ') : consigne;
        if (miniPlan) miniPlan.quiz({ marques: liste.map(function (id) { return /^Q/.test(id) ? { point: id, couleur: VERT } : { id: id, couleur: VERT, fond: VERT }; }) });
      }
      setTimeout(function () {
        miniPlan = monterPlan(zp, { textes: 'tout', titres: 'normal', points: true, surToucher: function (c) {
          if (c.type !== 'piece' && c.type !== 'point') return;
          var k = liste.indexOf(c.id); if (k >= 0) liste.splice(k, 1); else liste.push(c.id); maj();
        } }); maj();
      }, 0);
      return h('div', null, resume, zp);
    }
    function dessinerZone() {
      miniPlan = null;
      if (type === 'qcm') {
        remplir(zoneType, h('span', { class: 'plan__label', text: 'Réponses (cochez la bonne)' }), h('div', { class: 'quiz-form-choix' }, choixInputs.map(function (inp, k) {
          var r = h('input', { type: 'radio', name: 'qz-bonne', 'aria-label': 'Bonne réponse : ' + (k + 1) }); r.checked = k === bonneQcm; r.addEventListener('change', function () { bonneQcm = k; });
          return h('label', { class: 'quiz-form-ligne' }, r, inp);
        })), h('details', { class: 'quiz-lies' }, h('summary', { text: 'Lier à des pièces du plan (facultatif)' }),
          h('p', { class: 'section__note', text: 'Si une pièce liée est modifiée, la question sera mise de côté jusqu\'à vérification.' }), selecteur(lies, 'Aucune pièce liée.')));
      } else if (type === 'vf') {
        remplir(zoneType, h('span', { class: 'plan__label', text: 'Réponse' }), h('div', { class: 'plan__bascule' }, ['vrai', 'faux'].map(function (v) {
          return h('button', { type: 'button', 'aria-pressed': String(bonneVf === v), onclick: function (ev) { bonneVf = v; ev.currentTarget.parentNode.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.textContent.toLowerCase() === v)); }); } }, v === 'vrai' ? 'Vrai' : 'Faux');
        })), h('details', { class: 'quiz-lies' }, h('summary', { text: 'Lier à des pièces du plan (facultatif)' }), selecteur(lies, 'Aucune pièce liée.')));
      } else {
        remplir(zoneType, h('span', { class: 'plan__label', text: 'Bonne(s) réponse(s) : touchez la pièce ou l\'équipement sur le plan' }), selecteur(cibles, 'Touchez une ou plusieurs pièces / équipements acceptés comme bonne réponse.'));
      }
    }
    var form = h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); erreur.textContent = '';
      var d = { theme: theme.value, type: type, texte: texte.value.trim(), explication: expl.value.trim(), lies: lies.slice() };
      if (d.texte.length < 5) { erreur.textContent = 'Écrivez la question.'; texte.focus(); return; }
      if (type === 'qcm') {
        var c = [], bonne = -1; choixInputs.forEach(function (inp, k) { var v = inp.value.trim(); if (v) { if (k === bonneQcm) bonne = c.length; c.push(v); } });
        if (c.length < 2) { erreur.textContent = 'Indiquez au moins 2 réponses.'; return; }
        if (bonne < 0) { erreur.textContent = 'La réponse cochée est vide.'; return; }
        d.choix = c; d.bonne = bonne;
      } else if (type === 'vf') d.bonne = bonneVf;
      else { if (!cibles.length) { erreur.textContent = 'Touchez au moins une bonne réponse sur le plan.'; return; } d.bonne = cibles.slice(); d.lies = []; }
      bouton.disabled = true; bouton.textContent = 'Enregistrement…';
      A.Api.appeler('quiz_question', { jeton: CTX.session.jeton, id: w ? w.id : null, donnees: d }).then(recharger)
        .then(function () { gestion(w ? 'Question modifiée.' : 'Question publiée : elle est déjà dans le quiz.'); })
        .catch(function (e) { erreur.textContent = A.message(e.code); bouton.disabled = false; bouton.textContent = w ? 'Enregistrer' : 'Publier la question'; });
    } },
      h('div', { class: 'champ' }, h('label', { for: 'qz-theme', text: 'Thème' }), theme),
      h('span', { class: 'plan__label', text: 'Type' }), types,
      h('div', { class: 'champ' }, h('label', { for: 'qz-texte', text: 'Question' }), texte),
      zoneType,
      h('div', { class: 'champ' }, h('label', { for: 'qz-expl', text: 'Explication' }), expl),
      erreur,
      h('div', { class: 'quiz-actions' }, h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { gestion(); }, text: 'Annuler' }), bouton));
    page(w ? 'Modifier la question' : 'Nouvelle question', 'Référents', form, function () { gestion(); });
    dessinerTypes(); dessinerZone();
  }

  window.ReaQuiz = { ouvrir: ouvrir, relire: relire, theme: theme, jour: jour, jeu: jeu, records: records, carteAccueil: carteAccueil, _etat: function () { return CTX; } };
})();
