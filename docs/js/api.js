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
        if (action === 'ping') return ok({ ok: true });
        ko(new ErreurApi('action_inconnue'));
      }, 350);
    });
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
    var unites = {
      flamboyant: { nom: 'Unité A', info: 'Démo · 3 lits', fond: '#ffdcbc', trait: '#e0670f', pastille: '#d9600b' },
      hibiscus: { nom: 'Unité B', info: 'Démo · 3 lits', fond: '#fcd6e5', trait: '#d1356f', pastille: '#d1356f' },
      bougainvillier: { nom: 'Unité C', info: 'Démo · 3 lits', fond: '#e9dcfa', trait: '#7b3fc4', pastille: '#7b3fc4' },
      atoumo: { nom: 'Unité D', info: 'Démo · 3 lits', fond: '#fff2a6', trait: '#c99a00', pastille: '#f5c400' }
    };
    return { viewBox: [-20, -130, 960, 940], batiment: [80, 80, 900, 740], patios: [], pieces: pieces, unites: unites,
      titres: [{ unite: 'flamboyant', x: 290, y: -60, ancre: 'm', cible: [290, 110, 290, -10] }, { unite: 'hibiscus', x: 680, y: -60, ancre: 'm', cible: [680, 110, 680, -10] }],
      acces: [{ cat: 'ascenseur', nom: 'Monte-malades', X: 820, Y: 290 }, { cat: 'escalier', nom: 'Escalier', X: 820, Y: 530 }] };
  }

  window.ReaApi = { appeler: appeler, demo: DEMO, ErreurApi: ErreurApi };
})();
