/* Cap NCHUG · actualités modifiables dans l'appli, rubrique « Documents et FAQ » (avec PDF) et rubriques personnalisées.
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

  /* ---------- Documents et FAQ, et rubriques personnalisées (même écran, mêmes fiches) ---------- */
  // CTX : rubrique ouverte ({ id, nom, emoji, sous, chu, origine, source }) ; null = Documents et FAQ
  var FILTRE = '', CTX = null;
  function documents(flash) { if (CTX) FILTRE = ''; CTX = null; charger(flash); }
  function rubrique(r, flash) { if (!CTX || CTX.id !== r.id) FILTRE = ''; CTX = r; charger(flash); }
  function titreEcran() { return CTX ? CTX.nom : 'Documents et FAQ'; }
  function charger(flash) {
    init(); A.definirEcran(null);
    page(titreEcran(), null, attente());
    appeler('docs_liste', CTX ? { rubrique: CTX.id } : {}).then(function (r) { if (r.rubrique && CTX) CTX = r.rubrique; dessinerDocs(r, flash); })
      .catch(function (e) { if (!erreurSession(e)) page(titreEcran(), '', messageErreur(e, function () { charger(); })); });
  }
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function sousDe(d) { return String(d.rubrique || '').split('/')[1] || ''; }
  function dessinerDocs(r, flash) {
    var recherche = h('input', { type: 'search', placeholder: 'Chercher un document, une question…', value: FILTRE, 'aria-label': 'Chercher' });
    var zone = h('div');
    function groupes(l) { // [{ titre, chu, items }]
      if (!CTX) {
        var cats = [];
        l.forEach(function (d) { var k = (d.chu ? '1' : '2') + d.categorie; if (cats.indexOf(k) < 0) cats.push(k); });
        return cats.map(function (k) { return { titre: k.slice(1), chu: k.charAt(0) === '1', items: l.filter(function (d) { return (d.chu ? '1' : '2') + d.categorie === k; }) }; });
      }
      var ids = (CTX.sous || []).map(function (s) { return s.id; });
      var g = (CTX.sous || []).map(function (s) { return { titre: s.nom, items: l.filter(function (d) { return sousDe(d) === s.id; }) }; });
      var autres = l.filter(function (d) { return ids.indexOf(sousDe(d)) < 0; });
      if (autres.length || !g.length) g.push({ titre: g.length ? 'Autres' : 'Fiches', items: autres });
      return g;
    }
    function remplir() {
      var f = norm(FILTRE), trouvesPdf = {};
      var l = r.documents.filter(function (d) {
        if (!f) return true;
        if (norm(d.titre + ' ' + d.texte + ' ' + d.categorie).indexOf(f) >= 0) return true;
        if (d.pdfTexte && norm(d.pdfTexte).indexOf(f) >= 0) { trouvesPdf[d.id] = 1; return true; }
        return false;
      });
      var gs = groupes(l).filter(function (g) { return g.items.length || (!f && CTX); });
      zone.replaceChildren.apply(zone, l.length || (CTX && !f && gs.length) ? gs.map(function (g) {
        return h('section', { class: 'section' },
          h('div', { class: 'section__tete' }, h('h2', { text: g.titre }), g.chu ? h('span', { class: 'etiquette etiquette--chu', text: 'CHU' }) : null),
          g.items.length ? h('div', { class: 'docs' }, g.items.map(function (d) { return carteDoc(d, r.peutModifier, trouvesPdf[d.id]); }))
            : h('p', { class: 'section__note', text: 'Rien pour le moment.' }));
      }) : [h('p', { class: 'vide', text: r.documents.length ? 'Aucun résultat.' : (r.peutModifier || !CTX ? 'Pas encore de document. Les référents peuvent en ajouter.' : 'Pas encore de fiche dans cette rubrique.') })]);
    }
    var minut; recherche.addEventListener('input', function () { clearTimeout(minut); minut = setTimeout(function () { FILTRE = recherche.value; remplir(); }, 200); });
    remplir();
    var origine = CTX ? (CTX.chu ? 'Rubrique commune à tout le CHU' : CTX.origine ? 'Rubrique créée par ' + CTX.origine + ', avec les fiches de votre service' : null) : null;
    page(titreEcran(), r.peutModifier ? 'Référent' : null, h('div', null,
      flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
      origine ? h('p', { class: 'section__note rub-origine' }, CTX.chu ? h('span', { class: 'etiquette etiquette--chu', text: 'CHU' }) : null, CTX.chu ? ' ' : null, origine) : null,
      recherche, r.peutModifier ? formulaireDoc(null) : null, zone));
  }
  function carteDoc(d, peut, dansPdf) {
    var det = h('details', { class: 'doc' + (d.publie === false ? ' doc--brouillon' : '') },
      h('summary', null, h('span', { text: d.titre }), d.pdf ? h('small', { class: 'doc__pdf', text: ' · PDF' }) : null, d.publie === false ? h('small', { text: ' · non publié' }) : null,
        dansPdf ? h('small', { class: 'doc__trouve', text: ' · 🔎 trouvé dans le PDF' }) : null),
      d.texte ? h('p', { class: 'doc__texte', text: d.texte }) : null,
      d.pdf && d.pdf.complet ? h('button', { type: 'button', class: 'bouton doc__lire', onclick: function () { lirePdf(d); }, text: '📄 Lire le PDF (' + d.pdf.pages + ' page' + (d.pdf.pages > 1 ? 's' : '') + ')' }) : null,
      d.pdf && !d.pdf.complet ? h('p', { class: 'message-erreur', text: 'PDF incomplet (envoi interrompu) : invisible pour les agents. Modifiez la fiche et choisissez à nouveau le PDF.' }) : null,
      d.lien ? h('a', { class: 'bouton bouton--discret', href: d.lien, target: '_blank', rel: 'noopener noreferrer', text: 'Ouvrir le document ↗' }) : null,
      peut && !d.chu ? h('div', { class: 'gps-boutons' },
        h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { det.replaceChildren(formulaireDoc(d)); det.open = true; }, text: 'Modifier' }),
        h('button', { type: 'button', class: 'bouton bouton--discret bouton--danger', onclick: function (ev) {
          if (!confirm('Supprimer « ' + d.titre + ' »' + (d.pdf ? ' et son PDF' : '') + ' ?')) return; ev.currentTarget.disabled = true;
          appeler('docs_supprimer', { id: d.id }).then(function () { charger('Supprimé.'); }).catch(function (e) { if (!erreurSession(e)) charger(A.message(e.code)); });
        }, text: 'Supprimer' })) : null);
    return det;
  }

  /* ---------- PDF : conversion sur l'appareil (images + texte), puis envoi page par page ---------- */
  function champPdf(d) {
    var fichier = h('input', { type: 'file', accept: 'application/pdf,.pdf', 'aria-label': 'Choisir un PDF' });
    var etat = h('p', { class: 'section__note', role: 'status' }), apercu = h('div', { class: 'nl-apercu' }), erreur = h('p', { class: 'message-erreur', role: 'alert' });
    var retirer = d && d.pdf ? caseA('Retirer le PDF', false) : null, o = { conversion: null, occupe: false };
    fichier.addEventListener('change', function () {
      o.conversion = null; erreur.textContent = ''; apercu.replaceChildren();
      var f = fichier.files && fichier.files[0]; if (!f) { etat.textContent = ''; return; }
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { erreur.textContent = 'Choisissez un fichier PDF.'; return; }
      if (f.size > 40 * 1024 * 1024) { erreur.textContent = 'Ce PDF dépasse 40 Mo.'; return; }
      if (!window.ReaPdf) { erreur.textContent = 'Le convertisseur PDF n\'est pas disponible.'; return; }
      etat.textContent = 'Préparation du convertisseur…'; fichier.disabled = true; o.occupe = true;
      window.ReaPdf.convertir(f, function (n, t) { etat.textContent = 'Conversion : page ' + n + ' sur ' + t + '…'; }).then(function (r) {
        o.conversion = r; if (retirer) retirer.c.checked = false;
        apercu.replaceChildren.apply(apercu, r.apercus.map(function (src, i) { return h('img', { src: src, alt: 'Aperçu page ' + (i + 1) }); }));
        var mots = (r.texte || '').split(/\s+/).filter(Boolean).length;
        etat.textContent = r.pages.length + ' page' + (r.pages.length > 1 ? 's' : '') + ' converties en images. ' +
          (mots ? mots + ' mots extraits : la recherche les trouvera.' : 'Aucun texte lisible (PDF scanné ?) : la recherche portera sur le titre et la réponse.');
      }).catch(function (e) {
        etat.textContent = ''; erreur.textContent = (e && e.message && !/^[a-z_]+$/.test(e.message)) ? e.message : 'Ce PDF n\'a pas pu être lu. Essayez de l\'exporter à nouveau (PDF standard).';
      }).finally(function () { fichier.disabled = false; o.occupe = false; });
    });
    o.el = h('div', { class: 'champ doc-pdf' }, h('label', { text: d && d.pdf ? 'PDF (' + d.pdf.pages + ' page' + (d.pdf.pages > 1 ? 's' : '') + ') : remplacer' : 'PDF (facultatif)' }), fichier,
      h('small', { class: 'section__note', text: 'Converti en images sur cet appareil (16 pages, 40 Mo au plus) ; son texte sert à la recherche.' }), etat, apercu, erreur, retirer ? retirer.el : null);
    o.valeur = function () { return o.conversion ? { pages: o.conversion.pages.length, ratio: o.conversion.ratio, texte: o.conversion.texte || '' } : (retirer && retirer.c.checked ? null : undefined); };
    o.garde = function () { return !!o.conversion || !!(d && d.pdf && !(retirer && retirer.c.checked)); };
    return o;
  }
  function envoyerPages(id, pages, etat) {
    return pages.reduce(function (p, data, k) {
      return p.then(function () { etat.textContent = 'Envoi du PDF : page ' + (k + 1) + ' sur ' + pages.length + '…'; return appeler('docs_pdf_envoyer', { id: id, page: k, data: data }); });
    }, Promise.resolve());
  }

  function formulaireDoc(d) {
    var cat, sel = null;
    if (CTX) {
      var actuel = d ? sousDe(d) : '';
      sel = h('select', null, (CTX.sous || []).map(function (s) { var o = h('option', { value: s.id, text: s.nom }); if (s.id === actuel) o.selected = true; return o; })
        .concat([h('option', { value: '', text: (CTX.sous || []).length ? 'Autres' : 'Fiches' })]));
      if (!actuel && d) sel.value = '';
    } else cat = h('input', { type: 'text', maxlength: '40', value: d ? d.categorie : '', placeholder: 'ex. FAQ, Procédures, Accès', list: 'docs-cats' });
    var titre = h('input', { type: 'text', maxlength: '160', value: d ? d.titre : '', placeholder: 'Titre du document ou question' });
    var texte = h('textarea', { rows: '4', maxlength: '4000', placeholder: 'Réponse ou description' }); texte.value = d ? d.texte : '';
    var lien = h('input', { type: 'url', maxlength: '500', value: d ? d.lien : '', placeholder: 'https://… (lien vers un document, facultatif)' });
    var pdf = champPdf(d), pub = caseA('Publié', d ? d.publie !== false : true), err = h('p', { class: 'message-erreur', role: 'alert' }), etat = h('p', { class: 'section__note', role: 'status' });
    var form = h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); err.textContent = '';
      if (pdf.occupe) { err.textContent = 'Attendez la fin de la conversion du PDF.'; return; }
      if (titre.value.trim().length < 2 || (!texte.value.trim() && !lien.value.trim() && !pdf.garde())) { err.textContent = 'Un titre, et un texte, un lien ou un PDF.'; return; }
      if (lien.value.trim() && !/^https:\/\//.test(lien.value.trim())) { err.textContent = 'Le lien doit commencer par https://'; return; }
      var b = form.querySelector('[type=submit]'); b.disabled = true;
      var donnees = { categorie: cat ? cat.value.trim() : '', titre: titre.value.trim(), texte: texte.value, lien: lien.value.trim(), publie: pub.c.checked, rubrique: CTX ? CTX.id + '/' + sel.value : '' };
      var v = pdf.valeur(), conv = pdf.conversion, enregistre = false;
      if (v !== undefined) donnees.pdf = v;
      etat.textContent = 'Enregistrement…';
      appeler('docs_enregistrer', { id: d ? d.id : null, donnees: donnees })
        .then(function (r) { enregistre = true; return conv ? envoyerPages(r.id, conv.pages, etat) : null; })
        .then(function () { charger(d ? 'Modifié.' : 'Ajouté.'); })
        .catch(function (e) {
          b.disabled = false; etat.textContent = ''; if (erreurSession(e)) return;
          if (enregistre) return charger('La fiche est enregistrée mais l\'envoi du PDF a été interrompu (' + A.message(e.code) + ') : modifiez-la pour le renvoyer.');
          err.textContent = e.code === 'lien_invalide' ? 'Lien refusé : il doit commencer par https://' : A.message(e.code);
        });
    } }, CTX ? h('div', { class: 'grille-2' }, champ('Sous-rubrique', sel), champ('Titre ou question', titre)) : h('div', { class: 'grille-2' }, champ('Catégorie', cat), champ('Titre ou question', titre)),
      champ('Texte ou réponse', texte), champ('Lien', lien), pdf.el, pub.el, err, etat,
      h('p', { class: 'section__note', text: 'Pas de données de santé ni de document confidentiel : un lien vers l\'intranet, un document ou un PDF publics.' }),
      h('div', { class: 'gps-boutons' }, h('button', { class: 'bouton', type: 'submit', text: d ? 'Enregistrer' : 'Ajouter' }),
        d ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { charger(); }, text: 'Annuler' }) : null));
    return d ? form : h('details', { class: 'defi-ajout' }, h('summary', { text: CTX ? '+ Ajouter une fiche' : '+ Ajouter un document ou une question' }), form);
  }

  /* ---------- Liseuse du PDF (comme les newsletters ; pages gardées pour la lecture hors ligne jusqu'à la déconnexion) ---------- */
  function b64EnBlob(b64, type) { var bin = atob(b64), n = bin.length, o = new Uint8Array(n); for (var i = 0; i < n; i++) o[i] = bin.charCodeAt(i); return new Blob([o], { type: type || 'image/jpeg' }); }
  function pagePdf(d, k) {
    var cle = 'doc/' + (d.chu ? 'chu-' : '') + d.id + '/' + d.pdf.v + '/' + k;
    var lu = window.caches ? caches.open(A.CACHE_DONNEES).then(function (c) { return c.match(cle); }).catch(function () { return null; }) : Promise.resolve(null);
    return lu.then(function (r) {
      if (r) return r.blob();
      return appeler('docs_pdf_page', { id: (d.chu ? 'chu:' : '') + d.id, page: k }).then(function (p) {
        var b = b64EnBlob(p.data, p.type);
        if (window.caches && session().jeton) caches.open(A.CACHE_DONNEES).then(function (c) { return c.put(cle, new Response(b, { headers: { 'Content-Type': 'image/jpeg' } })); }).catch(function () {});
        return b;
      });
    });
  }
  function lirePdf(d) {
    A.definirEcran(null);
    var n = d.pdf.pages, ratio = d.pdf.ratio || 1.414, pages = [];
    for (var k = 0; k < n; k++) pages.push(h('figure', { class: 'nl-page', style: 'aspect-ratio:1/' + ratio },
      h('div', { class: 'squelette nl-page__attente' }), h('figcaption', { class: 'visuellement-cache', text: 'Page ' + (k + 1) + ' sur ' + n })));
    A.afficher(h('div', { class: 'page page--large page--nl' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { charger(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: d.titre }), d.chu ? h('span', { class: 'entete__role', text: 'CHU' }) : null),
      h('p', { class: 'section__note nl__aide', text: 'Écartez deux doigts pour zoomer sur une page.' }),
      h('div', { class: 'nl-pages' }, pages),
      h('button', { type: 'button', class: 'bouton bouton--discret nl__retour', onclick: function () { charger(); }, text: '‹ ' + titreEcran() })));
    window.scrollTo(0, 0);
    (function suivante(k) {
      if (k >= n || !pages[k].isConnected) return;
      pagePdf(d, k).then(function (b) {
        pages[k].replaceChildren(h('img', { alt: 'Page ' + (k + 1) + ' sur ' + n + ' de ' + d.titre, src: URL.createObjectURL(b), decoding: 'async' }));
        pages[k].classList.add('nl-page--ok'); suivante(k + 1);
      }).catch(function (e) {
        if (erreurSession(e)) return;
        pages[k].replaceChildren(h('div', { class: 'nl-page__erreur' }, h('p', { text: e.code === 'reseau' ? 'Page non disponible sans réseau.' : A.message(e.code) }),
          h('button', { type: 'button', class: 'bouton', onclick: function () { pages[k].replaceChildren(h('div', { class: 'squelette nl-page__attente' })); suivante(k); }, text: 'Réessayer' })));
      });
    })(0);
  }

  window.ReaCommuns = { actus: function (f) { actus(f); }, documents: function (f) { documents(f); }, rubrique: function (r, f) { rubrique(r, f); } };
})();
