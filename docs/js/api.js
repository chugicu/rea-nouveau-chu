/* Échanges avec le moteur Apps Script.
   POST en text/plain : évite la requête préalable CORS, que Apps Script ne gère pas. */
(function () {
  'use strict';

  var cfg = window.REA_CONFIG || {};
  /* Cap NCHUG (plusieurs services) : CAP_URL présent dans config.js. Sinon : un seul service (API_URL), comme la réa. */
  var MULTI = cfg.CAP_URL !== undefined;
  var DEMO = MULTI ? !cfg.CAP_URL : !cfg.API_URL;
  var DELAI_MS = 15000;
  var SERVICE = null; // { id, nom, api? } : service choisi (Cap NCHUG)
  var ACTIONS_ANNUAIRE = { services: 1, annuaire_login: 1, annuaire_etat: 1, service_creer: 1, service_modifier: 1, service_code: 1, createur: 1, service_rattacher: 1,
    defi_gestion: 1, defi_mode: 1, defi_question: 1, defi_statut: 1, defi_site: 1, defi_importer: 1, defi_raz: 1, commun_jeton: 1, tableau_bord: 1 }; // gestion du Défi CHU, contenus communs : moteur commun
  // Lectures : on peut les refaire sans risque si le réseau a coupé
  var LECTURES = { ping: 1, home: 1, plan: 1, services: 1, quiz_liste: 1, jeux_etat: 1, souvenirs: 1, souvenir_photo: 1, nuage: 1, paris: 1, qr_liste: 1,
    visites: 1, visite_statut: 1, nl_liste: 1, nl_page: 1, codes_etat: 1, annuaire_etat: 1, defi_jour: 1, defi_classement: 1, defi_parcours: 1, defi_gestion: 1, actu_liste: 1, docs_liste: 1, logo: 1, escape_scenarios: 1, tableau_bord: 1 };
  var ATTENTES = [1200, 2500, 5000]; // nouveaux essais en cas d'affluence

  function ErreurApi(code) { this.code = code; this.message = code; }
  ErreurApi.prototype = Object.create(Error.prototype);

  function adresse(action) {
    if (!MULTI) return cfg.API_URL;
    if (SERVICE && SERVICE.api && !ACTIONS_ANNUAIRE[action]) return SERVICE.api; // service sur son propre moteur (la réa au début)
    return cfg.CAP_URL;
  }
  function appeler(action, donnees) {
    donnees = Object.assign({}, donnees || {});
    if (MULTI && SERVICE && !SERVICE.api && !ACTIONS_ANNUAIRE[action]) donnees.service = SERVICE.id;
    if (DEMO) return demo(action, donnees);
    var corps = JSON.stringify(Object.assign({ action: action }, donnees));
    return essai(adresse(action), corps, action, 0).catch(function (e) {
      if (MULTI && e && e.code === 'service_inconnu') setTimeout(function () { window.dispatchEvent(new CustomEvent('rea:service-ferme')); }, 0);
      if (MULTI && e && e.code === 'service_deplace' && SERVICE && SERVICE.api) setTimeout(function () { window.dispatchEvent(new CustomEvent('rea:service-deplace')); }, 0); // le service a rejoint le moteur commun
      throw e;
    });
  }
  function essai(url, corps, action, n) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var minuterie = ctrl && setTimeout(function () { ctrl.abort(); }, DELAI_MS);
    function encore(code) { // affluence : Google n'a pas traité la demande, on réessaie un peu plus tard
      if (n >= ATTENTES.length) throw new ErreurApi(code);
      return new Promise(function (ok) { setTimeout(ok, ATTENTES[n] * (0.8 + Math.random() * 0.4)); }).then(function () { return essai(url, corps, action, n + 1); });
    }
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: corps, redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
      .then(function (rep) {
        if (rep.status === 429 || rep.status === 503) return { occupe: true };
        if (!rep.ok) throw new ErreurApi('reseau');
        return rep.text().then(function (t) {
          try { return { json: JSON.parse(t) }; } catch (e) { return /simultan|too many|trop de|invoked too many/i.test(t) ? { occupe: true } : { json: null }; }
        });
      }, function (e) { return { coupe: true, delai: e && e.name === 'AbortError' }; })
      .then(function (r) {
        if (minuterie) clearTimeout(minuterie);
        if (r.occupe) return encore('occupe');
        if (r.coupe) { if (LECTURES[action] && !r.delai && n < 1) return encore('reseau'); throw new ErreurApi('reseau'); }
        var json = r.json;
        if (!json || json.ok !== true) throw new ErreurApi((json && json.erreur) || 'erreur_serveur');
        return json;
      });
  }
  function choisirService(s) { SERVICE = s ? { id: s.id, nom: s.nom, api: s.api || null } : null; }

  /* ---------- Mode démonstration (aucune donnée réelle) ---------- */
  /* Démonstration Cap NCHUG : annuaire et codes en mémoire sur ce téléphone */
  function demoLire(k, defaut) { try { return JSON.parse(localStorage.getItem('rea.demo.' + k)) || defaut; } catch (e) { return defaut; } }
  function demoEcrire(k, v) { try { localStorage.setItem('rea.demo.' + k, JSON.stringify(v)); } catch (e) { /* stockage bloqué */ } }
  function demoServices() { return demoLire('services', [{ id: 'rea', nom: 'Réanimation – USC', actif: true, cree: '2026-11-01', par: 'Démo' }, { id: 'cardiologie', nom: 'Cardiologie', actif: true, cree: '2026-11-02', par: 'Démo' }, { id: 'neonat', nom: 'Néonatalogie', actif: true, cree: '2026-11-02', par: 'Démo' }]); }
  function demoAnnuaire(action, d) {
    var roles = { SUPDEMO: ['super', 'Super-administrateur'], CREADEMO: ['createur', 'Créateur démo'] };
    var role = /^cap\./.test(d.jeton || '') ? d.jeton.split('.')[1] : null, crea = demoLire('createurs', [{ nom: 'Créateur démo', actif: true }]);
    function etat() { return { ok: true, role: role, libelle: roles[role === 'super' ? 'SUPDEMO' : 'CREADEMO'][1], services: demoServices(), createurs: role === 'super' ? crea : null }; }
    if (action === 'services') return { ok: true, services: demoServices().filter(function (x) { return x.actif; }).map(function (x) { return { id: x.id, nom: x.nom }; }) };
    if (action === 'annuaire_login') { var c = String(d.code || '').trim().toUpperCase(); if (!roles[c]) throw new ErreurApi('code_incorrect'); return { ok: true, jeton: 'cap.' + roles[c][0], role: roles[c][0], libelle: roles[c][1], expiration: new Date(Date.now() + 864e5).toISOString() }; }
    if (!role) throw new ErreurApi('session_invalide');
    if (action === 'annuaire_etat') return etat();
    if (action === 'service_creer') {
      var nom = String((d.donnees || {}).nom || '').trim(), id = String((d.donnees || {}).id || nom).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
      if (nom.length < 2 || !/^[a-z][a-z0-9-]{1,23}$/.test(id)) throw new ErreurApi('requete_invalide');
      var l = demoServices(); if (l.some(function (x) { return x.id === id; })) throw new ErreurApi('service_existe');
      l.push({ id: id, nom: nom, actif: true, cree: new Date().toISOString().slice(0, 10), par: roles[role === 'super' ? 'SUPDEMO' : 'CREADEMO'][1] }); demoEcrire('services', l);
      return { ok: true, service: { id: id, nom: nom }, codes: { admin: 'ADMDEMO', agents: 'DEMO' } };
    }
    if (action === 'service_modifier') {
      var l2 = demoServices(), sv = l2.filter(function (x) { return x.id === d.id; })[0]; if (!sv) throw new ErreurApi('introuvable');
      if (d.donnees && d.donnees.actif === false && role !== 'super') throw new ErreurApi('non_autorise');
      if (d.donnees && d.donnees.nom) sv.nom = d.donnees.nom; if (d.donnees && d.donnees.actif != null) sv.actif = d.donnees.actif; demoEcrire('services', l2); return etat();
    }
    if (action === 'service_code') return { ok: true, code: d.quoi === 'admin' ? 'ADMDEMO' : 'DEMO' };
    if (action === 'service_rattacher') {
      if (role !== 'super') throw new ErreurApi('non_autorise');
      var dr = d.donnees || {}; if (!/\/d\/[A-Za-z0-9_-]{20,}/.test(dr.sheets || '') && !/^[A-Za-z0-9_-]{20,}$/.test(dr.sheets || '')) throw new ErreurApi('requete_invalide');
      if (String(dr.cle || '').replace(/[^A-Za-z0-9]/g, '').length !== 20) throw new ErreurApi('cle_incorrecte');
      var lr = demoServices(), idr = String(dr.id || 'rea'); if (lr.some(function (x) { return x.id === idr; })) throw new ErreurApi('service_existe');
      lr.push({ id: idr, nom: dr.nom || idr, actif: true, cree: new Date().toISOString().slice(0, 10), par: 'Super-administrateur (rattaché)' }); demoEcrire('services', lr);
      return { ok: true, service: { id: idr, nom: dr.nom || idr }, avertissements: [], defi: '' };
    }
    if (action === 'createur') {
      if (role !== 'super') throw new ErreurApi('non_autorise');
      var x = crea.filter(function (c) { return c.nom === d.nom; })[0];
      if (d.actif === false) { if (x) x.actif = false; } else { if (!x) { x = { nom: d.nom }; crea.push(x); } x.actif = true; }
      demoEcrire('createurs', crea); return { ok: true, code: d.actif === false ? null : 'CREADEMO', etat: etat() };
    }
    throw new ErreurApi('action_inconnue');
  }
  function demoCodes(action, d) {
    if (!/^demo\.admin/.test(d.jeton || '')) throw new ErreurApi('non_autorise');
    var refs = demoLire('referents', [{ nom: 'Référent démo', actif: true, modifie: '2026-11-01' }]);
    var cpt = demoLire('compteurs', { quiz: 1240, jeux: 380 });
    function etat() { return { ok: true, referents: refs, codeAgents: true, compteurs: cpt }; }
    if (action === 'codes_etat') return etat();
    var code = null;
    if (d.quoi === 'agents') code = 'DEMO'; else if (d.quoi === 'admin') code = 'ADMDEMO';
    else if (d.quoi === 'referent') { refs = refs.filter(function (r) { return r.nom !== d.nom; }); refs.push({ nom: d.nom, actif: true, modifie: new Date().toISOString().slice(0, 10) }); code = 'REFDEMO'; }
    else if (d.quoi === 'referent_off') refs.forEach(function (r) { if (r.nom === d.nom) r.actif = false; });
    else if (d.quoi === 'raz_quiz' || d.quoi === 'raz_jeux') { cpt[d.quoi === 'raz_quiz' ? 'quiz' : 'jeux'] = 0; demoEcrire('compteurs', cpt); }
    demoEcrire('referents', refs);
    return { ok: true, code: code, etat: etat() };
  }
  function demo(action, d) {
    return new Promise(function (ok, ko) {
      setTimeout(function () {
        try {
          if (/^defi_/.test(action)) return ok(demoDefi(action, d));
          if (/^(actu_|docs_|service_reglages|logo|plan_importer|commun_jeton|tableau_bord)/.test(action)) return ok(demoLots(action, d));
          if (ACTIONS_ANNUAIRE[action]) return ok(demoAnnuaire(action, d));
          if (action === 'codes_etat' || action === 'codes_changer') return ok(demoCodes(action, d));
        } catch (e) { return ko(e); }
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
          return ok(demoAccueilPlus({
            ok: true,
            session: { role: role, libelle: role === 'agent' ? '' : (role === 'admin' ? 'Administrateur' : 'Référent démo') },
            service: (SERVICE && SERVICE.nom) || 'Réanimation – USC',
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
          }));
        }
        if (action === 'plan') {
          if (!/^demo\./.test(d.jeton || '')) return ko(new ErreurApi('session_invalide'));
              return ok({ ok: true, donnees: demoLire('plan-importe', null) || planDemo(), reglages: { pieces: {}, categories: {}, points: { Qdemo0001: { type: 'chariot', x: 450, y: 290, precision: 'Adulte' }, Qdemo0002: { type: 'echographe', x: 250, y: 530, precision: '' }, Qdemo0003: { type: 'imprimante', x: 620, y: 530, precision: 'Couleur' } } }, peutModifier: d.jeton !== 'demo.agent',
            gps: (function () { try { return JSON.parse(localStorage.getItem('rea.demo.gps') || 'null'); } catch (e) { return null; } })(), admin: d.jeton === 'demo.admin' });
        }
        if (action === 'gps_calage') {
          if (d.jeton !== 'demo.admin') return ko(new ErreurApi('non_autorise'));
          var cal = { points: (d.calage && d.calage.points) || [], le: new Date().toISOString() };
          try { localStorage.setItem('rea.demo.gps', JSON.stringify(cal)); } catch (e) { /* stockage bloqué */ }
          return ok({ ok: true, calage: cal });
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
      case 'escape_scenarios': return ok({ ok: true, scenarios: J.escapes || null });
      case 'escape_enregistrer': case 'escape_retirer': {
        if (!ref) return ko(new ErreurApi('non_autorise'));
        if (!J.escapes) J.escapes = (d.modeles || []).map(function (m) { return Object.assign({ statut: 'actif', auteur: 'Modèle Cap NCHUG' }, JSON.parse(JSON.stringify(m))); });
        var ve = J.jeux.escape.reglages.valides, xe = d.id ? J.escapes.filter(function (y) { return y.id === d.id; })[0] : null;
        if (action === 'escape_retirer') { xe.statut = xe.statut === 'retiré' ? 'actif' : 'retiré'; if (xe.statut === 'retiré') delete ve[xe.id]; return ok({ ok: true, statut: xe.statut }); }
        if (xe) { Object.assign(xe, d.scenario, { auteur: 'Référent démo' }); delete ve[xe.id]; return ok({ ok: true, id: xe.id }); }
        var ne = Object.assign({ id: 'mission-' + Math.random().toString(36).slice(2, 6), statut: 'actif', auteur: 'Référent démo' }, d.scenario); J.escapes.push(ne); return ok({ ok: true, id: ne.id });
      }
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
  /* Démonstration du Défi CHU : site et questions imaginaires (le vrai plan n'est jamais sur GitHub) */
  function demoDefiBase() {
    return demoLire('defi', {
      mode: 'test', debut: '',
      site: { batiments: [{ code: 'B1', nom: 'Accueil', couleur: '#2f3f9e', x: 210, y: 330, l: 80, h: 44 }, { code: 'B2', nom: 'Soins', couleur: '#e2302f', x: 214, y: 220, l: 110, h: 90 },
        { code: 'B3', nom: 'Plateau', couleur: '#ffffff', x: 30, y: 150, l: 128, h: 130 }, { code: 'B4', nom: 'Enfants', couleur: '#f7c600', x: 44, y: 296, l: 100, h: 70 }, { code: 'B5', nom: 'Logistique', couleur: '', x: 214, y: 80, l: 110, h: 110 }],
        entrees: [{ code: '2', batiment: 'B1', x: 192, y: 352 }, { code: '5', batiment: 'B2', x: 206, y: 262 }, { code: '8', batiment: 'B4', x: 160, y: 318 }, { code: '11', batiment: 'B3', x: 168, y: 214 }, { code: '14', batiment: 'B5', x: 206, y: 130 }],
        parkings: [{ code: 'PP', nom: 'Parking personnel', x: 100, y: 6, l: 160, h: 40 }, { code: 'PV', nom: 'Parking visiteurs', x: 90, y: 400, l: 190, h: 50 }] },
      questions: [
        { id: 'X01', theme: 'divers', type: 'qcm', texte: 'Exemple : combien de jours compte une semaine ?', choix: ['5', '6', '7', '8'], bonne: 2, explication: 'Question d\'exemple : les vraies questions sont gérées par les créateurs.', source: 'Démo', statut: 'validée' },
        { id: 'X02', theme: 'rue', type: 'qcm', texte: 'Dans l\'hôpital démo, à quel N° se trouve l\'accueil ?', choix: ['N° 2', 'N° 5', 'N° 8', 'N° 14'], bonne: 0, explication: 'N° 2 : l\'accueil (B1), en bleu.', source: 'Démo', statut: 'validée' },
        { id: 'X03', theme: 'divers', type: 'vf', texte: 'Le niveau 0 est celui de la rue.', bonne: 'vrai', explication: 'Le niveau 0 est le niveau de la rue intérieure.', source: 'Démo', statut: 'validée' },
        { id: 'X04', theme: 'ascenseur', type: 'ascenseur', texte: 'Prenez l\'ascenseur : le service démo de soins.', bonne: { entree: '5', niveau: '2' }, explication: 'N° 5 (B2), niveau 2.', source: 'Démo', statut: 'validée' },
        { id: 'X05', theme: 'ascenseur', type: 'ascenseur', texte: 'Prenez l\'ascenseur : le bloc démo.', bonne: { entree: 'B3', niveau: '1' }, explication: 'B3, niveau 1.', source: 'Démo', statut: 'à valider' },
        { id: 'X06', theme: 'ascenseur', type: 'ascenseur', texte: 'Prenez l\'ascenseur : la pédiatrie démo.', bonne: { entree: '8', niveau: '3' }, explication: 'N° 8 (B4), niveau 3.', source: 'Démo', statut: 'à valider' },
        { id: 'X07', theme: 'divers', type: 'qcm', texte: 'Exemple : de quelle couleur est l\'accueil démo ?', choix: ['Rouge', 'Bleu', 'Jaune', 'Vert'], bonne: 1, explication: 'Bleu, comme son bâtiment B1.', source: 'Démo', statut: 'à valider' },
        { id: 'X08', theme: 'divers', type: 'vf', texte: 'Au Défi CHU, le classement se fait au nombre de bonnes réponses.', bonne: 'faux', explication: 'Au % de bonnes réponses : les petits services ont autant de chances que les grands.', source: 'Démo', statut: 'validée' }],
      scores: {}, vus: {}
    });
  }
  function demoDefi(action, d) {
    var B = demoDefiBase(), aujourd = new Date().toISOString().slice(0, 10);
    function sauver() { demoEcrire('defi', B); }
    function valide(q) { return q.texte && (q.type !== 'qcm' || (q.choix.length >= 2 && q.bonne >= 0 && q.bonne < q.choix.length)) && (q.type !== 'ascenseur' || (q.bonne.entree && q.bonne.niveau !== '')); }
    function etat() { return { ok: true, mode: B.mode, debut: B.debut, questions: B.questions.map(function (q) { return Object.assign({ valide: !!valide(q), par: 'Démo', modifie: '' }, q); }), site: B.site, niveaux: ['-1', '0', '1', '2', '3', '4'], lienSheets: '' }; }
    function pool() { return B.questions.filter(function (q) { return valide(q) && (q.statut === 'validée' || (B.mode === 'test' && q.statut === 'à valider')); }); }
    function lib(e) { return /^B/.test(e) ? e : 'N° ' + e; }
    function jourQ() {
      var p = pool().slice(0, 5);
      return p.map(function (q) { var x = { id: q.id, type: q.type, theme: q.theme, texte: q.texte }; if (q.type === 'qcm') x.choix = q.choix;
        if (q.type === 'ascenseur') { x.entrees = ['2', '5', '8', 'B3'].concat(q.bonne.entree).filter(function (v, i, t) { return t.indexOf(v) === i; }).slice(-4).map(function (e) { return { code: e, libelle: lib(e) }; }); x.niveaux = ['-1', '0', '1', '2', '3', '4']; }
        return x; });
    }
    var gestion = /^cap\./.test(d.jeton || '') || /^demo\.admin/.test(d.jeton || '');
    if (/^defi_(gestion|mode|question|statut|site|importer)$/.test(action) && !gestion) throw new ErreurApi('non_autorise');
    if (!/^(cap|demo)\./.test(d.jeton || '')) throw new ErreurApi('session_invalide');
    switch (action) {
      case 'defi_jour': return { ok: true, date: aujourd, mode: B.mode, questions: jourQ(), seuil: 30 };
      case 'defi_repondre': {
        var x = d.donnees || {}, q = B.questions.filter(function (y) { return y.id === x.id; })[0]; if (!q) throw new ErreurApi('defi_perime');
        var bon = q.type === 'qcm' ? Number(x.reponse) === q.bonne : q.type === 'vf' ? x.reponse === q.bonne : x.reponse && x.reponse.entree === q.bonne.entree && x.reponse.niveau === q.bonne.niveau;
        var cle = aujourd + '|' + q.id, compte = !B.vus[cle];
        if (compte) { B.vus[cle] = 1; var sc = B.scores[B.mode] = B.scores[B.mode] || [0, 0]; sc[0]++; if (bon) sc[1]++; sauver(); }
        return { ok: true, bon: !!bon, compte: compte, bonne: q.type === 'ascenseur' ? { entree: q.bonne.entree, libelle: lib(q.bonne.entree), niveau: q.bonne.niveau } : q.bonne, explication: q.explication };
      }
      case 'defi_classement': {
        var moi = B.scores[B.mode] || [0, 0], nom = (SERVICE && SERVICE.nom) || 'Réanimation – USC';
        var autres = B.mode === 'test' ? [['Cardiologie', 64, 51], ['Néonatalogie', 38, 33], ['Pédiatrie', 45, 31], ['Pharmacie', 12, 11]] : [];
        function lignes(f) {
          var l = autres.map(function (a) { return { nom: a[0], vous: false, reponses: Math.round(a[1] * f), pourcent: Math.round(1000 * a[2] / a[1]) / 10 }; })
            .concat(moi[0] || f > 1 ? [{ nom: nom, vous: true, reponses: moi[0], pourcent: moi[0] ? Math.round(1000 * moi[1] / moi[0]) / 10 : 0 }] : []);
          l.forEach(function (x) { x.classe = x.reponses >= 30; });
          l.sort(function (a, b) { return (b.classe - a.classe) || (b.pourcent - a.pourcent) || (b.reponses - a.reponses); });
          var r = 0; l.forEach(function (x) { x.rang = x.classe ? ++r : null; }); return l;
        }
        var lu = new Date(); lu.setDate(lu.getDate() - (lu.getDay() + 6) % 7); var luIso = lu.toISOString().slice(0, 10), av = new Date(lu); av.setDate(av.getDate() - 7);
        return { ok: true, mode: B.mode, seuil: 30, semaine: { lundi: luIso, lignes: lignes(1) }, precedente: { lundi: av.toISOString().slice(0, 10), lignes: lignes(0.9).filter(function (x) { return !x.vous; }) }, general: lignes(3), debut: B.debut };
      }
      case 'defi_parcours': return { ok: true, mode: B.mode, site: B.site, niveaux: ['-1', '0', '1', '2', '3', '4'],
        missions: pool().filter(function (q) { return q.type === 'ascenseur'; }).map(function (q) { return { id: q.id, destination: q.texte.replace(/^Prenez l'ascenseur\s*:\s*/i, '').replace(/\.$/, ''), entree: q.bonne.entree, niveau: q.bonne.niveau, explication: q.explication }; }) };
      case 'defi_gestion': return etat();
      case 'defi_mode': if (d.mode === 'officiel' && B.mode !== 'officiel') { B.debut = aujourd; B.scores.officiel = [0, 0]; } B.mode = d.mode === 'officiel' ? 'officiel' : 'test'; sauver(); return etat();
      case 'defi_statut': B.questions.forEach(function (q) { if ((d.ids || []).indexOf(q.id) >= 0) q.statut = d.statut; }); sauver(); return etat();
      case 'defi_question': {
        var n = Object.assign({}, d.donnees); if (!valide(n)) throw new ErreurApi('question_invalide');
        if (d.id) B.questions = B.questions.map(function (q) { return q.id === d.id ? Object.assign(n, { id: d.id }) : q; });
        else { n.id = 'X' + String(B.questions.length + 1).padStart(2, '0'); B.questions.push(n); }
        sauver(); return etat();
      }
      case 'defi_site': B.site = d.site; sauver(); return etat();
      case 'defi_raz': B.scores[B.mode] = [0, 0]; B.vus = {}; if (B.mode === 'officiel') B.debut = aujourd; sauver(); return etat();
      case 'defi_importer': {
        var aj = 0, ign = 0, ids = {}; B.questions.forEach(function (q) { ids[q.id] = 1; });
        (d.donnees.questions || []).forEach(function (q) { if (ids[q.id] || !valide(q)) { ign++; return; } ids[q.id] = 1; B.questions.push(Object.assign({}, q, { statut: q.statut || 'à valider' })); aj++; });
        var siteOk = !!(d.donnees.site && d.donnees.remplacerSite); if (siteOk) B.site = d.donnees.site; sauver();
        var r = etat(); r.import = { ajoutees: aj, ignorees: ign, site: siteOk }; return r;
      }
    }
    throw new ErreurApi('action_inconnue');
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

  /* Démonstration des lots 2 et 5 : personnalisation, actualités, documents, import du plan (tout reste sur ce téléphone) */
  function demoAccueilPlus(o) {
    var g = demoLire('reglages', {}), a = demoLire('actus', null);
    if (g.nom) o.service = g.nom; if (g.message != null) o.messageAccueil = g.message; if (g.dateJ) o.dateJ = g.dateJ;
    o.rubriques = g.rubriques && g.rubriques.length < 6 ? g.rubriques : null; if (SERVICE && SERVICE.id === '_chu') { o.rubriques = ['newsletter', 'docs']; o.service = 'Contenus communs du CHU'; } o.logo = g.logo ? String(g.logoV || 1) : null;
    if (a) o.actualites = a.filter(function (x) { return x.publiee; }).map(function (x) { return { date: x.date, titre: x.titre, texte: x.texte, epinglee: x.epinglee }; });
    o.actualites = [{ date: '', titre: 'Exemple d\'actualité commune au CHU', texte: 'Publiée une fois par les créateurs, visible dans tous les services.', epinglee: false, chu: true }].concat(o.actualites || []);
    return o;
  }
  function demoLots(action, d) {
    var ref = /^demo\.(referent|admin)/.test(d.jeton || ''), admin = /^demo\.admin/.test(d.jeton || '') || /^cap\./.test(d.jeton || '');
    if (/^cap\./.test(d.jeton || '')) {
      if (action === 'commun_jeton') return { ok: true, service: { id: '_chu', nom: 'Contenus communs du CHU' }, jeton: 'demo.admin', role: 'admin', libelle: 'Créateur démo', expiration: new Date(Date.now() + 864e5).toISOString() };
      if (action === 'tableau_bord') return { ok: true, mode: 'test', seuil: 30, calcule: new Date().toISOString(), services: demoServices().map(function (x, i) { return { nom: x.nom, actif: x.actif, cree: x.cree, plan: i !== 2, rubriques: i ? 'plan, jeux, docs' : 'toutes', referents: Math.max(0, 3 - i), defi: i === 2 ? null : { reponses: 40 - 12 * i, pourcent: 78 - 6 * i } }; }) };
    }
    if (!/^demo\./.test(d.jeton || '')) throw new ErreurApi('session_invalide');
    var defActus = [{ date: '2026-11-01', titre: 'Bienvenue dans l\'application', texte: 'Retrouvez ici toutes les informations pour préparer le déménagement.', publiee: true, epinglee: true }];
    switch (action) {
      case 'actu_liste': case 'actu_enregistrer': case 'actu_supprimer': {
        if (!ref) throw new ErreurApi('non_autorise');
        var l = demoLire('actus', defActus);
        if (action === 'actu_enregistrer') { var x = d.donnees || {}, y = { date: x.date || new Date().toISOString().slice(0, 10), titre: x.titre, texte: x.texte || '', publiee: x.publiee !== false, epinglee: !!x.epinglee };
          if (x.ligne) l[x.ligne - 2] = y; else l.push(y); }
        if (action === 'actu_supprimer') l.splice(d.ligne - 2, 1);
        l.forEach(function (q) { delete q.ligne; }); demoEcrire('actus', l);
        return { ok: true, actualites: l.map(function (q, i) { return Object.assign({ ligne: i + 2 }, q); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }) };
      }
      case 'docs_liste': case 'docs_enregistrer': case 'docs_supprimer': {
        var ld = demoLire('docs', [{ id: 'DOCdemo1', categorie: 'FAQ', titre: 'Où trouver le plan du service ?', texte: 'Dans la rubrique « Plan du service » de l\'appli.', lien: '', publie: true }]);
        if (action !== 'docs_liste' && !ref) throw new ErreurApi('non_autorise');
        if (action === 'docs_enregistrer') { var z = d.donnees || {}; if (z.lien && !/^https:\/\//.test(z.lien)) throw new ErreurApi('lien_invalide');
          var nv = { id: d.id || 'DOC' + Math.random().toString(36).slice(2, 8), categorie: z.categorie || 'Divers', titre: z.titre, texte: z.texte || '', lien: z.lien || '', ordre: Number(z.ordre) || 0, publie: z.publie !== false };
          ld = ld.filter(function (q) { return q.id !== d.id; }); ld.push(nv); }
        if (action === 'docs_supprimer') ld = ld.filter(function (q) { return q.id !== d.id; });
        demoEcrire('docs', ld);
        var communs = [{ id: 'chu1', categorie: 'Accès au site', titre: 'Plan d\'accès (exemple commun au CHU)', texte: 'Document publié par les créateurs pour tous les services.', lien: '', publie: true, chu: true }];
        return { ok: true, documents: communs.concat(ld.filter(function (q) { return q.publie || ref; })), peutModifier: ref };
      }
      case 'service_reglages': {
        if (!admin) throw new ErreurApi('non_autorise');
        var g = demoLire('reglages', {}), x2 = d.donnees;
        if (x2) { ['nom', 'message', 'dateJ', 'rubriques'].forEach(function (k) { if (x2[k] != null) g[k] = x2[k]; }); if (x2.logo === null) g.logo = null; demoEcrire('reglages', g); }
        return { ok: true, reglages: { nom: g.nom || (SERVICE && SERVICE.nom) || 'Réanimation – USC', message: g.message != null ? g.message : 'Bienvenue ! Préparons ensemble notre installation dans le nouveau CHU.', dateJ: g.dateJ || '', rubriques: g.rubriques || ['plan', 'visites', 'newsletter', 'souvenirs', 'jeux', 'docs'], logo: !!g.logo, plan: true }, toutes: ['plan', 'visites', 'newsletter', 'souvenirs', 'jeux', 'docs'] };
      }
      case 'logo_envoyer': { if (!admin) throw new ErreurApi('non_autorise'); var gl = demoLire('reglages', {}); gl.logo = { type: d.type, data: d.data }; gl.logoV = Date.now(); demoEcrire('reglages', gl); return { ok: true, version: String(gl.logoV) }; }
      case 'logo': { var gg = demoLire('reglages', {}); return gg.logo ? { ok: true, type: gg.logo.type, data: gg.logo.data, version: String(gg.logoV) } : { ok: true, data: null }; }
      case 'plan_importer': {
        if (!admin) throw new ErreurApi('non_autorise');
        var P; try { P = JSON.parse(d.texte); } catch (e) { return { ok: true, enregistre: false, rapport: { erreurs: ['Fichier illisible : ce n\'est pas du JSON valide.'], avertissements: [], stats: {} } }; }
        var er = [], n = Array.isArray(P.pieces) ? P.pieces.length : 0;
        if (!Array.isArray(P.viewBox) || P.viewBox.length !== 4) er.push('« viewBox » manquant ou incorrect : 4 nombres [x, y, largeur, hauteur] attendus.');
        if (!n) er.push('Aucune pièce (« pieces ») dans le fichier.');
        var rap = { erreurs: er, avertissements: ['Démonstration : contrôle simplifié (le moteur réel vérifie aussi les doublons, chevauchements et unités).'], stats: { pieces: n, chambres: n ? P.pieces.filter(function (p) { return p.type === 'chambre'; }).length : 0, unites: Object.keys(P.unites || {}).length } };
        if (d.enregistrer && !er.length) { demoEcrire('plan-importe', P); return { ok: true, rapport: rap, enregistre: true }; }
        return { ok: true, rapport: rap, enregistre: false };
      }
    }
    throw new ErreurApi('action_inconnue');
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

  window.ReaApi = { appeler: appeler, demo: DEMO, ErreurApi: ErreurApi, multi: MULTI, choisirService: choisirService, service: function () { return SERVICE; }, externes: (cfg.SERVICES_EXTERNES || []).filter(function (s) { return s && s.id && s.nom && s.api; }) };
})();
