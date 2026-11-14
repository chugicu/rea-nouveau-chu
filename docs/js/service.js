/* Cap NCHUG · personnaliser le service (administrateur) : nom, message, date J, logo, rubriques, rubriques personnalisées, import du plan.
   Le logo du CHU n'est jamais modifié : le logo du service s'affiche à côté, sur fond blanc. */
(function () {
  'use strict';
  var A, h;
  var NOMS = { plan: 'Plan du service', visites: 'Visites des locaux', newsletter: 'Newsletter', souvenirs: 'Souvenirs', jeux: 'Quiz et jeux', docs: 'Documents et FAQ' };
  var CLE_LOGO = 'rea.logo';
  function init() { A = window.ReaApp; h = A.h; }
  function session() { return A.stock.lire(A.CLE.session) || {}; }
  function appeler(action, d) { return A.Api.appeler(action, Object.assign({ jeton: session().jeton }, d || {})); }
  function erreurSession(e) { if (e && A.ERREURS_SESSION.indexOf(e.code) >= 0) { A.stock.effacer(A.CLE.session); A.ecranConnexion(A.message(e.code)); return true; } return false; }
  function page(contenu, titre, role) {
    A.afficher(h('div', { class: 'page page--large service-perso' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { A.ecranAccueil(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: titre || 'Personnaliser le service' }), h('span', { class: 'entete__role', text: role || 'Administrateur' })),
      contenu));
  }
  function champ(label, el, aide) { return h('div', { class: 'champ' }, h('label', { text: label }), el, aide ? h('small', { class: 'section__note', text: aide }) : null); }

  /* ---------- Logo du service sur l'accueil (gardé sur le téléphone, rechargé quand il change) ---------- */
  function logo(version, nom) {
    init();
    var img = h('img', { class: 'logo-service', alt: 'Logo ' + (nom || 'du service'), hidden: true });
    var c = A.stock.lire(CLE_LOGO);
    if (c && c.version === version && c.data) { img.src = 'data:' + c.type + ';base64,' + c.data; img.hidden = false; }
    else appeler('logo').then(function (r) {
      if (!r.data) return;
      try { A.stock.ecrire(CLE_LOGO, { version: version, type: r.type, data: r.data }); } catch (e) { /* stockage plein */ }
      img.src = 'data:' + r.type + ';base64,' + r.data; img.hidden = false;
    }).catch(function () {});
    return img;
  }

  /* ---------- Écran ---------- */
  function ouvrir(flash, texteDessin) {
    init(); A.definirEcran(null);
    page(h('div', { class: 'squelette', style: 'height:300px;margin-top:16px' }));
    appeler('service_reglages').then(function (r) { dessiner(r, flash, texteDessin); })
      .catch(function (e) { if (!erreurSession(e)) page(h('p', { class: 'vide', text: A.message(e.code) })); });
  }
  function dessiner(r, flash, texteDessin) {
    var g = r.reglages;
    var nom = h('input', { type: 'text', maxlength: '60', value: g.nom }), msg = h('textarea', { rows: '2', maxlength: '300' }), dj = h('input', { type: 'date', value: g.dateJ || '' });
    msg.value = g.message;
    var errId = h('p', { class: 'message-erreur', role: 'alert' });
    var identite = h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); if (nom.value.trim().length < 2) { errId.textContent = 'Le nom est trop court.'; return; }
      envoyer({ nom: nom.value.trim(), message: msg.value.trim(), dateJ: dj.value }, 'Nom, message et date enregistrés.', identite);
    } }, h('h2', { text: 'Identité' }), champ('Nom du service', nom), champ('Message d\'accueil', msg), champ('Date J (1er jour du déménagement)', dj, 'Vide tant qu\'elle n\'est pas fixée.'), errId,
      h('button', { class: 'bouton', type: 'submit', text: 'Enregistrer' }));

    var cases = r.toutes.map(function (id) { var c = h('input', { type: 'checkbox', value: id }); c.checked = g.rubriques.indexOf(id) >= 0; return h('label', { class: 'case' }, c, ' ' + NOMS[id]); });
    var rubriques = h('form', { class: 'form-carte', onsubmit: function (ev) {
      ev.preventDefault();
      var l = cases.map(function (c) { return c.querySelector('input'); }).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      envoyer({ rubriques: l }, 'Rubriques enregistrées : l\'accueil n\'affiche plus que celles choisies.', rubriques);
    } }, h('h2', { text: 'Rubriques de l\'appli' }), h('p', { class: 'section__note', text: 'Choisissez ce qui s\'affiche sur l\'accueil. Un petit service peut n\'en garder que deux ou trois ; le Défi CHU et les actualités restent toujours visibles.' }),
      h('div', { class: 'service-cases' }, cases), h('button', { class: 'bouton', type: 'submit', text: 'Enregistrer' }));

    var caseVisite = h('input', { type: 'checkbox' }); caseVisite.checked = !!g.visiteVirtuelle;
    var visite = h('form', { class: 'form-carte', onsubmit: function (ev) {
      ev.preventDefault();
      envoyer({ visiteVirtuelle: caseVisite.checked }, caseVisite.checked ? 'Visite virtuelle activée : la tuile apparaît dans Plan du service.' : 'Visite virtuelle masquée.', visite);
    } }, h('h2', { text: 'Visite virtuelle' }),
      h('p', { class: 'section__note', text: 'Promenade en photos à 360°, dans Plan du service. À activer une fois les photos et les liens en place (voir le guide de déploiement).' }),
      h('label', { class: 'case' }, caseVisite, ' Afficher la tuile « Visite virtuelle »'),
      h('button', { class: 'bouton', type: 'submit', text: 'Enregistrer' }));

    var plan = sectionPlan(g, texteDessin);
    page(h('div', null, flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null, texteDessin ? null : identite, texteDessin ? null : sectionLogo(g), texteDessin ? null : rubriques, texteDessin ? null : visite, texteDessin ? null : sectionRubriques(), plan));
    if (texteDessin) plan.scrollIntoView({ block: 'start' });
  }
  function envoyer(d, flash, form) {
    var b = form.querySelector('[type=submit]'); if (b) b.disabled = true;
    return appeler('service_reglages', { donnees: d }).then(function () { A.stock.effacer(A.CLE.accueil); ouvrir(flash); })
      .catch(function (e) { if (b) b.disabled = false; if (!erreurSession(e)) A.alerteDouce(form, A.message(e.code)); });
  }

  /* ---------- Rubriques personnalisées (moteur 2.4.0) ----------
     L'administrateur crée ses rubriques (tuile sur l'accueil) et leurs sous-rubriques ; il peut reprendre la structure
     d'une rubrique d'un autre service (structure suivie automatiquement, fiches de son service). Les créateurs font de même
     pour les rubriques communes, visibles d'office partout. */
  var EMOJIS = ['📁', '📋', '🩺', '💊', '🛏️', '🧯', '🚨', '🧼', '🍽️', '🚗', '📞', '🎓', '🗓️', '💡', '🛠️', '👪', '❓', '🔑'];
  var NOMS_COULEURS = { '#223b80': 'Bleu foncé', '#40a8df': 'Bleu ciel', '#048e39': 'Vert', '#95c127': 'Vert clair' };
  function rubriquesCommunes() {
    init(); A.definirEcran(null);
    page(h('div', null, sectionRubriques()), 'Rubriques communes', 'Créateurs');
  }
  function sectionRubriques() {
    var zone = h('section', { class: 'form-carte rub-gestion' }, h('h2', { text: 'Mes rubriques' }), h('div', { class: 'squelette', style: 'height:120px' }));
    appeler('rub_etat').then(function (e) { remplirRub(zone, e); })
      .catch(function (er) { if (!erreurSession(er)) zone.replaceChildren(h('h2', { text: 'Mes rubriques' }), h('p', { class: 'message-erreur', text: A.message(er.code) })); });
    return zone;
  }
  function pastille(r) { return h('span', { class: 'rub-pastille', style: '--c:' + r.couleur, 'aria-hidden': 'true', text: r.emoji }); }
  function listeSous(r) { return (r.sous || []).length ? r.sous.map(function (s) { return s.nom; }).join(' · ') : 'Pas de sous-rubrique'; }
  function remplirRub(zone, e, flash) {
    var total = e.propres.length + e.adoptees.length, plein = total >= e.max;
    function action(quoi, id, donnees, bouton, msg) {
      if (bouton) bouton.disabled = true;
      return appeler('rub_gerer', { quoi: quoi, id: id, donnees: donnees }).then(function (n) { A.stock.effacer(A.CLE.accueil); remplirRub(zone, n, msg); zone.scrollIntoView({ block: 'start' }); })
        .catch(function (er) { if (bouton) bouton.disabled = false; if (!erreurSession(er)) A.alerteDouce(bouton ? bouton.parentNode : zone, A.message(er.code)); });
    }
    var propres = e.propres.map(function (r) {
      var li = h('li', { class: 'rub-item' }, pastille(r),
        h('div', { class: 'rub-item__texte' }, h('b', { text: r.nom }), h('small', { class: 'section__note', text: listeSous(r) }),
          r.utilisateurs ? h('small', { class: 'section__note', text: 'Reprise par ' + r.utilisateurs + ' autre' + (r.utilisateurs > 1 ? 's' : '') + ' service' + (r.utilisateurs > 1 ? 's' : '') }) : null),
        h('div', { class: 'gps-boutons' },
          h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { li.replaceChildren(formRub(r, e, action, function () { remplirRub(zone, e); })); }, text: 'Modifier' }),
          h('button', { type: 'button', class: 'bouton bouton--discret bouton--danger', onclick: function (ev) {
            if (!confirm('Supprimer la rubrique « ' + r.nom + ' » et toutes ses fiches (PDF compris) ?' + (r.utilisateurs ? '\n\nLes services qui l\'ont reprise gardent sa structure et leurs propres fiches.' : ''))) return;
            action('supprimer', r.id, null, ev.currentTarget, 'Rubrique supprimée.');
          }, text: 'Supprimer' })));
      return li;
    });
    zone.replaceChildren.apply(zone, [
      h('h2', { text: e.commune ? 'Rubriques communes' : 'Mes rubriques' }),
      flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
      h('p', { class: 'section__note', text: e.commune
        ? 'Elles s\'affichent d\'office dans tous les services et dans Infos générales, avec l\'étiquette CHU. Leurs fiches (texte, lien, PDF) se remplissent en ouvrant la tuile, ici dans les contenus communs.'
        : 'Chaque rubrique devient une tuile sur l\'accueil ; ses sous-rubriques rangent les fiches (texte, lien, PDF), remplies par l\'administrateur et les référents en ouvrant la tuile. ' + total + ' sur ' + e.max + ' rubriques utilisées.' }),
      propres.length ? h('ul', { class: 'rub-liste' }, propres) : h('p', { class: 'vide', text: 'Aucune rubrique pour le moment.' }),
      plein ? h('p', { class: 'section__note', text: 'Maximum de ' + e.max + ' rubriques atteint.' })
        : h('details', { class: 'defi-ajout' }, h('summary', { text: '+ Nouvelle rubrique' }), formRub(null, e, action)),
      e.commune ? null : partage(e, action, plein)].filter(Boolean));
  }
  function formRub(r, e, action, annuler) {
    var nom = h('input', { type: 'text', maxlength: '40', value: r ? r.nom : '', placeholder: 'ex. Transferts patients' });
    var emoji = h('input', { type: 'text', maxlength: '8', value: r ? r.emoji : '📁', class: 'rub-emoji', 'aria-label': 'Emoji' });
    var palette = h('div', { class: 'rub-palette' }, EMOJIS.map(function (x) { return h('button', { type: 'button', class: 'rub-palette__e', 'aria-label': 'Choisir ' + x, onclick: function () { emoji.value = x; }, text: x }); }));
    var couleur = r ? r.couleur : e.couleurs[0], nomGroupe = 'rub-c-' + Math.random().toString(36).slice(2, 7);
    var couleurs = h('div', { class: 'rub-couleurs', role: 'radiogroup', 'aria-label': 'Couleur de la tuile' }, e.couleurs.map(function (c) {
      var i = h('input', { type: 'radio', name: nomGroupe, value: c }); i.checked = c === couleur;
      i.addEventListener('change', function () { couleur = c; });
      return h('label', { class: 'rub-couleur', style: '--c:' + c, title: NOMS_COULEURS[c] || c }, i, h('span', { class: 'visuellement-cache', text: NOMS_COULEURS[c] || c }));
    }));
    var lignes = h('ol', { class: 'rub-sous' }), ajout;
    function majAjout() { ajout.disabled = lignes.children.length >= e.maxSous; }
    function ligneSous(s) {
      var i = h('input', { type: 'text', maxlength: '40', value: s ? s.nom : '', placeholder: 'Nom de la sous-rubrique', 'aria-label': 'Sous-rubrique' });
      if (s) i.dataset.id = s.id;
      var li = h('li', null, i,
        h('button', { type: 'button', class: 'bouton bouton--discret', 'aria-label': 'Monter', onclick: function () { if (li.previousElementSibling) lignes.insertBefore(li, li.previousElementSibling); }, text: '↑' }),
        h('button', { type: 'button', class: 'bouton bouton--discret bouton--danger', 'aria-label': 'Retirer', onclick: function () { li.remove(); majAjout(); }, text: '✕' }));
      lignes.appendChild(li); return i;
    }
    ajout = h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { ligneSous(null).focus(); majAjout(); }, text: '+ Sous-rubrique' });
    (r ? r.sous : []).forEach(ligneSous); majAjout();
    var err = h('p', { class: 'message-erreur', role: 'alert' });
    var form = h('form', { class: 'form-carte rub-form', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); err.textContent = '';
      if (nom.value.trim().length < 2) { err.textContent = 'Donnez un nom à la rubrique.'; return; }
      var sous = Array.prototype.map.call(lignes.querySelectorAll('input'), function (i) { return { id: i.dataset.id || null, nom: i.value.trim() }; }).filter(function (s) { return s.nom; });
      action('enregistrer', r ? r.id : null, { nom: nom.value.trim(), emoji: emoji.value.trim(), couleur: couleur, sous: sous }, form.querySelector('[type=submit]'),
        r ? 'Rubrique modifiée.' : 'Rubrique créée : elle apparaît sur l\'accueil' + (e.commune ? ' de tous les services.' : '.'));
    } },
      h('div', { class: 'grille-2' }, champ('Nom de la rubrique', nom), champ('Emoji', emoji)), palette,
      h('div', { class: 'champ' }, h('label', { text: 'Couleur de la tuile' }), couleurs),
      h('div', { class: 'champ' }, h('label', { text: 'Sous-rubriques (' + e.maxSous + ' au plus)' }), lignes, ajout,
        r && r.utilisateurs ? h('small', { class: 'section__note', text: 'Les services qui l\'ont reprise suivent ces changements. Une sous-rubrique retirée : ses fiches passent dans « Autres ».' })
          : h('small', { class: 'section__note', text: 'Une sous-rubrique retirée : ses fiches passent dans « Autres ».' })),
      err, h('div', { class: 'gps-boutons' }, h('button', { class: 'bouton', type: 'submit', text: r ? 'Enregistrer' : 'Créer la rubrique' }),
        annuler ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: annuler, text: 'Annuler' }) : null));
    return form;
  }
  function partage(e, action, plein) {
    var bloc = h('div', { class: 'rub-partage' }, h('h3', { text: 'Rubriques des autres services' }));
    if (!e.annuaire) { bloc.appendChild(h('p', { class: 'section__note', text: 'Disponible quand le service utilise le moteur commun Cap NCHUG (après son rattachement) : vous pourrez alors reprendre les rubriques des autres services, et eux les vôtres.' })); return bloc; }
    bloc.appendChild(h('p', { class: 'section__note', text: 'Reprendre une rubrique d\'un autre service : vous obtenez sa structure (nom, sous-rubriques), vide, à remplir avec vos fiches. Si son service la modifie, la vôtre suit.' }));
    if (e.adoptees.length) bloc.appendChild(h('ul', { class: 'rub-liste' }, e.adoptees.map(function (r) {
      return h('li', { class: 'rub-item' }, pastille(r),
        h('div', { class: 'rub-item__texte' }, h('b', { text: r.nom }), h('small', { class: 'section__note', text: 'De ' + r.origine + (r.retiree ? ' (retirée par ce service : vous gardez sa structure)' : '') }), h('small', { class: 'section__note', text: listeSous(r) })),
        h('div', { class: 'gps-boutons' }, h('button', { type: 'button', class: 'bouton bouton--discret bouton--danger', onclick: function (ev) {
          if (!confirm('Retirer « ' + r.nom + ' » de votre accueil ?\n\nVos fiches restent gardées : elles reviendront si vous la reprenez.')) return;
          action('quitter', r.id, null, ev.currentTarget, 'Rubrique retirée de votre accueil.');
        }, text: 'Retirer' })));
    })));
    if (!e.catalogue.length) { bloc.appendChild(h('p', { class: 'vide', text: e.adoptees.length ? 'Aucune autre rubrique proposée pour l\'instant.' : 'Aucun autre service n\'a encore créé de rubrique.' })); return bloc; }
    var recherche = e.catalogue.length > 5 ? h('input', { type: 'search', placeholder: 'Chercher une rubrique ou un service…', 'aria-label': 'Chercher une rubrique' }) : null;
    var liste = h('ul', { class: 'rub-liste' });
    function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function remplir() {
      var f = recherche ? norm(recherche.value) : '';
      var l = e.catalogue.filter(function (r) { return !f || norm(r.nom + ' ' + r.origine + ' ' + listeSous(r)).indexOf(f) >= 0; });
      liste.replaceChildren.apply(liste, l.length ? l.map(function (r) {
        return h('li', { class: 'rub-item' }, pastille(r),
          h('div', { class: 'rub-item__texte' }, h('b', { text: r.nom }), h('small', { class: 'section__note', text: 'De ' + r.origine + (r.utilisateurs ? ' · reprise par ' + r.utilisateurs + ' service' + (r.utilisateurs > 1 ? 's' : '') : '') }), h('small', { class: 'section__note', text: listeSous(r) })),
          h('div', { class: 'gps-boutons' }, h('button', { type: 'button', class: 'bouton bouton--discret', disabled: plein, onclick: function (ev) {
            action('adopter', r.id, null, ev.currentTarget, '« ' + r.nom + ' » ajoutée à votre accueil : ouvrez la tuile pour la remplir.');
          }, text: 'Ajouter à mon service' })));
      }) : [h('li', { class: 'vide', text: 'Aucun résultat.' })]);
    }
    if (recherche) recherche.addEventListener('input', remplir);
    remplir();
    bloc.appendChild(h('h4', { text: 'Proposées' })); if (recherche) bloc.appendChild(recherche); bloc.appendChild(liste);
    if (plein) bloc.appendChild(h('p', { class: 'section__note', text: 'Maximum de ' + e.max + ' rubriques atteint : retirez-en une pour en ajouter.' }));
    return bloc;
  }

  /* ---------- Logo : réduit sur le téléphone (300 px, moins de 150 Ko) ---------- */
  function sectionLogo(g) {
    var fichier = h('input', { type: 'file', accept: 'image/png,image/jpeg', 'aria-label': 'Choisir le logo' });
    var apercu = h('div', { class: 'service-logo' }, h('img', { src: 'assets/logos/chu-guadeloupe.png', alt: 'CHU de la Guadeloupe', class: 'logo-chu logo-chu--petit' }));
    var etat = h('p', { class: 'section__note', role: 'status' }), pret = null;
    if (g.logo) { var c = A.stock.lire(CLE_LOGO); if (c && c.data) apercu.appendChild(h('img', { class: 'logo-service', alt: 'Logo actuel', src: 'data:' + c.type + ';base64,' + c.data })); }
    var envoi = h('button', { class: 'bouton', type: 'button', disabled: true, text: 'Envoyer le logo', onclick: function () {
      if (!pret) return; envoi.disabled = true; etat.textContent = 'Envoi…';
      appeler('logo_envoyer', { data: pret.data, type: pret.type }).then(function (r) {
        A.stock.ecrire(CLE_LOGO, { version: r.version, type: pret.type, data: pret.data }); A.stock.effacer(A.CLE.accueil); ouvrir('Logo enregistré : il apparaît sur l\'accueil de tous les agents.');
      }).catch(function (e) { envoi.disabled = false; if (!erreurSession(e)) etat.textContent = e.code === 'image_trop_lourde' ? 'Image trop lourde, même réduite : essayez une image plus simple.' : A.message(e.code); });
    } });
    fichier.addEventListener('change', function () {
      var f = fichier.files && fichier.files[0]; if (!f) return;
      etat.textContent = 'Préparation…';
      reduire(f).then(function (x) {
        pret = x; envoi.disabled = false; etat.textContent = 'Aperçu ci-dessus, à côté du logo du CHU (' + Math.round(x.data.length * 0.75 / 1024) + ' Ko).';
        var ancien = apercu.querySelector('.logo-service'); if (ancien) ancien.remove();
        apercu.appendChild(h('img', { class: 'logo-service', alt: 'Nouveau logo', src: 'data:' + x.type + ';base64,' + x.data }));
      }).catch(function () { etat.textContent = 'Image illisible : choisissez un fichier PNG ou JPEG.'; });
    });
    return h('section', { class: 'form-carte' }, h('h2', { text: 'Logo du service' }),
      h('p', { class: 'section__note', text: 'Facultatif. Il s\'affiche à côté du logo du CHU, qui reste toujours tel quel. Fond blanc ou transparent conseillé.' }),
      apercu, fichier, etat,
      h('div', { class: 'gps-boutons' }, envoi,
        g.logo ? h('button', { class: 'bouton bouton--discret bouton--danger', type: 'button', onclick: function (ev) {
          if (!confirm('Retirer le logo du service ?')) return; A.stock.effacer(CLE_LOGO); envoyer({ logo: null }, 'Logo retiré.', ev.currentTarget.parentNode);
        }, text: 'Retirer le logo' }) : null));
  }
  function reduire(f) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () {
        var e = Math.min(1, 300 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * e)); c.height = Math.max(1, Math.round(img.naturalHeight * e));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var type = f.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', d = c.toDataURL(type, 0.85);
        if (d.length > 200000) { type = 'image/jpeg'; var g = c.getContext('2d'), c2 = document.createElement('canvas'); c2.width = c.width; c2.height = c.height; var g2 = c2.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, c.width, c.height); g2.drawImage(c, 0, 0); d = c2.toDataURL(type, 0.8); }
        ok({ type: type, data: d.slice(d.indexOf(',') + 1) });
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('image')); };
      img.src = url;
    });
  }

  /* ---------- Import du plan : contrôle, aperçu, puis enregistrement ---------- */
  function sectionPlan(g, texteDessin) {
    var fichier = h('input', { type: 'file', accept: '.json,.gz,application/json', 'aria-label': 'Choisir le fichier du plan' });
    var rapport = h('div', { class: 'plan-import__rapport', 'aria-live': 'polite' }), apercu = h('div', { class: 'plan-import__apercu' }), texte = null;
    var enreg = h('button', { class: 'bouton', type: 'button', hidden: true, text: 'Enregistrer ce plan', onclick: function () {
      if (!texte) return;
      if (g.plan && !confirm('Remplacer le plan actuel ?\n\nLes noms et pièces déjà modifiés dans l\'appli suivent automatiquement les pièces du nouveau plan.')) return;
      enreg.disabled = true; enreg.textContent = 'Enregistrement…';
      appeler('plan_importer', { texte: texte, enregistrer: true }).then(function (r) {
        if (!r.enregistre) { montrer(r.rapport); enreg.disabled = false; enreg.textContent = 'Enregistrer ce plan'; return; }
        if (window.caches) caches.keys().then(function (k) { k.filter(function (x) { return x.indexOf('rea-donnees') === 0; }).forEach(function (x) { caches.delete(x); }); });
        ouvrir('Plan enregistré : il est en place dans la rubrique « Plan du service » pour tout le monde.');
      }).catch(function (e) { enreg.disabled = false; enreg.textContent = 'Enregistrer ce plan'; if (!erreurSession(e)) rapport.appendChild(h('p', { class: 'message-erreur', text: A.message(e.code) })); });
    } });
    function montrer(rp) {
      var st = rp.stats || {};
      rapport.replaceChildren.apply(rapport, [
        h('p', { class: rp.erreurs.length ? 'message-erreur' : 'flash', text: rp.erreurs.length ? '❌ ' + rp.erreurs.length + ' problème(s) à corriger avant l\'import.' : '✅ Plan lisible : ' + (st.pieces || 0) + ' pièces dont ' + (st.chambres || 0) + ' chambres, ' + (st.unites || 0) + ' unité(s).' }),
        rp.erreurs.length ? h('ul', { class: 'plan-import__liste plan-import__liste--ko' }, rp.erreurs.map(function (x) { return h('li', { text: x }); })) : null,
        rp.avertissements.length ? h('details', { open: !rp.erreurs.length }, h('summary', { text: rp.avertissements.length + ' point(s) à vérifier (n\'empêchent pas l\'import)' }),
          h('ul', { class: 'plan-import__liste' }, rp.avertissements.map(function (x) { return h('li', { text: x }); }))) : null].filter(Boolean));
      enreg.hidden = !!rp.erreurs.length;
    }
    function analyser(lecture) {
      rapport.replaceChildren(h('p', { class: 'section__note', text: 'Lecture et contrôle…' })); apercu.replaceChildren(); enreg.hidden = true; texte = null;
      lecture.then(function (t) {
        texte = t; var D = null; try { D = JSON.parse(t); } catch (e) { /* le moteur le dira */ }
        if (D && Array.isArray(D.pieces) && Array.isArray(D.viewBox) && window.ReaPlan) {
          try { window.ReaPlan.creer(apercu, { donnees: JSON.parse(t), reglages: {}, mode: 'texte' }); } catch (e) { apercu.replaceChildren(h('p', { class: 'section__note', text: 'Aperçu impossible : voir les problèmes ci-dessous.' })); }
        }
        return appeler('plan_importer', { texte: t });
      }).then(function (r) { if (r) montrer(r.rapport); })
        .catch(function (e) { if (!erreurSession(e)) rapport.replaceChildren(h('p', { class: 'message-erreur', text: e && e.code ? A.message(e.code) : 'Fichier illisible.' })); });
    }
    fichier.addEventListener('change', function () { var f = fichier.files && fichier.files[0]; if (f) analyser(lireFichier(f)); });
    if (texteDessin) setTimeout(function () { analyser(Promise.resolve(texteDessin)); }, 0);
    var retourDessin = texteDessin ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { window.ReaDessin.ouvrir({ retour: retourDuDessin }); }, text: '✏️ Revenir au dessin' }) : null;
    return h('section', { class: 'form-carte' }, h('h2', { text: 'Plan du service' }),
      h('p', { class: 'section__note', text: (g.plan ? 'Un plan est en place. ' : 'Pas encore de plan. ') + 'Trois façons de le préparer ; dans tous les cas, il est contrôlé et affiché en aperçu avant d\'être enregistré dans le Drive privé du service : jamais sur GitHub.' }),
      texteDessin ? h('p', { class: 'flash', text: '✏️ Plan dessiné dans l\'appli : contrôle ci-dessous.' }) : null,
      h('div', { class: 'plan-methodes' },
        h('div', { class: 'plan-methode' }, h('b', { text: '1. Dessiner dans l\'appli' }), h('span', { class: 'section__note', text: 'Sur une image ou un PDF du plan : rectangles, formes libres, baguette magique.' }),
          window.ReaDessin ? h('button', { class: 'bouton', type: 'button', onclick: function () { window.ReaDessin.ouvrir({ retour: retourDuDessin }); }, text: '✏️ Dessiner le plan' }) : null),
        h('div', { class: 'plan-methode' }, h('b', { text: '2. Faire convertir par Claude' }), h('span', { class: 'section__note', text: 'Sur votre propre compte Claude : ajoutez le skill, donnez-lui le plan (PDF ou photo), il rend le fichier .json à importer ici. Deux plans ? Donnez le plan simplifié (numéros des chambres) et le plan détaillé (utilisation des pièces) : il garde le simplifié et y ajoute les utilisations.' }),
          h('a', { class: 'bouton bouton--discret', href: 'outils/plan-cap-nchug.zip', download: 'plan-cap-nchug.zip', text: '⬇️ Télécharger le skill' }),
          h('a', { class: 'bouton bouton--discret', href: 'outils/consigne-plan-claude.txt', target: '_blank', rel: 'noopener', text: 'Consigne à copier (sans skill)' })),
        h('div', { class: 'plan-methode' }, h('b', { text: '3. Importer un fichier' }), h('span', { class: 'section__note', text: 'Un fichier .json au format Cap NCHUG (par exemple préparé avec Claude).' }), fichier)),
      apercu, rapport, enreg, retourDessin);
  }
  function retourDuDessin(texte) { if (texte) ouvrir(null, texte); else ouvrir(); }
  function lireFichier(f) {
    if (/\.gz$/i.test(f.name) && typeof DecompressionStream !== 'undefined') return new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return f.text();
  }

  window.ReaService = { ouvrir: function (f) { ouvrir(f); }, logo: logo, rubriquesCommunes: function () { rubriquesCommunes(); } };
})();
