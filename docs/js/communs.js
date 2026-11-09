/* Cap NCHUG · actualités modifiables dans l'appli et rubrique « Documents et FAQ ».
   Chaque service voit ses contenus et ceux communs à tout le CHU (étiquette « CHU »), publiés par les créateurs. */
(function () {
  'use strict';
  var A, h;
  function init() { A = window.ReaApp; h = A.h; }
  function session() { return A.stock.lire(A.CLE.session) || {}; }
  function appeler(action, d) { return A.Api.appeler(action, Object.assign({ jeton: session().jeton }, d || {})); }
  function erreurSession(e) { if (e && A.ERREURS_SESSION.indexOf(e.code) >= 0) { A.stock.effacer(A.CLE.session); A.ecranConnexion(A.message(e.code)); return true; } return false; }
  function page(titre, sous, contenu, retour) {
    A.afficher(h('div', { class: 'page page--large communs' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { (retour || A.ecranAccueil)(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: titre }), sous ? h('span', { class: 'entete__role', text: sous }) : null),
      contenu));
    window.scrollTo(0, 0);
  }
  function attente() { return h('div', { class: 'squelette', style: 'height:220px;margin-top:12px' }); }
  function messageErreur(e, reessayer) { return h('div', null, h('p', { class: 'vide', text: A.message(e && e.code) }), h('button', { class: 'bouton', type: 'button', onclick: reessayer, text: 'Réessayer' })); }
  function champ(label, el) { return h('div', { class: 'champ' }, h('label', { text: label }), el); }
  function caseA(label, coche) { var c = h('input', { type: 'checkbox' }); c.checked = !!coche; return { el: h('label', { class: 'case' }, c, ' ' + label), c: c }; }

  /* ---------- Actualités (référents et administrateur) ---------- */
  function actus(flash) {
    init(); A.definirEcran(null);
    page('Actualités', 'Gestion', attente());
    appeler('actu_liste').then(function (r) {
      page('Actualités', 'Gestion', h('div', null,
        flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
        h('p', { class: 'section__note', text: 'Les actualités publiées s\'affichent sur l\'accueil de tous les agents du service. Épinglée : toujours en haut.' }),
        formulaireActu(null),
        r.actualites.length ? h('ul', { class: 'actus' }, r.actualites.map(function (a) {
          var li = h('li', { class: 'actu' + (a.epinglee ? ' actu--epinglee' : '') + (a.publiee ? '' : ' actu--brouillon') },
            h('p', { class: 'actu__date', text: (a.publiee ? '' : 'Non publiée · ') + (a.epinglee ? 'Épinglée · ' : '') + (a.date ? A.dateCourte(a.date) : '') }),
            h('h3', { class: 'actu__titre', text: a.titre }), a.texte ? h('p', { class: 'actu__texte', text: a.texte }) : null,
            h('div', { class: 'gps-boutons' },
              h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { li.replaceChildren(formulaireActu(a)); }, text: 'Modifier' }),
              h('button', { type: 'button', class: 'bouton bouton--discret bouton--danger', onclick: function (ev) {
                if (!confirm('Supprimer « ' + a.titre + ' » ?')) return; ev.currentTarget.disabled = true;
                appeler('actu_supprimer', { ligne: a.ligne, titre: a.titre }).then(function () { A.stock.effacer(A.CLE.accueil); actus('Actualité supprimée.'); }).catch(function (e) { if (!erreurSession(e)) actus(A.message(e.code)); });
              }, text: 'Supprimer' })));
          return li;
        })) : h('p', { class: 'vide', text: 'Aucune actualité.' })));
    }).catch(function (e) { if (!erreurSession(e)) page('Actualités', '', messageErreur(e, function () { actus(); })); });
  }
  function formulaireActu(a) {
    var titre = h('input', { type: 'text', maxlength: '120', value: a ? a.titre : '', required: true });
    var texte = h('textarea', { rows: '4', maxlength: '2000' }); texte.value = a ? a.texte : '';
    var date = h('input', { type: 'date', value: a ? a.date : '' });
    var pub = caseA('Publiée', a ? a.publiee : true), epi = caseA('Épinglée en haut', a && a.epinglee), err = h('p', { class: 'message-erreur', role: 'alert' });
    var form = h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); if (titre.value.trim().length < 2) { err.textContent = 'Donnez un titre.'; return; }
      var b = form.querySelector('[type=submit]'); b.disabled = true;
      appeler('actu_enregistrer', { donnees: { ligne: a ? a.ligne : null, titreAvant: a ? a.titre : null, titre: titre.value.trim(), texte: texte.value, date: date.value, publiee: pub.c.checked, epinglee: epi.c.checked } })
        .then(function () { A.stock.effacer(A.CLE.accueil); actus(a ? 'Actualité modifiée.' : 'Actualité ajoutée.'); })
        .catch(function (e) { b.disabled = false; if (!erreurSession(e)) err.textContent = e.code === 'introuvable' ? 'Cette actualité a changé entre-temps : rechargez la page.' : A.message(e.code); });
    } }, champ('Titre', titre), champ('Texte', texte), h('div', { class: 'grille-2' }, champ('Date (vide = aujourd\'hui)', date), h('div', null, pub.el, epi.el)), err,
      h('div', { class: 'gps-boutons' }, h('button', { class: 'bouton', type: 'submit', text: a ? 'Enregistrer' : 'Publier' }),
        a ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { actus(); }, text: 'Annuler' }) : null));
    return a ? form : h('details', { class: 'defi-ajout' }, h('summary', { text: '+ Nouvelle actualité' }), form);
  }

  /* ---------- Documents et FAQ ---------- */
  var FILTRE = '';
  function documents(flash) {
    init(); A.definirEcran(null);
    page('Documents et FAQ', null, attente());
    appeler('docs_liste').then(function (r) { dessinerDocs(r, flash); })
      .catch(function (e) { if (!erreurSession(e)) page('Documents et FAQ', '', messageErreur(e, function () { documents(); })); });
  }
  function dessinerDocs(r, flash) {
    var recherche = h('input', { type: 'search', placeholder: 'Chercher un document, une question…', value: FILTRE, 'aria-label': 'Chercher' });
    var zone = h('div');
    function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function remplir() {
      var f = norm(FILTRE), l = r.documents.filter(function (d) { return !f || norm(d.titre + ' ' + d.texte + ' ' + d.categorie).indexOf(f) >= 0; }), cats = [];
      l.forEach(function (d) { var k = (d.chu ? '1' : '2') + d.categorie; if (cats.indexOf(k) < 0) cats.push(k); });
      zone.replaceChildren.apply(zone, l.length ? cats.map(function (k) {
        var items = l.filter(function (d) { return (d.chu ? '1' : '2') + d.categorie === k; });
        return h('section', { class: 'section' },
          h('div', { class: 'section__tete' }, h('h2', { text: k.slice(1) }), k.charAt(0) === '1' ? h('span', { class: 'etiquette etiquette--chu', text: 'CHU' }) : null),
          h('div', { class: 'docs' }, items.map(function (d) { return carteDoc(d, r.peutModifier); })));
      }) : [h('p', { class: 'vide', text: r.documents.length ? 'Aucun résultat.' : 'Pas encore de document. Les référents peuvent en ajouter.' })]);
    }
    var minut; recherche.addEventListener('input', function () { clearTimeout(minut); minut = setTimeout(function () { FILTRE = recherche.value; remplir(); }, 200); });
    remplir();
    page('Documents et FAQ', r.peutModifier ? 'Référent' : null, h('div', null,
      flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
      recherche, r.peutModifier ? formulaireDoc(null) : null, zone));
  }
  function carteDoc(d, peut) {
    var det = h('details', { class: 'doc' + (d.publie === false ? ' doc--brouillon' : '') },
      h('summary', null, h('span', { text: d.titre }), d.publie === false ? h('small', { text: ' · non publié' }) : null),
      d.texte ? h('p', { class: 'doc__texte', text: d.texte }) : null,
      d.lien ? h('a', { class: 'bouton bouton--discret', href: d.lien, target: '_blank', rel: 'noopener noreferrer', text: 'Ouvrir le document ↗' }) : null,
      peut && !d.chu ? h('div', { class: 'gps-boutons' },
        h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { det.replaceChildren(formulaireDoc(d)); det.open = true; }, text: 'Modifier' }),
        h('button', { type: 'button', class: 'bouton bouton--discret bouton--danger', onclick: function (ev) {
          if (!confirm('Supprimer « ' + d.titre + ' » ?')) return; ev.currentTarget.disabled = true;
          appeler('docs_supprimer', { id: d.id }).then(function () { documents('Supprimé.'); }).catch(function (e) { if (!erreurSession(e)) documents(A.message(e.code)); });
        }, text: 'Supprimer' })) : null);
    return det;
  }
  function formulaireDoc(d) {
    var cat = h('input', { type: 'text', maxlength: '40', value: d ? d.categorie : '', placeholder: 'ex. FAQ, Procédures, Accès', list: 'docs-cats' });
    var titre = h('input', { type: 'text', maxlength: '160', value: d ? d.titre : '', placeholder: 'Titre du document ou question' });
    var texte = h('textarea', { rows: '4', maxlength: '4000', placeholder: 'Réponse ou description' }); texte.value = d ? d.texte : '';
    var lien = h('input', { type: 'url', maxlength: '500', value: d ? d.lien : '', placeholder: 'https://… (lien vers un document, facultatif)' });
    var pub = caseA('Publié', d ? d.publie !== false : true), err = h('p', { class: 'message-erreur', role: 'alert' });
    var form = h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); err.textContent = '';
      if (titre.value.trim().length < 2 || (!texte.value.trim() && !lien.value.trim())) { err.textContent = 'Un titre, et un texte ou un lien.'; return; }
      if (lien.value.trim() && !/^https:\/\//.test(lien.value.trim())) { err.textContent = 'Le lien doit commencer par https://'; return; }
      var b = form.querySelector('[type=submit]'); b.disabled = true;
      appeler('docs_enregistrer', { id: d ? d.id : null, donnees: { categorie: cat.value.trim(), titre: titre.value.trim(), texte: texte.value, lien: lien.value.trim(), publie: pub.c.checked } })
        .then(function () { documents(d ? 'Modifié.' : 'Ajouté.'); })
        .catch(function (e) { b.disabled = false; if (!erreurSession(e)) err.textContent = e.code === 'lien_invalide' ? 'Lien refusé : il doit commencer par https://' : A.message(e.code); });
    } }, h('div', { class: 'grille-2' }, champ('Catégorie', cat), champ('Titre ou question', titre)), champ('Texte ou réponse', texte), champ('Lien', lien), pub.el, err,
      h('p', { class: 'section__note', text: 'Pas de données de santé ni de document confidentiel : un lien vers l\'intranet ou un document public.' }),
      h('div', { class: 'gps-boutons' }, h('button', { class: 'bouton', type: 'submit', text: d ? 'Enregistrer' : 'Ajouter' }),
        d ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { documents(); }, text: 'Annuler' }) : null));
    return d ? form : h('details', { class: 'defi-ajout' }, h('summary', { text: '+ Ajouter un document ou une question' }), form);
  }

  window.ReaCommuns = { actus: function (f) { actus(f); }, documents: function (f) { documents(f); } };
})();
