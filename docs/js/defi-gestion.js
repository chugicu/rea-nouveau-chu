/* Défi CHU · gestion (super-administrateur et admins créateurs ; l'administrateur quand le service est seul).
   Phase de test / ouverture officielle, validation des questions, ajout et modification, import d'un fichier,
   éditeur de la vue du ciel (codes B, couleurs, N° de la rue Caraïbes, positions par glisser). */
(function () {
  'use strict';
  var A, h, Api, O;
  var THEMES = { chiffres: 'Chiffres clés', histoire: 'Histoire', rue: 'Rue Caraïbes', ascenseur: 'Missions du Parcours', ou: 'Où est… ?', voisins: 'Voisins', services: 'Services et lits', plateau: 'Plateau technique', consultations: 'Consultations', calendrier: 'Transfert : calendrier', etiquetage: 'Transfert : trier et étiqueter', cartons: 'Transfert : cartons et mobilier', regles: 'Transfert : règles à retenir', jourj: 'Transfert : jour J et rôles', divers: 'Divers' };
  var STATUTS = { 'à valider': 'À valider', 'validée': 'Validée', 'retirée': 'Retirée' };
  var CTX = null; // { jeton, retour, role, etat, filtre, nb }

  function init() { A = window.ReaApp; h = A.h; Api = window.ReaApi; O = window.ReaDefi._outils; }
  function appeler(action, d) { return Api.appeler(action, Object.assign({ jeton: CTX.jeton }, d || {})); }
  function page(contenu) {
    A.afficher(h('div', { class: 'page page--large defi defi-gestion' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { CTX.retour(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: 'Gestion du Défi CHU' }),
        h('span', { class: 'entete__role', text: CTX.role || '' })),
      contenu));
  }
  function erreur(e) {
    if (e && A.ERREURS_SESSION.indexOf(e.code) >= 0) return CTX.retour(A.message(e.code));
    return e && e.code === 'question_invalide' ? 'Question incomplète : texte, au moins 2 réponses et la bonne réponse (ou l\'entrée et le niveau).' : A.message(e && e.code);
  }

  /** o : { jeton, retour(message?), role } */
  function ouvrir(o) {
    init(); A.definirEcran(null);
    CTX = { jeton: o.jeton, retour: o.retour, role: o.role, filtre: CTX && CTX.filtre || { statut: 'à valider', theme: '', texte: '' }, nb: 20 };
    page(h('div', { class: 'squelette', style: 'height:300px;margin-top:16px' }));
    appeler('defi_gestion').then(function (e) { CTX.etat = e; dessiner(); }).catch(function (e) { var m = erreur(e); if (m) page(h('div', null, h('p', { class: 'vide', text: m }), h('button', { class: 'bouton', type: 'button', onclick: function () { ouvrir(o); }, text: 'Réessayer' }))); });
  }
  function apres(promesse, flash) {
    return promesse.then(function (e) { CTX.etat = e; dessiner(flash || null); return e; }).catch(function (e) { var m = erreur(e); if (m) dessiner(null, m); });
  }

  function dessiner(flash, alerte) {
    var e = CTX.etat, scroll = window.scrollY;
    page(h('div', null,
      flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
      alerte ? h('p', { class: 'message-erreur', role: 'alert', text: alerte }) : null,
      sectionPhase(e), sectionParcours(e), sectionQuestions(e), sectionEditeur(e), sectionImport(),
      e.lienSheets ? h('p', { class: 'section__note' }, 'Tout est aussi modifiable dans le ', h('a', { href: e.lienSheets, target: '_blank', rel: 'noopener', text: 'Google Sheets de l\'annuaire' }), ' (onglets « Défi – … »). Les changements y sont pris en compte en 5 minutes.') :
        h('p', { class: 'section__note', text: 'Tout est aussi modifiable dans le Google Sheets « Base » (onglets « Défi – … ») ; les changements y sont pris en compte en 5 minutes.' })));
    window.scrollTo(0, scroll);
  }

  /* ---------- Phase de test / ouverture officielle ---------- */
  function sectionPhase(e) {
    var test = e.mode === 'test', n = compter(e.questions);
    return h('section', { class: 'section' },
      h('div', { class: 'section__tete' }, h('h2', { text: test ? '🧪 Phase de test' : '✅ Défi ouvert officiellement' }), e.debut ? h('span', { class: 'section__note', text: 'depuis le ' + e.debut.split('-').reverse().join('/') }) : null),
      h('p', { class: 'section__note', text: test
        ? 'Les questions à valider et validées sont jouées ; les retirées jamais. Les scores servent seulement à tester : le classement repartira de zéro à l\'ouverture.'
        : 'Seules les questions validées sont jouées (' + n['validée'] + ' aujourd\'hui). Le classement compte depuis l\'ouverture.' }),
      h('button', { type: 'button', class: test ? 'bouton' : 'bouton bouton--discret', onclick: function (ev) {
        if (test && !n['validée']) return alert('Validez d\'abord quelques questions : en mode officiel, seules les questions validées sont jouées.');
        if (!confirm(test ? 'Ouvrir officiellement le Défi CHU ?\n\nSeules les ' + n['validée'] + ' questions validées seront jouées et le classement repartira de zéro.' : 'Revenir en phase de test ?\n\nLes questions à valider seront de nouveau jouées et les scores ne compteront plus pour le classement officiel.')) return;
        ev.currentTarget.disabled = true;
        apres(appeler('defi_mode', { mode: test ? 'officiel' : 'test' }), test ? 'Défi ouvert officiellement : bonne chance à tous les services !' : 'Retour en phase de test.');
      }, text: test ? 'Ouvrir officiellement le Défi' : 'Revenir en phase de test' }),
      h('button', { type: 'button', class: 'bouton bouton--discret bouton--danger', onclick: function (ev) {
        if (!confirm('Remettre à zéro les scores du Défi' + (test ? ' (phase de test)' : '') + ' pour tous les services ?\n\nLe classement de la semaine et le classement général repartent de zéro. Les questions ne changent pas.')) return;
        ev.currentTarget.disabled = true;
        apres(appeler('defi_raz'), 'Scores du Défi remis à zéro.');
      }, text: 'Remettre les scores à zéro' }));
  }
  /* ---------- Jeu Parcours séparé (les 2 missions du Défi du jour sont jouées dans tous les cas) ---------- */
  function sectionParcours(e) {
    var actif = !!e.parcours;
    return h('section', { class: 'section' },
      h('div', { class: 'section__tete' }, h('h2', { text: '🧭 Jeu Parcours : ' + (actif ? 'activé' : 'désactivé') })),
      h('p', { class: 'section__note', text: (actif ? 'Tous les agents voient le bouton « Parcours » dans le Défi CHU.' : 'Le bouton « Parcours » est caché pour tous les services.')
        + ' Les 2 missions du Défi du jour sont jouées dans tous les cas.' }),
      h('button', { type: 'button', class: actif ? 'bouton bouton--discret' : 'bouton', onclick: function (ev) {
        ev.currentTarget.disabled = true;
        apres(appeler('defi_parcours_actif', { actif: !actif }), actif ? 'Jeu Parcours désactivé.' : 'Jeu Parcours activé pour tous les services.');
      }, text: actif ? 'Désactiver le jeu Parcours' : 'Activer le jeu Parcours' }));
  }
  function compter(qs) { var n = { 'à valider': 0, 'validée': 0, 'retirée': 0 }; qs.forEach(function (q) { n[q.statut]++; }); return n; }

  /* ---------- Questions ---------- */
  function texteBonne(q) {
    if (q.type === 'qcm') return q.choix[q.bonne];
    if (q.type === 'vf') return q.bonne === 'vrai' ? 'Vrai' : 'Faux';
    return O.libelleEntree(q.bonne.entree) + ' · niveau ' + q.bonne.niveau;
  }
  function filtrer(qs) {
    var f = CTX.filtre, t = f.texte.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return qs.filter(function (q) {
      if (f.statut && q.statut !== f.statut) return false;
      if (f.theme && q.theme !== f.theme) return false;
      if (t && (q.id + ' ' + q.texte + ' ' + (q.choix || []).join(' ') + ' ' + q.explication).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(t) < 0) return false;
      return true;
    });
  }
  function sectionQuestions(e) {
    var n = compter(e.questions), liste = filtrer(e.questions), f = CTX.filtre;
    var themes = {}; e.questions.forEach(function (q) { themes[q.theme] = 1; });
    function sel(options, valeur, change, label) {
      return h('select', { 'aria-label': label, onchange: function (ev) { change(ev.target.value); CTX.nb = 20; dessiner(); } },
        options.map(function (o) { var x = h('option', { value: o[0], text: o[1] }); if (o[0] === valeur) x.selected = true; return x; }));
    }
    var recherche = h('input', { type: 'search', placeholder: 'Chercher (mot, ID…)', value: f.texte, 'aria-label': 'Chercher une question' });
    var minuterie; recherche.addEventListener('input', function () { clearTimeout(minuterie); minuterie = setTimeout(function () { f.texte = recherche.value; CTX.nb = 20; dessiner(); var r = document.querySelector('.defi-gestion input[type=search]'); if (r) { r.focus(); r.setSelectionRange(r.value.length, r.value.length); } }, 350); });
    var visibles = liste.slice(0, CTX.nb);
    return h('section', { class: 'section' },
      h('div', { class: 'section__tete' }, h('h2', { text: 'Questions (' + e.questions.length + ')' }),
        h('span', { class: 'section__note', text: n['à valider'] + ' à valider · ' + n['validée'] + ' validées · ' + n['retirée'] + ' retirées' })),
      h('div', { class: 'defi-filtres' },
        sel([['', 'Tous les statuts'], ['à valider', 'À valider (' + n['à valider'] + ')'], ['validée', 'Validées (' + n['validée'] + ')'], ['retirée', 'Retirées (' + n['retirée'] + ')']], f.statut, function (v) { f.statut = v; }, 'Statut'),
        sel([['', 'Tous les thèmes']].concat(Object.keys(themes).sort().map(function (t) { return [t, THEMES[t] || t]; })), f.theme, function (v) { f.theme = v; }, 'Thème'),
        recherche),
      liste.length > 1 && f.statut === 'à valider' ? h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () {
        if (confirm('Valider les ' + liste.length + ' questions affichées ?\n\nRelisez-les avant : elles seront jouées dès l\'ouverture officielle.')) apres(appeler('defi_statut', { ids: liste.map(function (q) { return q.id; }), statut: 'validée' }), liste.length + ' questions validées.');
      }, text: '✓ Valider les ' + liste.length + ' affichées' }) : null,
      liste.length ? h('ul', { class: 'defi-questions' }, visibles.map(carteQuestion)) : h('p', { class: 'vide', text: 'Aucune question pour ce filtre.' }),
      liste.length > visibles.length ? h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { CTX.nb += 30; dessiner(); }, text: 'Afficher plus (' + (liste.length - visibles.length) + ' restantes)' }) : null,
      formulaire(null));
  }
  function carteQuestion(q) {
    var li = h('li', { class: 'defi-q defi-q--' + (q.statut === 'validée' ? 'ok' : q.statut === 'retirée' ? 'off' : 'attente') });
    function statut(s, libelle) { return h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function (ev) { ev.currentTarget.disabled = true; apres(appeler('defi_statut', { ids: [q.id], statut: s }), q.id + ' : ' + STATUTS[s].toLowerCase() + '.'); }, text: libelle }); }
    var reponses = q.type === 'qcm' ? h('ol', { class: 'defi-q__choix' }, q.choix.map(function (c, k) { return h('li', { class: k === q.bonne ? 'defi-q__bonne' : '', text: c + (k === q.bonne ? '  ✓' : '') }); }))
      : h('p', { class: 'defi-q__bonne', text: 'Réponse : ' + texteBonne(q) + ' ✓' });
    li.appendChild(h('div', { class: 'defi-q__tete' }, h('b', { text: q.id }), h('span', { text: (THEMES[q.theme] || q.theme) + ' · ' + (q.type === 'vf' ? 'vrai/faux' : q.type) }), h('span', { class: 'etiquette', text: STATUTS[q.statut] })));
    li.appendChild(h('p', { class: 'defi-q__texte', text: q.texte }));
    li.appendChild(reponses);
    if (q.explication) li.appendChild(h('p', { class: 'section__note', text: '💡 ' + q.explication }));
    li.appendChild(h('p', { class: 'section__note', text: (q.source ? 'Source : ' + q.source : 'Sans source') + (q.par ? ' · ' + q.par : '') + (q.modifie ? ' · ' + q.modifie : '') + (q.valide ? '' : ' · ⚠ incomplète : elle ne sera pas jouée') }));
    li.appendChild(h('div', { class: 'gps-boutons' },
      q.statut !== 'validée' ? statut('validée', '✓ Valider') : null,
      q.statut !== 'à valider' ? statut('à valider', 'Remettre à valider') : null,
      q.statut !== 'retirée' ? statut('retirée', 'Retirer') : null,
      h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { li.replaceChildren(formulaire(q, true)); }, text: 'Modifier' })));
    return li;
  }
  function formulaire(q, ouvert) {
    var e = CTX.etat, type = h('select', { 'aria-label': 'Type' }, [['qcm', 'Choix multiple'], ['vf', 'Vrai ou faux'], ['ascenseur', 'Mission du Parcours (entrée + niveau)']].map(function (o) { var x = h('option', { value: o[0], text: o[1] }); if (q && q.type === o[0]) x.selected = true; return x; }));
    var theme = h('select', { 'aria-label': 'Thème' }, Object.keys(THEMES).map(function (t) { var x = h('option', { value: t, text: THEMES[t] }); if ((q ? q.theme : 'divers') === t) x.selected = true; return x; }));
    var texte = h('textarea', { rows: '2', maxlength: '300', required: true }); texte.value = q ? q.texte : '';
    var choix = h('textarea', { rows: '4', maxlength: '600', placeholder: 'Une réponse par ligne (2 à 6)' }); choix.value = q && q.type === 'qcm' ? q.choix.join('\n') : '';
    var bonne = h('input', { type: 'number', min: '1', max: '6', value: q && q.type === 'qcm' ? String(q.bonne + 1) : '1' });
    var vf = h('select', null, h('option', { value: 'vrai', text: 'Vrai' }), h('option', { value: 'faux', text: 'Faux' })); if (q && q.type === 'vf') vf.value = q.bonne;
    var entrees = {}; e.site.entrees.forEach(function (x) { entrees[x.code] = 1; }); e.site.batiments.forEach(function (x) { entrees[x.code] = 1; });
    var entree = h('input', { type: 'text', maxlength: '10', list: 'defi-entrees', placeholder: 'ex. 17 ou B50', value: q && q.type === 'ascenseur' ? q.bonne.entree : '' });
    var liste = h('datalist', { id: 'defi-entrees' }, Object.keys(entrees).map(function (c) { return h('option', { value: c }); }));
    var niveau = h('select', { 'aria-label': 'Niveau' }, e.niveaux.map(function (n) { var x = h('option', { value: n, text: n + (n === '0' ? ' (rue Caraïbes)' : '') }); if (q && q.type === 'ascenseur' && q.bonne.niveau === n) x.selected = true; return x; }));
    var expl = h('textarea', { rows: '2', maxlength: '500' }); expl.value = q ? q.explication : '';
    var source = h('input', { type: 'text', maxlength: '100', value: q ? q.source || '' : '' });
    var statut = h('select', { 'aria-label': 'Statut' }, Object.keys(STATUTS).map(function (s) { var x = h('option', { value: s, text: STATUTS[s] }); if ((q ? q.statut : 'à valider') === s) x.selected = true; return x; }));
    var err = h('p', { class: 'message-erreur', role: 'alert' });
    var blocQcm = h('div', null, h('div', { class: 'champ' }, h('label', { text: 'Réponses' }), choix), h('div', { class: 'champ' }, h('label', { text: 'N° de la bonne réponse' }), bonne));
    var blocVf = h('div', { class: 'champ' }, h('label', { text: 'Bonne réponse' }), vf);
    var blocAsc = h('div', { class: 'grille-2' }, h('div', { class: 'champ' }, h('label', { text: 'Entrée (N°) ou bâtiment (B…)' }), entree, liste), h('div', { class: 'champ' }, h('label', { text: 'Niveau' }), niveau));
    function maj() { blocQcm.hidden = type.value !== 'qcm'; blocVf.hidden = type.value !== 'vf'; blocAsc.hidden = type.value !== 'ascenseur'; }
    type.addEventListener('change', maj); maj();
    var form = h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); err.textContent = '';
      var d = { type: type.value, theme: theme.value, texte: texte.value, explication: expl.value, source: source.value, statut: statut.value };
      if (d.type === 'qcm') { d.choix = choix.value.split('\n').map(function (x) { return x.trim(); }).filter(String); d.bonne = Number(bonne.value) - 1; }
      else if (d.type === 'vf') d.bonne = vf.value;
      else d.bonne = { entree: entree.value.trim(), niveau: niveau.value };
      var b = form.querySelector('[type=submit]'); b.disabled = true;
      appeler('defi_question', { id: q ? q.id : null, donnees: d }).then(function (x) { CTX.etat = x; dessiner(q ? q.id + ' modifiée.' : 'Question ajoutée.'); })
        .catch(function (x) { b.disabled = false; err.textContent = erreur(x) || ''; });
    } },
      h('div', { class: 'grille-2' }, h('div', { class: 'champ' }, h('label', { text: 'Type' }), type), h('div', { class: 'champ' }, h('label', { text: 'Thème' }), theme)),
      h('div', { class: 'champ' }, h('label', { text: 'Question' }), texte), blocQcm, blocVf, blocAsc,
      h('div', { class: 'champ' }, h('label', { text: 'Explication (montrée après la réponse)' }), expl),
      h('div', { class: 'grille-2' }, h('div', { class: 'champ' }, h('label', { text: 'Source' }), source), h('div', { class: 'champ' }, h('label', { text: 'Statut' }), statut)),
      err, h('div', { class: 'gps-boutons' }, h('button', { class: 'bouton', type: 'submit', text: q ? 'Enregistrer' : 'Ajouter la question' }),
        q ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { dessiner(); }, text: 'Annuler' }) : null));
    if (ouvert) return form;
    return h('details', { class: 'defi-ajout' }, h('summary', { text: '+ Ajouter une question' }), form);
  }

  /* ---------- Import d'un fichier (banque de questions préparée hors de l'appli) ---------- */
  function sectionImport() {
    var fichier = h('input', { type: 'file', accept: '.json,application/json' }), rempl = h('input', { type: 'checkbox' }), err = h('p', { class: 'message-erreur', role: 'alert' });
    return h('details', { class: 'section defi-ajout' }, h('summary', { text: 'Importer un fichier de questions' }),
      h('p', { class: 'section__note', text: 'Fichier .json fourni avec Cap NCHUG (jamais publié sur GitHub). Les questions sont ajoutées « à valider » ; celles qui existent déjà (même ID) ne sont pas touchées.' }),
      fichier, h('label', { class: 'case' }, rempl, ' Remplacer aussi la vue du ciel par celle du fichier'), err,
      h('button', { type: 'button', class: 'bouton', onclick: function (ev) {
        var f = fichier.files && fichier.files[0]; if (!f) { err.textContent = 'Choisissez un fichier.'; return; }
        var b = ev.currentTarget; b.disabled = true; err.textContent = '';
        f.text().then(function (t) {
          var d = JSON.parse(t); if (!d || !Array.isArray(d.questions)) throw new Error('format');
          (d.questions || []).forEach(function (q) { q.statut = q.statut || 'à valider'; });
          return appeler('defi_importer', { donnees: { questions: d.questions, site: d.site || null, remplacerSite: rempl.checked } });
        }).then(function (r) {
          CTX.etat = r; CTX.filtre.statut = 'à valider';
          dessiner(r.import.ajoutees + ' question(s) ajoutée(s)' + (r.import.ignorees ? ', ' + r.import.ignorees + ' ignorée(s) (déjà présentes ou incomplètes)' : '') + (r.import.site ? ' ; vue du ciel importée.' : '.'));
        }).catch(function (x) { b.disabled = false; err.textContent = x && x.code ? erreur(x) : 'Fichier illisible : il doit s\'agir du fichier .json de la banque de questions.'; });
      }, text: 'Importer' }));
  }

  /* ---------- Éditeur de la vue du ciel ---------- */
  function sectionEditeur(e) {
    var site = JSON.parse(JSON.stringify(e.site)), choix = null, modifie = false;
    var zone = h('div', { class: 'defi-carte-ciel defi-editeur__carte' }), panneau = h('div', { class: 'defi-editeur__panneau' }), etat = h('p', { class: 'section__note', 'aria-live': 'polite' });
    var enregistrer = h('button', { type: 'button', class: 'bouton', disabled: true, onclick: function () {
      enregistrer.disabled = true; enregistrer.textContent = 'Enregistrement…';
      apres(appeler('defi_site', { site: site }), 'Vue du ciel enregistrée : le Parcours et les questions l\'utilisent tout de suite.');
    }, text: 'Enregistrer la vue du ciel' });
    function change() { modifie = true; enregistrer.disabled = false; etat.textContent = 'Modifications non enregistrées.'; }
    function liste(type) { return type === 'batiment' ? site.batiments : type === 'entree' ? site.entrees : site.parkings; }
    function redessiner() {
      var svg = window.ReaDefi._dessinerSite(site, {});
      if (choix) { var x = liste(choix.type)[choix.i]; if (x) { var g = svg.querySelector('[data-type="' + choix.type + '"][data-i="' + choix.i + '"]'); if (g) g.classList.add('defi-choisi'); } }
      brancher(svg); zone.replaceChildren(svg); dessinerPanneau();
    }
    function point(svg, ev) { var p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
    function brancher(svg) {
      var glisse = null;
      svg.addEventListener('pointerdown', function (ev) {
        var g = ev.target.closest('[data-type]'); if (!g) { choix = null; return redessiner(); }
        var type = g.getAttribute('data-type'), i = Number(g.getAttribute('data-i')), x = liste(type)[i], p = point(svg, ev);
        choix = { type: type, i: i }; glisse = { g: g, x: x, dx: p.x - x.x, dy: p.y - x.y, bouge: false };
        svg.querySelectorAll('.defi-choisi').forEach(function (y) { y.classList.remove('defi-choisi'); }); g.classList.add('defi-choisi');
        try { svg.setPointerCapture(ev.pointerId); } catch (er) { /* ignoré */ }
        ev.preventDefault(); dessinerPanneau();
      });
      svg.addEventListener('pointermove', function (ev) {
        if (!glisse) return; var p = point(svg, ev), nx = Math.round(p.x - glisse.dx), ny = Math.round(p.y - glisse.dy);
        if (!glisse.bouge && Math.abs(nx - glisse.x.x) + Math.abs(ny - glisse.x.y) < 3) return;
        glisse.bouge = true; glisse.g.setAttribute('transform', 'translate(' + (nx - glisse.x.x) + ' ' + (ny - glisse.x.y) + ')'); glisse.nx = nx; glisse.ny = ny;
      });
      function lacher() { if (!glisse) return; if (glisse.bouge) { glisse.x.x = Math.max(0, Math.min(358, glisse.nx)); glisse.x.y = Math.max(0, Math.min(470, glisse.ny)); change(); redessiner(); } glisse = null; }
      svg.addEventListener('pointerup', lacher); svg.addEventListener('pointercancel', lacher);
    }
    function champ(label, input) { return h('div', { class: 'champ' }, h('label', { text: label }), input); }
    function texte(obj, cle, max, apres) { var i = h('input', { type: 'text', maxlength: String(max), value: obj[cle] || '' }); i.addEventListener('change', function () { obj[cle] = apres ? apres(i.value) : i.value.trim(); change(); redessiner(); }); return i; }
    function nombre(obj, cle, min, max) { var i = h('input', { type: 'number', min: String(min), max: String(max), value: String(obj[cle] || 0) }); i.addEventListener('change', function () { obj[cle] = Math.max(min, Math.min(max, Number(i.value) || min)); change(); redessiner(); }); return i; }
    function couleur(obj, aide) {
      var sans = h('input', { type: 'checkbox' }), c = h('input', { type: 'color', value: obj.couleur || '#b9c0cc', 'aria-label': 'Couleur' });
      sans.checked = !obj.couleur; c.disabled = sans.checked;
      c.addEventListener('input', function () { obj.couleur = c.value; change(); redessiner(); });
      sans.addEventListener('change', function () { obj.couleur = sans.checked ? '' : c.value; c.disabled = sans.checked; change(); redessiner(); });
      return h('div', { class: 'champ' }, h('label', { text: 'Couleur' }), h('div', { class: 'defi-couleur' }, c, h('label', { class: 'case' }, sans, ' ' + aide)));
    }
    function dessinerPanneau() {
      if (!choix || !liste(choix.type)[choix.i]) { panneau.replaceChildren(h('p', { class: 'section__note', text: 'Touchez un bâtiment, une entrée (N°) ou un parking pour le modifier ; faites-le glisser pour le déplacer.' })); return; }
      var x = liste(choix.type)[choix.i], f;
      if (choix.type === 'batiment') f = [h('h3', { text: 'Bâtiment ' + x.code }),
        h('div', { class: 'grille-2' }, champ('Code (affiché en grand)', texte(x, 'code', 10, function (v) { var a = x.code; v = v.trim().toUpperCase(); site.entrees.forEach(function (e) { if (e.batiment === a) e.batiment = v; }); return v; })), champ('Nom (facultatif)', texte(x, 'nom', 60))),
        couleur(x, 'sans couleur (gris)'),
        h('div', { class: 'grille-2' }, champ('Largeur', nombre(x, 'l', 20, 300)), champ('Hauteur', nombre(x, 'h', 20, 300)))];
      else if (choix.type === 'entree') f = [h('h3', { text: 'Entrée N° ' + x.code }),
        h('div', { class: 'grille-2' }, champ('N° dans la rue Caraïbes', texte(x, 'code', 10, function (v) { return v.trim().replace(/^N°\s*/i, ''); })),
          champ('Bâtiment desservi', (function () { var s = h('select', null, site.batiments.map(function (b) { var o = h('option', { value: b.code, text: b.code + (b.nom ? ' – ' + b.nom : '') }); if (b.code === x.batiment) o.selected = true; return o; })); s.addEventListener('change', function () { x.batiment = s.value; change(); redessiner(); }); return s; })())),
        couleur(x, 'couleur du bâtiment')];
      else f = [h('h3', { text: x.nom || 'Parking' }), champ('Nom', texte(x, 'nom', 40)),
        h('div', { class: 'grille-2' }, champ('Largeur', nombre(x, 'l', 20, 358)), champ('Hauteur', nombre(x, 'h', 10, 200)))];
      f.push(h('button', { type: 'button', class: 'bouton bouton--discret bouton--danger', onclick: function () {
        if (!confirm('Supprimer cet élément de la vue du ciel ?')) return;
        liste(choix.type).splice(choix.i, 1); choix = null; change(); redessiner();
      }, text: 'Supprimer' }));
      panneau.replaceChildren.apply(panneau, f);
    }
    function ajouter(type) {
      var n = { batiment: { code: 'B' + (site.batiments.length + 1) + '0', nom: '', couleur: '', x: 140, y: 200, l: 80, h: 50 }, entree: { code: '?', batiment: site.batiments[0] ? site.batiments[0].code : '', couleur: '', x: 180, y: 220 }, parking: { code: 'P', nom: 'Parking', couleur: '', x: 120, y: 200, l: 120, h: 36 } }[type];
      if (type === 'entree' && !site.batiments.length) return alert('Ajoutez d\'abord un bâtiment.');
      liste(type).push(n); choix = { type: type, i: liste(type).length - 1 }; change(); redessiner();
    }
    redessiner();
    return h('section', { class: 'section defi-editeur' },
      h('div', { class: 'section__tete' }, h('h2', { text: 'Vue du ciel' }), h('span', { class: 'section__note', text: site.batiments.length + ' bâtiments · ' + site.entrees.length + ' entrées' })),
      h('p', { class: 'section__note', text: 'Elle sert au Parcours (vue du ciel, rue Caraïbes, ascenseur) : chaque entrée de la rue y est rattachée à son bâtiment. Une entrée sans couleur prend celle de son bâtiment.' }),
      zone, panneau,
      h('div', { class: 'gps-boutons' },
        h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { ajouter('batiment'); }, text: '+ Bâtiment' }),
        h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { ajouter('entree'); }, text: '+ Entrée (N°)' }),
        h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { ajouter('parking'); }, text: '+ Parking' })),
      etat, enregistrer);
  }

  window.ReaDefiGestion = { ouvrir: function (o) { ouvrir(o); } };
})();
