/* Échanges avec le moteur Apps Script.
   POST en text/plain : évite la requête préalable CORS, que Apps Script ne gère pas. */
(function () {
  'use strict';

  var cfg = window.REA_CONFIG || {};
  var DEMO = !cfg.API_URL;
  var DELAI_MS = 15000;

  function ErreurApi(code) { this.code = code; this.message = code; }
  ErreurApi.prototype = Object.create(Error.prototype);

  function appeler(action, donnees) {
    if (DEMO) return demo(action, donnees || {});
    var corps = JSON.stringify(Object.assign({ action: action }, donnees || {}));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var minuterie = ctrl && setTimeout(function () { ctrl.abort(); }, DELAI_MS);
    return fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: corps,
      redirect: 'follow',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (rep) {
      if (!rep.ok) throw new ErreurApi('reseau');
      return rep.json();
    }, function () {
      throw new ErreurApi('reseau');
    }).then(function (json) {
      if (!json || json.ok !== true) throw new ErreurApi((json && json.erreur) || 'erreur_serveur');
      return json;
    }).finally(function () { if (minuterie) clearTimeout(minuterie); });
  }

  /* ---------- Mode démonstration (aucune donnée réelle) ---------- */
  function demo(action, d) {
    return new Promise(function (ok, ko) {
      setTimeout(function () {
        if (action === 'login') {
          var code = String(d.code || '').trim().toUpperCase().replace(/\s+/g, '');
          var roles = { DEMO: ['agent', ''], REFDEMO: ['referent', 'Référent démo'], ADMDEMO: ['admin', 'Administrateur'] };
          if (!code) return ko(new ErreurApi('code_manquant'));
          if (!roles[code]) return ko(new ErreurApi('code_incorrect'));
          return ok({ ok: true, jeton: 'demo.' + roles[code][0], role: roles[code][0], libelle: roles[code][1],
            expiration: new Date(Date.now() + 30 * 864e5).toISOString() });
        }
        if (action === 'home') {
          if (!/^demo\./.test(d.jeton || '')) return ko(new ErreurApi('session_invalide'));
          var role = d.jeton.split('.')[1];
          var j = new Date(); j.setDate(j.getDate() + 42);
          var iso = j.getFullYear() + '-' + String(j.getMonth() + 1).padStart(2, '0') + '-' + String(j.getDate()).padStart(2, '0');
          var parF = [['Médecin', 30, 9], ['Interne', 25, 4], ['IDE', 100, 41], ['AS', 50, 22], ['Cadre', 2, 2], ['Secrétaire', 3, 1], ['Kinésithérapeute', 3, 2]]
            .map(function (f) { return { fonction: f[0], effectif: f[1], prets: f[2], pourcent: Math.round(100 * f[2] / f[1]) }; });
          return ok({
            ok: true,
            session: { role: role, libelle: role === 'agent' ? '' : (role === 'admin' ? 'Administrateur' : 'Référent démo') },
            service: 'Réanimation – USC',
            messageAccueil: 'Bienvenue ! Préparons ensemble notre installation dans le nouveau CHU.',
            dateJ: iso,
            actualites: [
              { date: iso.slice(0, 8) + '01', titre: 'Bienvenue dans l\'application', texte: 'Retrouvez ici toutes les informations pour préparer le déménagement.\nLes modules s\'ouvriront au fil des semaines.', epinglee: true },
              { date: '', titre: 'Exemple d\'actualité', texte: 'Les référents publient les actualités depuis le Google Sheets « Base ».', epinglee: false }
            ],
            jauge: { pourcent: 38, prets: 81, effectif: 213, parFonction: parF },
            elan: demoElan(),
            newsletter: (function () { var l = nlDemo().filter(function (n) { return n.statut === 'publiée'; }); return l.length ? { id: l[l.length - 1].id, titre: l[l.length - 1].titre } : null; })(),
            misAJour: new Date().toISOString()
          });
        }
        if (action === 'plan') {
          if (!/^demo\./.test(d.jeton || '')) return ko(new ErreurApi('session_invalide'));
          return ok({ ok: true, donnees: planDemo(), reglages: { pieces: {}, categories: {}, points: { Qdemo0001: { type: 'chariot', x: 450, y: 290, precision: 'Adulte' }, Qdemo0002: { type: 'echographe', x: 250, y: 530, precision: '' }, Qdemo0003: { type: 'imprimante', x: 620, y: 530, precision: 'Couleur' } } }, peutModifier: d.jeton !== 'demo.agent' });
        }
        if (action === 'plan_piece' || action === 'plan_categorie' || action === 'plan_point') {
          return d.jeton === 'demo.agent' ? ko(new ErreurApi('non_autorise')) : ok({ ok: true });
        }
        if (action.indexOf('visite') === 0) return demoVisites(action, d, ok, ko);
        if (action.indexOf('nl_') === 0) return demoNewsletters(action, d, ok, ko);
        if (action.indexOf('quiz_') === 0) return demoQuiz(action, d, ok, ko);
        if (/^(jeux_|souvenir|nuage|qr_|paris|pronostic|pari_|escape_)/.test(action)) return demoJeux(action, d, ok, ko);
        if (action === 'ping') return ok({ ok: true });
        ko(new ErreurApi('action_inconnue'));
      }, 350);
    });
  }

  /* Jeux du mode démonstration (en mémoire, tous ouverts) */
  var DJ = null;
  function jpegDemo(texte, couleur, w, hh) {
    var c = document.createElement('canvas'); c.width = w; c.height = hh; var g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, w, hh); gr.addColorStop(0, couleur); gr.addColorStop(1, '#223b80'); g.fillStyle = gr; g.fillRect(0, 0, w, hh);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold ' + Math.round(w / 12) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(texte, w / 2, hh / 2);
    g.font = Math.round(w / 26) + 'px sans-serif'; g.fillText('Photo de démonstration', w / 2, hh / 2 + w / 12);
    var d = c.toDataURL('image/jpeg', 0.8); return d.slice(d.indexOf(',') + 1);
  }
  function jeuxDemo() {
    if (DJ) return DJ;
    var j = {}; ['jauge', 'souvenirs', 'concours', 'nuage', 'qr', 'escape', 'bingo', 'paris'].forEach(function (id) { j[id] = { actif: true, actifBrut: true, termine: false, ouverture: '', fermeture: '', reglages: {} }; });
    j.jauge.reglages = { objectif: 4000, paliers: [{ pc: 10, titre: 'Échauffement', texte: 'L\'équipe est lancée !' }, { pc: 25, titre: 'Les cartons sont prêts', texte: 'Un quart du chemin.' },
      { pc: 50, titre: 'Mi-parcours', texte: 'La moitié !' }, { pc: 75, titre: 'Dernière ligne droite', texte: 'Encore un effort.' }, { pc: 100, titre: 'Prêts pour le grand départ', texte: 'Objectif atteint !' }] };
    j.nuage.reglages = { questions: ['Ce que j\'emporte', 'Ce que je laisse', 'Ce qui me fait envie', 'Ce qui m\'inquiète'] };
    j.bingo.reglages = { cases: ['J\'ai visité les nouveaux locaux|visite', 'J\'ai fait le quiz du jour|quizjour', 'J\'ai trouvé un QR code caché|qr', 'J\'ai exploré 8 pièces du plan|plan', 'J\'ai lu la newsletter|newsletter',
      'J\'ai partagé un souvenir|souvenir', 'J\'ai mis un mot dans le nuage|nuage', 'J\'ai fait un pari|pari', 'J\'ai terminé un escape game|escape', 'Je sais où est le chariot d\'urgence de mon secteur', 'J\'ai repéré les vannes de fluides',
      'J\'ai trouvé mon vestiaire', 'J\'ai aidé un collègue à se repérer', 'Je connais mon trajet domicile – nouveau CHU', 'J\'ai rangé mon casier actuel', 'J\'ai participé à une simulation', 'Je connais les couleurs des unités',
      'J\'ai pris une photo souvenir de l\'ancien service', 'J\'ai repéré la salle de détente', 'J\'ai parlé du déménagement avec une autre équipe'].map(function (t) { var x = t.split('|'); return x[1] ? { texte: x[0], auto: x[1] } : { texte: x[0] }; }) };
    j.escape.reglages = { valides: { 'transfert-309': { par: 'Démo', le: '2026-11-07' }, 'premiere-garde': { par: 'Démo', le: '2026-11-07' } } };
    j.concours.fermeture = '2026-12-15';
    DJ = { jeux: j, points: 1240 + 380, souvenirs: [
      { id: 'Sdemo1', type: 'souvenir', titre: 'Le pot de Noël 2012', texte: 'Toute l\'équipe de nuit déguisée en lutins, et le chef qui chantait faux. Inoubliable !', annee: 'vers 2012', lieu: 'Salle de pause', signature: 'Marie, IDE', photo: true, ratio: 0.75, statut: 'publié', coeurs: 12, depose: '2026-11-02', img: null, col: '#c2416f' },
      { id: 'Sdemo2', type: 'souvenir', titre: '', texte: 'Ma première garde en 1998 : un patient m\'a appris à jouer aux dominos à 4 h du matin.', annee: '1998', lieu: '', signature: '', photo: false, ratio: 1, statut: 'publié', coeurs: 7, depose: '2026-11-03' },
      { id: 'Sdemo3', type: 'souvenir', titre: 'Le couloir des box', texte: 'Combien de kilomètres parcourus ici ?', annee: '', lieu: 'Couloir', signature: 'Léo, AS', photo: true, ratio: 1.33, statut: 'publié', coeurs: 4, depose: '2026-11-04', col: '#048e39' },
      { id: 'Sdemo4', type: 'souvenir', titre: 'En attente de validation', texte: 'Exemple de souvenir à valider par un référent.', annee: '', lieu: '', signature: '', photo: false, ratio: 1, statut: 'attente', coeurs: 0, depose: '2026-11-07' },
      { id: 'Cdemo1', type: 'concours', titre: 'Lever de soleil sur la Soufrière', texte: '', signature: 'Anonyme', photo: true, ratio: 0.66, statut: 'publié', coeurs: 9, depose: '2026-11-05', col: '#d9600b' },
      { id: 'Cdemo2', type: 'concours', titre: 'Le hall sous la pluie', texte: '', signature: 'Paul', photo: true, ratio: 1, statut: 'publié', coeurs: 3, depose: '2026-11-06', col: '#1f6fa8' }],
      nuage: [[0, 'La solidarité', 5], [0, 'Les fous rires', 3], [0, 'Mes habitudes', 1], [1, 'Les fuites du toit', 4], [1, 'La chaleur', 2], [2, 'Des chambres lumineuses', 3], [2, 'Plus d\'espace', 2], [3, 'Les trajets', 2], [3, 'Se perdre', 1]].map(function (x, i) { return { id: 'Mdemo' + i, q: x[0], mot: x[1], n: x[2] }; }),
      qr: [{ code: 'DEMOQR01', nom: 'Salle de détente', cible: '', message: 'Bravo ! Ici, on souffle entre deux soins.', actif: true }, { code: 'DEMOQR02', nom: 'Pharmacie', cible: '', message: '', actif: true }],
      paris: [['cartons', 'Combien de cartons au total pour le déménagement ?', 'nombre', 'cartons'], ['premier', 'Jour et heure d\'arrivée du premier patient dans le nouveau service ?', 'dateheure', ''],
        ['dernier', 'Jour et heure d\'arrivée du dernier patient ?', 'dateheure', ''], ['duree', 'Durée totale du transfert des patients (en heures) ?', 'nombre', 'heures'], ['ambulances', 'Nombre de trajets d\'ambulance ?', 'nombre', 'trajets']]
        .map(function (x) { return { id: x[0], question: x[1], type: x[2], unite: x[3], resultat: null, prono: [] }; }) };
    return DJ;
  }
  function demoElan() { var j = jeuxDemo(); if (!j.jeux.jauge.actif) return null; var o = j.jeux.jauge.reglages.objectif; return { points: j.points, objectif: o, pourcent: Math.min(100, Math.floor(100 * j.points / o)), paliers: j.jeux.jauge.reglages.paliers }; }
  function demoJeux(action, d, ok, ko) {
    if (!/^demo\./.test(d.jeton || '')) return ko(new ErreurApi('session_absente'));
    var J = jeuxDemo(), admin = d.jeton === 'demo.admin', ref = d.jeton !== 'demo.agent';
    function trouver(l, k, v) { return l.filter(function (x) { return x[k] === v; })[0]; }
    switch (action) {
      case 'jeux_etat': return ok({ ok: true, jeux: JSON.parse(JSON.stringify(J.jeux)), admin: admin, referent: ref, elan: demoElan() });
      case 'jeux_reglage': if (!admin) return ko(new ErreurApi('non_autorise')); var g = J.jeux[d.id]; ['actif', 'ouverture', 'fermeture'].forEach(function (k) { if (k in d.donnees) g[k === 'actif' ? 'actifBrut' : k] = d.donnees[k]; }); g.actif = g.actifBrut;
        if (d.donnees.reglages) { if (d.id === 'bingo' && d.donnees.reglages.cases.length < 16) return ko(new ErreurApi('bingo_cases')); Object.assign(g.reglages, d.donnees.reglages); } return ok({ ok: true });
      case 'jeux_points': J.points += 2; return ok({ ok: true });
      case 'souvenirs': return ok({ ok: true, peutModerer: ref, coeursVisibles: d.type !== 'concours', podium: null, ouvert: true, fermeture: d.type === 'concours' ? J.jeux.concours.fermeture : '',
        souvenirs: J.souvenirs.filter(function (x) { return x.type === (d.type === 'concours' ? 'concours' : 'souvenir') && (x.statut === 'publié' || (ref && x.statut === 'attente')); }).slice().reverse()
          .map(function (x) { return { id: x.id, titre: x.titre, texte: x.texte, annee: x.annee, lieu: x.lieu, signature: x.signature, photo: x.photo, ratio: x.ratio, statut: ref ? x.statut : undefined, coeurs: x.type === 'concours' ? null : x.coeurs, depose: x.depose }; }) });
      case 'souvenir_ajouter': var n = { id: 'S' + Math.random().toString(36).slice(2, 10), type: d.donnees.type === 'concours' ? 'concours' : 'souvenir', titre: d.donnees.titre, texte: d.donnees.texte, annee: d.donnees.annee, lieu: d.donnees.lieu,
          signature: d.donnees.signature, photo: !!d.donnees.photo, img: d.donnees.photo, mini: d.donnees.mini, ratio: d.donnees.ratio || 1, statut: 'attente', coeurs: 0, depose: '2026-11-07' }; J.souvenirs.push(n); return ok({ ok: true, id: n.id });
      case 'souvenir_photo': var sv = trouver(J.souvenirs, 'id', d.id); if (!sv || !sv.photo) return ko(new ErreurApi('introuvable'));
        if (!sv.img) { sv.img = jpegDemo(sv.titre || 'Souvenir', sv.col || '#5c2e9e', 1200, Math.round(1200 * sv.ratio)); sv.mini = jpegDemo(sv.titre || 'Souvenir', sv.col || '#5c2e9e', 400, Math.round(400 * sv.ratio)); }
        return ok({ ok: true, type: 'image/jpeg', data: d.taille === 'mini' ? sv.mini : sv.img });
      case 'souvenir_moderer': if (!ref) return ko(new ErreurApi('non_autorise')); trouver(J.souvenirs, 'id', d.id).statut = d.statut === 'publier' ? 'publié' : 'refusé'; return ok({ ok: true });
      case 'souvenir_coeur': var sc = trouver(J.souvenirs, 'id', d.id); sc.coeurs += d.plus === false ? -1 : 1; return ok({ ok: true, coeurs: sc.type === 'concours' ? null : sc.coeurs });
      case 'nuage': return ok({ ok: true, questions: J.jeux.nuage.reglages.questions, peutModerer: ref, mots: J.nuage.map(function (m) { return { q: m.q, mot: m.mot, n: m.n, ids: ref ? [m.id] : undefined }; }) });
      case 'nuage_ajouter': if (/merde|putain/i.test(d.mot)) return ko(new ErreurApi('mot_refuse')); var ex = J.nuage.filter(function (m) { return m.q === d.q && m.mot.toLowerCase() === d.mot.toLowerCase(); })[0];
        if (ex) ex.n++; else J.nuage.push({ id: 'M' + Math.random().toString(36).slice(2, 8), q: d.q, mot: d.mot, n: 1 }); return ok({ ok: true });
      case 'nuage_retirer': J.nuage = J.nuage.filter(function (m) { return d.ids.indexOf(m.id) < 0; }); return ok({ ok: true });
      case 'qr_liste': return ok({ ok: true, total: J.qr.filter(function (q) { return q.actif; }).length, qr: admin ? J.qr : undefined });
      case 'qr_trouver': var q = trouver(J.qr, 'code', String(d.code).toUpperCase()); if (!q || !q.actif) return ko(new ErreurApi('qr_inconnu')); return ok({ ok: true, code: q.code, nom: q.nom, cible: q.cible, message: q.message });
      case 'qr_enregistrer': if (!admin) return ko(new ErreurApi('non_autorise'));
        if (d.donnees.supprimer) { J.qr = J.qr.filter(function (x) { return x.code !== d.code; }); return ok({ ok: true }); }
        if (d.code) { Object.assign(trouver(J.qr, 'code', d.code), d.donnees); return ok({ ok: true, code: d.code }); }
        var c = 'Q' + Math.random().toString(36).slice(2, 9).toUpperCase(); J.qr.push({ code: c, nom: d.donnees.nom, cible: d.donnees.cible || '', message: d.donnees.message || '', actif: true }); return ok({ ok: true, code: c });
      case 'paris': return ok({ ok: true, ouvert: true, fermeture: '2027-01-03', admin: admin, paris: J.paris.map(function (p) {
        var mien = p.prono.filter(function (x) { return x.app === d.appareil; })[0];
        return { id: p.id, question: p.question, type: p.type, unite: p.unite, resultat: p.resultat, participants: p.prono.length, monPari: mien ? { pseudo: mien.pseudo, valeur: mien.valeur } : null,
          podium: p.resultat == null ? undefined : p.prono.map(function (x) { return { pseudo: x.pseudo, valeur: x.valeur, ecart: Math.abs(Number(x.valeur) - Number(p.resultat)) || 0 }; }).sort(function (a, b) { return a.ecart - b.ecart; }).slice(0, 3) }; }) });
      case 'pronostic': var pa = trouver(J.paris, 'id', d.id), autre = pa.prono.filter(function (x) { return x.pseudo.toLowerCase() === d.donnees.pseudo.toLowerCase() && x.app !== d.donnees.appareil; })[0];
        if (autre) return ko(new ErreurApi('pseudo_pris'));
        pa.prono = pa.prono.filter(function (x) { return x.app !== d.donnees.appareil; }); pa.prono.push({ pseudo: d.donnees.pseudo, valeur: String(d.donnees.valeur), app: d.donnees.appareil }); return ok({ ok: true });
      case 'pari_admin': if (!admin) return ko(new ErreurApi('non_autorise'));
        if (!d.id) { J.paris.push({ id: 'X' + Math.random().toString(36).slice(2, 8), question: d.donnees.question, type: d.donnees.type, unite: d.donnees.unite, resultat: null, prono: [] }); return ok({ ok: true }); }
        var pp = trouver(J.paris, 'id', d.id); if ('resultat' in d.donnees) pp.resultat = d.donnees.resultat || null; if (d.donnees.actif === false) J.paris = J.paris.filter(function (x) { return x !== pp; }); return ok({ ok: true });
      case 'escape_valider': if (!ref) return ko(new ErreurApi('non_autorise')); var v = J.jeux.escape.reglages.valides;
        if (d.valide === true) v[d.scenario] = { par: 'Démo', le: '2026-11-07' }; else if (d.valide === false) delete v[d.scenario]; return ok({ ok: true, valides: v });
    }
    ko(new ErreurApi('action_inconnue'));
  }

  /* Quiz du mode démonstration (en mémoire) */
  var DQ = null, DQ_TOTAL = 1240;
  function quizDemo() {
    var ph = (planDemo().pieces.filter(function (p) { return p.nom === 'Pharmacie'; })[0] || {}).id || 'P001';
    if (!DQ) DQ = [
      { id: 'QZdemo00001', theme: 'urgences', type: 'vf', texte: 'Le chariot d\'urgence se vérifie avec une check-list datée et signée, y compris après chaque utilisation.', choix: null, bonne: 'vrai', explication: 'Vérification régulière et après chaque utilisation.', lies: [], statut: 'publiée', auteur: 'Démo', modifiee: '2026-11-01' },
      { id: 'QZdemo00002', theme: 'urgences', type: 'qcm', texte: 'Devant un arrêt cardiaque dans une chambre, la première chose à faire est de…', choix: ['Appeler à l\'aide et commencer le massage cardiaque', 'Aller chercher seul le chariot d\'urgence', 'Prévenir la famille'], bonne: '0', explication: 'Alerter et masser sans attendre.', lies: [], statut: 'publiée', auteur: 'Démo', modifiee: '2026-11-01' },
      { id: 'QZdemo00003', theme: 'plan', type: 'plan', texte: 'Touchez la pharmacie.', choix: null, bonne: ph, explication: 'Exemple de question rédigée « sur le plan ».', lies: [ph], statut: 'publiée', auteur: 'Démo', modifiee: '2026-11-01' },
      { id: 'QZclaude01', theme: 'plan', type: 'qcm', texte: 'Combien de lits de réanimation compte le nouveau service (hors lits gelés) ?', choix: ['29', '34', '38', '45'], bonne: '0', explication: 'Bougainvillier 9 + Hibiscus 8 + Atoumo 4 + Flamboyant 8.', lies: [], statut: 'brouillon', auteur: 'Claude (à relire)', modifiee: '2026-11-07' }
    ];
    return DQ;
  }
  function demoQuiz(action, d, ok, ko) {
    if (!/^demo\./.test(d.jeton || '')) return ko(new ErreurApi('session_absente'));
    var ref = d.jeton !== 'demo.agent', admin = d.jeton === 'demo.admin', l = quizDemo();
    if (action === 'quiz_liste') return ok({ ok: true, total: DQ_TOTAL, objectif: 3000, peutGerer: ref, admin: admin,
      questions: l.filter(function (q) { return q.statut === 'brouillon' ? admin : (ref || q.statut === 'publiée'); }).map(function (q) {
        var o = { id: q.id, theme: q.theme, type: q.type, texte: q.texte, choix: q.choix, bonne: q.bonne, explication: q.explication, lies: q.lies };
        if (ref) { o.statut = q.statut; o.auteur = q.auteur; o.modifiee = q.modifiee; o.aReverifier = false; } return o; }) });
    if (action === 'quiz_compteur') { if (!(d.n >= 1 && d.n <= 50)) return ko(new ErreurApi('requete_invalide')); DQ_TOTAL += d.n; return ok({ ok: true, total: DQ_TOTAL }); }
    if (!ref) return ko(new ErreurApi('non_autorise'));
    if (action === 'quiz_question') {
      var x = d.donnees || {}, q = d.id ? l.filter(function (y) { return y.id === d.id; })[0] : null;
      var v = { theme: x.theme, type: x.type, texte: x.texte, choix: x.choix || null, bonne: Array.isArray(x.bonne) ? x.bonne.join(',') : String(x.bonne), explication: x.explication || '', lies: (x.lies || []).concat(Array.isArray(x.bonne) ? x.bonne : []), modifiee: '2026-11-07' };
      if (q) Object.assign(q, v); else { q = Object.assign({ id: 'QZ' + Math.random().toString(36).slice(2, 12), statut: 'publiée', auteur: 'Démo' }, v); l.push(q); }
      return ok({ ok: true, id: q.id });
    }
    if (action === 'quiz_statut') {
      var n = 0; l.forEach(function (q) { if (d.ids.indexOf(q.id) < 0) return; if (q.statut === 'brouillon' && !admin) return; n++; if (d.statut === 'retirer') q.statut = 'retirée'; if (d.statut === 'publier') q.statut = 'publiée'; });
      return n ? ok({ ok: true, n: n }) : ko(new ErreurApi('question_introuvable'));
    }
    ko(new ErreurApi('action_inconnue'));
  }

  /* Newsletters du mode démonstration (en mémoire). Une lettre fictive est dessinée à la volée. */
  var DN = null;
  function pageDemo(n) {
    var c = document.createElement('canvas'); c.width = 1240; c.height = 1754;
    var g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#223b80'; g.fillRect(0, 0, c.width, 260);
    g.fillStyle = '#ffffff'; g.font = 'bold 84px sans-serif'; g.fillText('Lettre de démonstration', 70, 150);
    g.font = '40px sans-serif'; g.fillText('Page ' + n + ' – contenu fictif', 70, 215);
    g.fillStyle = '#40a8df'; g.fillRect(70, 330, 1100, 14);
    g.fillStyle = '#1b2a52'; g.font = 'bold 54px sans-serif'; g.fillText(n === 1 ? 'Le mot de l\'équipe projet' : 'Le point travaux', 70, 450);
    g.font = '34px sans-serif'; g.fillStyle = '#4c5a7a';
    for (var i = 0; i < 16; i++) g.fillRect(70, 520 + i * 62, i % 4 === 3 ? 640 : 1100, 22);
    g.fillStyle = '#e6f1fa'; g.fillRect(70, 1540, 1100, 140);
    g.fillStyle = '#223b80'; g.font = 'bold 36px sans-serif'; g.fillText('Mode démonstration : aucune donnée réelle', 110, 1625);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }
  function nlDemo() {
    if (!DN) DN = [{ id: 'NLdemo00001', titre: 'Lettre de démonstration', parution: 'Novembre 2026', pages: 2, ratio: 1.414, ajout: '2026-11-01', statut: 'publiée', images: [] }];
    return DN;
  }
  function demoNewsletters(action, d, ok, ko) {
    var admin = d.jeton === 'demo.admin', l = nlDemo();
    if (!/^demo\./.test(d.jeton || '')) return ko(new ErreurApi('session_invalide'));
    function trouver() { for (var i = 0; i < l.length; i++) if (l[i].id === d.id) return l[i]; return null; }
    if (action === 'nl_liste') return ok({ ok: true, peutGerer: admin, newsletters: l.filter(function (n) { return n.statut === 'publiée'; }).slice().reverse()
      .map(function (n) { return { id: n.id, titre: n.titre, parution: n.parution, pages: n.pages, ratio: n.ratio, ajout: n.ajout }; }) });
    if (action === 'nl_page') {
      var n = trouver(); if (!n) return ko(new ErreurApi('newsletter_introuvable'));
      if (n.id === 'NLdemo00001' && !n.images[d.page]) n.images[d.page] = pageDemo(d.page + 1);
      return n.images[d.page] ? ok({ ok: true, page: d.page, type: 'image/jpeg', data: n.images[d.page] }) : ko(new ErreurApi('requete_invalide'));
    }
    if (!admin) return ko(new ErreurApi('non_autorise'));
    if (action === 'nl_ajouter') {
      if (!d.donnees || !d.donnees.titre || !(d.donnees.pages >= 1 && d.donnees.pages <= 16)) return ko(new ErreurApi('requete_invalide'));
      var id = 'NL' + Math.random().toString(36).slice(2, 12).padEnd(10, '0');
      l.push({ id: id, titre: d.donnees.titre, parution: d.donnees.parution || '', pages: d.donnees.pages, ratio: d.donnees.ratio || 1.414, ajout: new Date().toISOString().slice(0, 10), statut: 'brouillon', images: [] });
      return ok({ ok: true, id: id });
    }
    var x = trouver(); if (!x) return ko(new ErreurApi('newsletter_introuvable'));
    if (action === 'nl_envoyer_page') { if (!/^\/9j\//.test(d.data || '')) return ko(new ErreurApi('requete_invalide')); x.images[d.page] = d.data; return ok({ ok: true, page: d.page }); }
    if (action === 'nl_publier') { for (var k = 0; k < x.pages; k++) if (!x.images[k]) return ko(new ErreurApi('newsletter_incomplete')); x.statut = 'publiée'; return ok({ ok: true }); }
    if (action === 'nl_retirer') { x.statut = 'retirée'; x.images = []; return ok({ ok: true }); }
    ko(new ErreurApi('action_inconnue'));
  }

  /* Visites fictives du mode démonstration (en mémoire, perdues au rechargement) */
  var DV = null;
  function demoVisites(action, d, ok, ko) {
    var ref = d.jeton !== 'demo.agent';
    if (!DV) {
      var j = function (n) { var x = new Date(Date.now() + n * 864e5); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
      DV = { creneaux: [
        { id: 'C1', date: j(2), heure: '14:00', duree: 60, lieu: 'Hall du bâtiment 50, niveau 3', guide: 'Référent démo', places: 8, statut: 'ouvert' },
        { id: 'C2', date: j(2), heure: '16:00', duree: 60, lieu: 'Hall du bâtiment 50, niveau 3', guide: 'Référent démo', places: 2, statut: 'ouvert' },
        { id: 'C3', date: j(5), heure: '09:30', duree: 90, lieu: 'Entrée Mahogany', guide: 'Cadre de nuit', places: 10, statut: 'ouvert' }],
        ins: [{ id: 'I0', creneau: 'C2', prenom: 'Léa', initiale: 'M', fonction: 'AS', code: 'ABCDEF', present: false }, { id: 'I00', creneau: 'C2', prenom: 'Tom', initiale: 'R', fonction: 'IDE', code: 'GHJKLM', present: false }] };
    }
    var pub = function (c, liste) { var l = DV.ins.filter(function (x) { return x.creneau === c.id; });
      var o = Object.assign({}, c, { inscrits: l.length, restantes: Math.max(0, c.places - l.length) });
      if (liste) o.liste = l.map(function (x) { return { id: x.id, prenom: x.prenom, initiale: x.initiale, fonction: x.fonction, present: x.present }; });
      return o; };
    if (action === 'visites') return ok({ ok: true, creneaux: DV.creneaux.filter(function (c) { return ref || c.statut !== 'annulé'; }).map(function (c) { return pub(c, ref); }),
      fonctions: ['Médecin', 'Interne', 'IDE', 'AS', 'Cadre', 'Secrétaire', 'Kinésithérapeute'], peutModifier: ref });
    if (action === 'visite_inscrire') {
      var c = DV.creneaux.filter(function (x) { return x.id === d.creneau; })[0];
      if (!c) return ko(new ErreurApi('creneau_introuvable'));
      if (pub(c).restantes <= 0) return ko(new ErreurApi('creneau_complet'));
      var id = 'I' + Math.random().toString(36).slice(2, 8), code = Math.random().toString(36).slice(2, 8).toUpperCase();
      DV.ins.push(Object.assign({ id: id, creneau: c.id, code: code, present: false }, d.donnees));
      return ok({ ok: true, id: id, code: code, creneau: pub(c) });
    }
    if (action === 'visite_statut') return ok({ ok: true, reservations: (d.reservations || []).map(function (r) {
      var x = DV.ins.filter(function (i) { return i.id === r.id && i.code === r.code; })[0];
      if (!x) return { id: r.id, existe: true }; // en démo, on garde les réservations d'un rechargement précédent
      return { id: x.id, existe: true, present: x.present, creneau: pub(DV.creneaux.filter(function (c) { return c.id === x.creneau; })[0]) };
    }) });
    if (action === 'visite_annuler') { DV.ins = DV.ins.filter(function (x) { return !(x.id === d.id && x.code === d.code); }); return ok({ ok: true }); }
    if (!ref) return ko(new ErreurApi('non_autorise'));
    if (action === 'visite_creneau') {
      var dn = d.donnees;
      if (dn.id) { var e = DV.creneaux.filter(function (x) { return x.id === dn.id; })[0]; Object.assign(e, dn); }
      else DV.creneaux.push(Object.assign({}, dn, { id: 'C' + Math.random().toString(36).slice(2, 7), statut: 'ouvert' }));
      DV.creneaux.sort(function (a, b) { return (a.date + a.heure) < (b.date + b.heure) ? -1 : 1; });
      return ok({ ok: true });
    }
    if (action === 'visite_presence') { DV.ins.forEach(function (x) { if (x.id === d.id) x.present = d.present; }); return ok({ ok: true }); }
    ko(new ErreurApi('action_inconnue'));
  }

  /* Plan fictif du mode démonstration : le vrai plan n'est jamais publié sur GitHub */
  function planDemo() {
    var R = function (x0, y0, x1, y1) { return 'M' + x0 + ',' + y0 + ' H' + x1 + ' V' + y1 + ' H' + x0 + 'Z'; };
    var pieces = [], n = 0;
    function ajoute(type, x0, y0, x1, y1, extra) {
      n += 1; pieces.push(Object.assign({ id: 'P' + String(n).padStart(3, '0'), type: type, d: R(x0, y0, x1, y1), bbox: [x0, y0, x1, y1], centre: [(x0 + x1) / 2, (y0 + y1) / 2],
        chambre: null, unite: null, nom: null, precision: null, libelle_complet: null, categorie: null, source: null }, extra || {}));
    }
    for (var i = 0; i < 6; i++) ajoute('chambre', 100 + i * 130, 100, 220 + i * 130, 260, { chambre: String(301 + i), unite: i < 3 ? 'flamboyant' : 'hibiscus' });
    for (var j = 0; j < 6; j++) ajoute('chambre', 100 + j * 130, 560, 220 + j * 130, 720, { chambre: String(307 + j), unite: j < 3 ? 'bougainvillier' : 'atoumo' });
    ajoute('piece', 100, 330, 300, 490, { nom: 'Poste de soins', categorie: 'soins', source: 'plan' });
    ajoute('piece', 310, 330, 430, 410, { nom: 'Bureau médical', precision: '4 postes', categorie: 'bureau', source: 'repartition' });
    ajoute('piece', 310, 415, 430, 490, { nom: 'Garde', categorie: 'personnel', source: 'plan' });
    ajoute('piece', 440, 330, 560, 490, { nom: 'Attente familles', categorie: 'familles', source: 'plan' });
    ajoute('piece', 570, 330, 690, 410, { nom: 'Linge propre', categorie: 'logistique', source: 'plan' });
    ajoute('piece', 570, 415, 690, 490);
    ajoute('piece', 700, 330, 880, 490);
    ajoute('piece', 100, 760, 280, 840, { nom: 'Pharmacie', categorie: 'soins' });
    ajoute('piece', 290, 760, 470, 840, { nom: 'Salle de soins', categorie: 'soins' });
    ajoute('piece', 480, 760, 600, 840, { nom: 'Vestiaire H', categorie: 'personnel' });
    ajoute('piece', 610, 760, 730, 840, { nom: 'Vestiaire F', categorie: 'personnel' });
    ajoute('piece', 740, 760, 880, 840, { nom: 'Détente', categorie: 'personnel' });
    var unites = {
      flamboyant: { nom: 'Unité A', info: 'Démo · 3 lits', fond: '#ffdcbc', trait: '#e0670f', pastille: '#d9600b' },
      hibiscus: { nom: 'Unité B', info: 'Démo · 3 lits', fond: '#fcd6e5', trait: '#d1356f', pastille: '#d1356f' },
      bougainvillier: { nom: 'Unité C', info: 'Démo · 3 lits', fond: '#e9dcfa', trait: '#7b3fc4', pastille: '#7b3fc4' },
      atoumo: { nom: 'Unité D', info: 'Démo · 3 lits', fond: '#fff2a6', trait: '#c99a00', pastille: '#f5c400' }
    };
    return { viewBox: [-20, -130, 960, 1010], batiment: [80, 80, 900, 860], patios: [], pieces: pieces, unites: unites,
      titres: [{ unite: 'flamboyant', x: 290, y: -60, ancre: 'm', cible: [290, 110, 290, -10] }, { unite: 'hibiscus', x: 680, y: -60, ancre: 'm', cible: [680, 110, 680, -10] }],
      acces: [{ cat: 'ascenseur', nom: 'Monte-malades', X: 820, Y: 290 }, { cat: 'escalier', nom: 'Escalier', X: 820, Y: 530 }] };
  }

  window.ReaApi = { appeler: appeler, demo: DEMO, ErreurApi: ErreurApi };
})();
