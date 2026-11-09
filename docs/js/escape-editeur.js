/* Cap NCHUG · éditeur des missions de l'escape game (référents et administrateur du service).
   Étapes : récit, choix (une bonne réponse), cases à cocher, remise dans l'ordre, toucher sur le plan.
   Une mission enregistrée doit être (re)validée par un référent avant d'être visible des agents. */
(function () {
  'use strict';
  var A, h;
  var TYPES = [['recit', '📖 Récit'], ['choix', '🔘 Choix (une bonne réponse)'], ['multi', '☑️ Cases à cocher'], ['ordre', '↕️ Remettre dans l\'ordre'], ['plan', '🧭 Toucher sur le plan']];
  var CIBLES = [['chambre', 'Une chambre (n°)'], ['section', 'Une section du plan (catégorie)'], ['point', 'Un équipement (type)']];

  function champ(label, el, aide) { return h('div', { class: 'champ' }, h('label', { text: label }), el, aide ? h('small', { class: 'section__note', text: aide }) : null); }
  function texte(v, max, ph) { return h('input', { type: 'text', maxlength: String(max), value: v || '', placeholder: ph || '' }); }
  function zone(v, rows, max, ph) { var t = h('textarea', { rows: String(rows), maxlength: String(max), placeholder: ph || '' }); t.value = v || ''; return t; }
  function lignes(t) { return t.value.split('\n').map(function (x) { return x.trim(); }).filter(String); }

  function ouvrir(o) {
    A = window.ReaApp; h = A.h;
    var sc = JSON.parse(JSON.stringify(o.scenario || { titre: '', ic: '🔓', duree: '5 min', resume: '', etapes: [{ type: 'recit', texte: '' }] }));
    var titre = texte(sc.titre, 80, 'ex. Panne de courant'), ic = texte(sc.ic, 4), duree = texte(sc.duree, 20, 'ex. 6 min'), resume = zone(sc.resume, 3, 400, 'La situation de départ, en deux phrases');
    var liste = h('ol', { class: 'escape-edit__etapes' }), err = h('p', { class: 'message-erreur', role: 'alert' });
    var etapes = sc.etapes.map(function (e) { return { e: e }; });

    function carteEtape(x, i) {
      var e = x.e, corps = h('div', { class: 'escape-edit__corps' });
      var type = h('select', { 'aria-label': 'Type d\'étape' }, TYPES.map(function (t) { var op = h('option', { value: t[0], text: t[1] }); if (t[0] === e.type) op.selected = true; return op; }));
      type.addEventListener('change', function () { lire(); x.e = { type: type.value, question: x.e.question || x.e.texte || '' }; dessiner(); });
      var f = {};
      if (e.type === 'recit') { f.texte = zone(e.texte, 3, 600, 'Ce qui se passe'); corps.appendChild(champ('Texte', f.texte)); }
      else {
        f.question = zone(e.question, 2, 300); corps.appendChild(champ('Question ou consigne', f.question));
        if (e.type === 'choix') {
          f.choix = zone((e.choix || []).join('\n'), 4, 1200, 'Une réponse par ligne (2 à 6)');
          f.bonne = h('input', { type: 'number', min: '1', max: '6', value: String((e.bonne || 0) + 1) });
          corps.appendChild(champ('Réponses', f.choix)); corps.appendChild(champ('N° de la bonne réponse', f.bonne));
        } else if (e.type === 'multi') {
          f.items = zone((e.items || []).map(function (it) { return (it.ok ? '+ ' : '- ') + it.t; }).join('\n'), 5, 2000, '+ ce qu\'il faut cocher\n- ce qu\'il ne faut pas cocher');
          corps.appendChild(champ('Propositions', f.items, 'Une par ligne : « + » devant les bonnes, « - » devant les mauvaises.'));
        } else if (e.type === 'ordre') {
          f.items = zone((e.items || []).join('\n'), 5, 1600, 'Dans le BON ordre, une étape par ligne');
          corps.appendChild(champ('Étapes dans le bon ordre', f.items, 'L\'appli les mélange pour le joueur.'));
        } else if (e.type === 'plan') {
          var c = e.cible || {}, k = c.chambre ? 'chambre' : c.section ? 'section' : 'point';
          f.cible = h('select', null, CIBLES.map(function (t) { var op = h('option', { value: t[0], text: t[1] }); if (t[0] === k) op.selected = true; return op; }));
          f.valeur = texte(c.chambre || c.section || c.point || '', 40, 'ex. 309, pharmacie, chariot');
          f.proche = texte(c.proche || '', 20, 'facultatif : près de la chambre…');
          corps.appendChild(h('div', { class: 'grille-2' }, champ('Ce qu\'il faut toucher', f.cible), champ('Valeur', f.valeur)));
          corps.appendChild(champ('Le plus proche de la chambre (équipement)', f.proche, 'Si l\'élément n\'est pas sur le plan du service, l\'étape est sautée automatiquement.'));
        }
        f.indice = texte(e.indice, 300, 'Montré après une erreur'); f.explication = zone(e.explication, 2, 500, 'Montrée après la bonne réponse');
        corps.appendChild(champ('Indice', f.indice)); corps.appendChild(champ('Explication', f.explication));
      }
      x.lire = function () {
        var y = { type: e.type };
        if (e.type === 'recit') { y.texte = f.texte.value.trim(); return y; }
        y.question = f.question.value.trim(); if (f.indice.value.trim()) y.indice = f.indice.value.trim(); if (f.explication.value.trim()) y.explication = f.explication.value.trim();
        if (e.type === 'choix') { y.choix = lignes(f.choix); y.bonne = Number(f.bonne.value) - 1; }
        if (e.type === 'multi') y.items = lignes(f.items).map(function (l) { return { t: l.replace(/^[+-]\s*/, ''), ok: /^\+/.test(l) }; });
        if (e.type === 'ordre') y.items = lignes(f.items);
        if (e.type === 'plan') { y.cible = {}; y.cible[f.cible.value] = f.valeur.value.trim(); if (f.cible.value === 'point' && f.proche.value.trim()) y.cible.proche = f.proche.value.trim(); }
        return y;
      };
      function bouger(d) { lire(); var j = i + d; var t = etapes[j]; etapes[j] = etapes[i]; etapes[i] = t; dessiner(); }
      return h('li', { class: 'escape-edit__etape' },
        h('div', { class: 'escape-edit__tete' }, h('b', { text: 'Étape ' + (i + 1) }), type,
          h('span', { class: 'escape__fleches' },
            h('button', { type: 'button', 'aria-label': 'Monter', disabled: i === 0, onclick: function () { bouger(-1); }, text: '▲' }),
            h('button', { type: 'button', 'aria-label': 'Descendre', disabled: i === etapes.length - 1, onclick: function () { bouger(1); }, text: '▼' }),
            h('button', { type: 'button', 'aria-label': 'Supprimer l\'étape', disabled: etapes.length < 2, onclick: function () { if (confirm('Supprimer l\'étape ' + (i + 1) + ' ?')) { lire(); etapes.splice(i, 1); dessiner(); } }, text: '✕' }))),
        corps);
    }
    function lire() { etapes.forEach(function (x) { if (x.lire) x.e = x.lire(); }); }
    function dessiner() { liste.replaceChildren.apply(liste, etapes.map(carteEtape)); }

    var b = h('button', { class: 'bouton', type: 'submit', text: 'Enregistrer la mission' });
    var form = h('form', { class: 'form-carte escape-edit', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); lire(); err.textContent = '';
      var d = { titre: titre.value.trim(), ic: ic.value.trim() || '🔓', duree: duree.value.trim(), resume: resume.value.trim(), etapes: etapes.map(function (x) { return x.e; }) };
      var pb = verifier(d); if (pb) { err.textContent = pb; return; }
      b.disabled = true; b.textContent = 'Enregistrement…';
      A.Api.appeler('escape_enregistrer', { jeton: o.jeton, id: o.scenario ? o.scenario.id : null, scenario: d, modeles: o.modeles }).then(function () {
        o.retour('Mission enregistrée. Un référent doit la jouer puis la valider pour qu\'elle soit visible des agents.');
      }).catch(function (x) { b.disabled = false; b.textContent = 'Enregistrer la mission'; err.textContent = x && x.code === 'scenario_invalide' ? 'Mission incomplète : vérifiez chaque étape.' : A.message(x && x.code); });
    } },
      h('div', { class: 'grille-2' }, champ('Titre', titre), h('div', { class: 'grille-2' }, champ('Icône', ic), champ('Durée', duree))),
      champ('Résumé', resume), h('h3', { text: 'Étapes' }), liste,
      h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { lire(); etapes.push({ e: { type: 'choix', question: '', choix: [], bonne: 0 } }); dessiner(); }, text: '+ Ajouter une étape' }),
      err, b);
    dessiner();
    A.afficher(h('div', { class: 'page page--large quiz' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { if (confirm('Quitter sans enregistrer ?')) o.retour(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: o.scenario ? 'Modifier la mission' : 'Nouvelle mission' }),
        h('span', { class: 'entete__role', text: 'Escape game' })),
      h('p', { class: 'section__note', text: 'Patients et personnes fictifs uniquement : aucune donnée réelle.' }), form));
    window.scrollTo(0, 0);
  }
  function verifier(d) {
    if (d.titre.length < 3) return 'Donnez un titre à la mission.';
    for (var i = 0; i < d.etapes.length; i++) {
      var e = d.etapes[i], n = 'Étape ' + (i + 1) + ' : ';
      if (e.type === 'recit') { if (!e.texte) return n + 'écrivez le texte.'; continue; }
      if (!e.question) return n + 'écrivez la question.';
      if (e.type === 'choix' && (e.choix.length < 2 || e.choix.length > 6 || !(e.bonne >= 0 && e.bonne < e.choix.length))) return n + '2 à 6 réponses, et le n° de la bonne.';
      if (e.type === 'multi' && (e.items.length < 2 || !e.items.some(function (x) { return x.ok; }))) return n + 'au moins 2 propositions, dont une bonne (« + »).';
      if (e.type === 'ordre' && (e.items.length < 2 || e.items.length > 8)) return n + '2 à 8 étapes à remettre dans l\'ordre.';
      if (e.type === 'plan' && !Object.keys(e.cible).some(function (k) { return k !== 'proche' && e.cible[k]; })) return n + 'indiquez ce qu\'il faut toucher.';
    }
    return '';
  }
  window.ReaEscapeEditeur = { ouvrir: ouvrir, _verifier: verifier };
})();
