/* Cap NCHUG · personnaliser le service (administrateur) : nom, message, date J, logo, rubriques, import du plan.
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
  function page(contenu) {
    A.afficher(h('div', { class: 'page page--large service-perso' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { A.ecranAccueil(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: 'Personnaliser le service' }), h('span', { class: 'entete__role', text: 'Administrateur' })),
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
  function ouvrir(flash) {
    init(); A.definirEcran(null);
    page(h('div', { class: 'squelette', style: 'height:300px;margin-top:16px' }));
    appeler('service_reglages').then(function (r) { dessiner(r, flash); })
      .catch(function (e) { if (!erreurSession(e)) page(h('p', { class: 'vide', text: A.message(e.code) })); });
  }
  function dessiner(r, flash) {
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
    } }, h('h2', { text: 'Rubriques' }), h('p', { class: 'section__note', text: 'Choisissez ce qui s\'affiche sur l\'accueil. Un petit service peut n\'en garder que deux ou trois ; le Défi CHU et les actualités restent toujours visibles.' }),
      h('div', { class: 'service-cases' }, cases), h('button', { class: 'bouton', type: 'submit', text: 'Enregistrer' }));

    page(h('div', null, flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null, identite, sectionLogo(g), rubriques, sectionPlan(g)));
  }
  function envoyer(d, flash, form) {
    var b = form.querySelector('[type=submit]'); if (b) b.disabled = true;
    return appeler('service_reglages', { donnees: d }).then(function () { A.stock.effacer(A.CLE.accueil); ouvrir(flash); })
      .catch(function (e) { if (b) b.disabled = false; if (!erreurSession(e)) A.alerteDouce(form, A.message(e.code)); });
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
  function sectionPlan(g) {
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
      rapport.replaceChildren(
        h('p', { class: rp.erreurs.length ? 'message-erreur' : 'flash', text: rp.erreurs.length ? '❌ ' + rp.erreurs.length + ' problème(s) à corriger avant l\'import.' : '✅ Plan lisible : ' + (st.pieces || 0) + ' pièces dont ' + (st.chambres || 0) + ' chambres, ' + (st.unites || 0) + ' unité(s).' }),
        rp.erreurs.length ? h('ul', { class: 'plan-import__liste plan-import__liste--ko' }, rp.erreurs.map(function (x) { return h('li', { text: x }); })) : null,
        rp.avertissements.length ? h('details', { open: !rp.erreurs.length }, h('summary', { text: rp.avertissements.length + ' point(s) à vérifier (n\'empêchent pas l\'import)' }),
          h('ul', { class: 'plan-import__liste' }, rp.avertissements.map(function (x) { return h('li', { text: x }); }))) : null);
      enreg.hidden = !!rp.erreurs.length;
    }
    fichier.addEventListener('change', function () {
      var f = fichier.files && fichier.files[0]; if (!f) return;
      rapport.replaceChildren(h('p', { class: 'section__note', text: 'Lecture et contrôle…' })); apercu.replaceChildren(); enreg.hidden = true; texte = null;
      lireFichier(f).then(function (t) {
        texte = t; var D = null; try { D = JSON.parse(t); } catch (e) { /* le moteur le dira */ }
        if (D && Array.isArray(D.pieces) && Array.isArray(D.viewBox) && window.ReaPlan) {
          try { window.ReaPlan.creer(apercu, { donnees: JSON.parse(t), reglages: {}, mode: 'texte' }); } catch (e) { apercu.replaceChildren(h('p', { class: 'section__note', text: 'Aperçu impossible : voir les problèmes ci-dessous.' })); }
        }
        return appeler('plan_importer', { texte: t });
      }).then(function (r) { if (r) montrer(r.rapport); })
        .catch(function (e) { if (!erreurSession(e)) rapport.replaceChildren(h('p', { class: 'message-erreur', text: e && e.code ? A.message(e.code) : 'Fichier illisible.' })); });
    });
    return h('section', { class: 'form-carte' }, h('h2', { text: 'Plan du service' }),
      h('p', { class: 'section__note', text: (g.plan ? 'Un plan est en place. ' : 'Pas encore de plan. ') + 'Importez le fichier du plan (.json, préparé avec Claude ou l\'outil de dessin). Il est contrôlé et affiché en aperçu avant d\'être enregistré dans le Drive privé du service : jamais sur GitHub.' }),
      fichier, apercu, rapport, enreg);
  }
  function lireFichier(f) {
    if (/\.gz$/i.test(f.name) && typeof DecompressionStream !== 'undefined') return new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return f.text();
  }

  window.ReaService = { ouvrir: function (f) { ouvrir(f); }, logo: logo };
})();
