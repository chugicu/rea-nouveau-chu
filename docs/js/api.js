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
            newsletter: (function () { var l = nlDemo().filter(function (n) { return n.statut === 'publiée'; }); return l.length ? { id: l[l.length - 1].id, titre: l[l.length - 1].titre } : null; })(),
            misAJour: new Date().toISOString()
          });
        }
        if (action === 'plan') {
          if (!/^demo\./.test(d.jeton || '')) return ko(new ErreurApi('session_invalide'));
          return ok({ ok: true, donnees: planDemo(), reglages: { pieces: {}, categories: {} }, peutModifier: d.jeton !== 'demo.agent' });
        }
        if (action === 'plan_piece' || action === 'plan_categorie') {
          return d.jeton === 'demo.agent' ? ko(new ErreurApi('non_autorise')) : ok({ ok: true });
        }
        if (action.indexOf('visite') === 0) return demoVisites(action, d, ok, ko);
        if (action.indexOf('nl_') === 0) return demoNewsletters(action, d, ok, ko);
        if (action === 'ping') return ok({ ok: true });
        ko(new ErreurApi('action_inconnue'));
      }, 350);
    });
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
