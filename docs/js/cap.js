/* Cap NCHUG · plusieurs services dans une seule appli.
   - Choix du service (liste retenue sur le téléphone, ou lien direct ?s=identifiant / QR code du service).
   - Espace créateurs : super-administrateur et admins créateurs (créer un service, codes perdus, créateurs).
   - Codes d'accès du service, gérés dans l'appli par son administrateur (aucun accès Google nécessaire). */
(function () {
  'use strict';
  var A, h, Api;
  var CLE_SERVICE = 'rea.service', CLE_LISTE = 'rea.services-liste', CLE_CAP = 'rea.cap-session';
  var GARDER = { 'rea.service': 1, 'rea.services-liste': 1, 'rea.cap-session': 1, 'rea.gps-averti': 1, 'rea.appareil': 1, 'rea.defi': 1 }; // le Défi CHU est commun : une seule réponse par téléphone, quel que soit le service

  function init() { A = window.ReaApp; h = A.h; Api = window.ReaApi; }
  function lire(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function ecrire(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage bloqué */ } }
  function lienService(id) { return location.origin + location.pathname.replace(/index\.html$/, '') + '?s=' + encodeURIComponent(id); }

  function page(titre, sous, contenu, retour) {
    A.afficher(h('div', { class: 'page page--large cap' },
      h('header', { class: 'entete entete--module' },
        retour ? h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { retour(); }, text: '‹' }) : null,
        h('h1', { class: 'entete__titre', text: titre }),
        sous ? h('span', { class: 'entete__role', text: sous }) : null),
      contenu));
    window.scrollTo(0, 0);
  }
  function codeAffiche(titre, code, aide) { // un code n'est montré qu'une fois
    return h('div', { class: 'cap-code', role: 'status' },
      h('p', { class: 'cap-code__titre', text: titre }),
      h('p', { class: 'cap-code__valeur', text: code }),
      h('p', { class: 'cap-code__aide', text: aide || 'Notez-le maintenant : il ne sera plus jamais affiché (il n\'est conservé que chiffré).' }),
      h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function (ev) {
        var b = ev.currentTarget; try { navigator.clipboard.writeText(code).then(function () { b.textContent = 'Copié ✓'; }); } catch (e) { b.textContent = 'Copie impossible : notez-le'; }
      }, text: 'Copier' }));
  }
  function erreurDe(e) { return A.message(e && e.code); }

  /* ---------- Service courant ---------- */
  function serviceCourant() { return lire(CLE_SERVICE); }
  function choisir(s) {
    var avant = serviceCourant();
    if (avant && avant.id !== s.id) effacerDonneesLocales(); // nouveau service : les données de l'ancien quittent le téléphone
    var x = { id: s.id, nom: s.nom, api: s.api || null };
    ecrire(CLE_SERVICE, x); Api.choisirService(x);
    return x;
  }
  function effacerDonneesLocales() { try { Object.keys(localStorage).forEach(function (k) { if (/^rea\./.test(k) && !GARDER[k] && !/^rea\.demo\./.test(k)) localStorage.removeItem(k); }); } catch (e) { /* ignoré */ } }
  function changerService() { // le service reste noté jusqu'au choix d'un autre : ses données sont alors effacées du téléphone
    A.stock.effacer(A.CLE.session); ecranServices();
  }
  function listeServices() { // services du moteur commun + services sur leur propre moteur (config.js)
    var ext = Api.externes.map(function (s) { return { id: s.id, nom: s.nom, api: s.api }; });
    return Api.appeler('services').then(function (r) {
      var l = ext.concat(r.services.filter(function (s) { return !ext.some(function (x) { return x.id === s.id; }); }));
      ecrire(CLE_LISTE, l); return l;
    }, function (e) { var c = lire(CLE_LISTE); if (c && c.length) return c; if (ext.length) return ext; throw e; });
  }

  /* ---------- Écran : choisir son service ---------- */
  function ecranServices(flash) {
    init(); A.definirEcran(null);
    var zone = h('div', { class: 'cap-services' }, h('div', { class: 'squelette', style: 'height:220px' }));
    A.afficher(h('section', { class: 'connexion cap-accueil', 'aria-labelledby': 'titre-cap' },
      h('div', { class: 'connexion__carte' },
        h('div', { class: 'logos logos--connexion' }, h('img', { class: 'logo-chu', src: 'assets/logos/chu-guadeloupe.png', alt: 'CHU de la Guadeloupe', width: '360', height: '279' })),
        h('p', { class: 'cap-marque', text: 'Cap NCHUG' }),
        h('h1', { id: 'titre-cap', text: 'Choisissez votre service' }),
        h('p', { class: 'connexion__intro', text: 'Plan, quiz, visites et jeux pour préparer l\'installation dans le nouveau CHU. Votre choix est retenu sur ce téléphone.' }),
        flash ? h('p', { class: 'message-erreur', role: 'alert', text: flash }) : null,
        zone,
        h('p', { class: 'connexion__pied' }, h('button', { type: 'button', class: 'lien-discret', onclick: function () { ecranAnnuaire(); }, text: 'Espace créateurs' })))));
    listeServices().then(function (l) {
      if (!l.length) { zone.replaceChildren(h('p', { class: 'vide', text: 'Aucun service n\'est encore ouvert.' })); return; }
      var filtre = h('input', { type: 'search', class: 'cap-filtre', placeholder: 'Rechercher un service', 'aria-label': 'Rechercher un service', autocomplete: 'off' });
      var ul = h('ul', { class: 'cap-liste' });
      function dessiner() {
        var q = filtre.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        ul.replaceChildren.apply(ul, l.filter(function (s) { return !q || s.nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(q) >= 0; }).map(function (s) {
          return h('li', null, h('button', { type: 'button', class: 'cap-service', onclick: function () { choisir(s); A.ecranConnexion(); } }, h('span', { text: s.nom }), h('span', { 'aria-hidden': 'true', text: '›' })));
        }));
      }
      filtre.addEventListener('input', dessiner); dessiner();
      zone.replaceChildren.apply(zone, [l.length > 6 ? filtre : null, ul].filter(Boolean));
    }).catch(function (e) {
      zone.replaceChildren(h('p', { class: 'message-erreur', text: erreurDe(e) }), h('button', { class: 'bouton', type: 'button', onclick: function () { ecranServices(); }, text: 'Réessayer' }));
    });
  }

  /* Lien direct : ?s=identifiant (ou #s=) ; renvoie true si un service a été choisi par le lien */
  function lireLien() {
    var m = /[?&#]s=([a-z0-9-]{2,24})/.exec(location.search + location.hash);
    if (!m) return null;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignoré */ }
    return m[1];
  }
  function historique() { // config.js : SERVICE_HISTORIQUE = 'rea'
    var id = (window.REA_CONFIG || {}).SERVICE_HISTORIQUE; if (!id) return null;
    try { return Object.keys(localStorage).some(function (k) { return /^rea\./.test(k) && !/^rea\.(demo|services-liste|cap-session)/.test(k); }) ? id : null; } catch (e) { return null; }
  }
  function demarrer(suite) { // suite() : écran normal de l'appli (accueil ou connexion)
    init();
    var id = lireLien(), cour = serviceCourant();
    if (id && (!cour || cour.id !== id)) {
      A.afficher(h('div', { class: 'page' }, h('div', { class: 'squelette', style: 'height:240px' })));
      return listeServices().then(function (l) {
        var s = l.filter(function (x) { return x.id === id; })[0];
        if (!s) return ecranServices('Ce lien ne correspond à aucun service ouvert. Choisissez votre service.');
        A.stock.effacer(A.CLE.session); choisir(s); A.ecranConnexion();
      }).catch(function () { ecranServices('Pas de connexion : impossible d\'ouvrir ce lien pour le moment.'); });
    }
    if (!cour && historique()) { // téléphone qui utilisait déjà l'appli de la réa avant Cap NCHUG : on garde son service
      A.afficher(h('div', { class: 'page' }, h('div', { class: 'squelette', style: 'height:240px' })));
      return listeServices().then(function (l) {
        var s = l.filter(function (x) { return x.id === historique(); })[0];
        if (!s) return ecranServices();
        A.stock.effacer(A.CLE.session); choisir(s); A.ecranConnexion('Votre appli fait maintenant partie de Cap NCHUG : saisissez votre code habituel.');
      }).catch(function () { ecranServices(); });
    }
    if (!cour) return ecranServices();
    Api.choisirService(cour);
    suite();
  }

  /* ---------- Espace créateurs (super-administrateur, admins créateurs) ---------- */
  function ecranAnnuaire(flash) {
    init();
    var s = lire(CLE_CAP);
    if (s && Date.parse(s.expiration) > Date.now()) return annuaire(s, flash);
    var champ = h('input', { id: 'code-cap', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '32', required: true });
    var err = h('p', { class: 'message-erreur', role: 'alert', text: flash || '' }), b = h('button', { class: 'bouton', type: 'submit', text: 'Entrer' });
    page('Espace créateurs', 'Cap NCHUG', h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); err.textContent = ''; b.disabled = true;
      Api.appeler('annuaire_login', { code: champ.value }).then(function (r) { var x = { jeton: r.jeton, role: r.role, libelle: r.libelle, expiration: r.expiration }; ecrire(CLE_CAP, x); annuaire(x); })
        .catch(function (e) { err.textContent = erreurDe(e); b.disabled = false; champ.select(); });
    } },
      h('p', { class: 'section__note', text: 'Réservé au super-administrateur et aux admins créateurs de services. Les soignants n\'ont rien à faire ici.' }),
      h('div', { class: 'champ' }, h('label', { for: 'code-cap', text: 'Code créateur' }), champ), b, err), function () { ecranServices(); });
    setTimeout(function () { champ.focus(); }, 50);
  }
  function annuaire(sess, flash, montre) {
    var zone = h('div', null, h('div', { class: 'squelette', style: 'height:260px' }));
    page('Espace créateurs', sess.libelle, zone, function () { ecranServices(); });
    Api.appeler('annuaire_etat', { jeton: sess.jeton }).then(function (e) { dessinerAnnuaire(zone, sess, e, flash, montre); }).catch(function (e) {
      if (A.ERREURS_SESSION.indexOf(e.code) >= 0) { ecrire(CLE_CAP, null); return ecranAnnuaire(erreurDe(e)); }
      zone.replaceChildren(h('p', { class: 'message-erreur', text: erreurDe(e) }), h('button', { class: 'bouton', type: 'button', onclick: function () { annuaire(sess); }, text: 'Réessayer' }));
    });
  }
  function dessinerAnnuaire(zone, sess, e, flash, montre) {
    function action(nom, d, apres) {
      return Api.appeler(nom, Object.assign({ jeton: sess.jeton }, d)).then(apres).catch(function (x) { annuaire(sess, erreurDe(x)); });
    }
    var nomNv = h('input', { type: 'text', maxlength: '60', placeholder: 'ex. Cardiologie', 'aria-label': 'Nom du nouveau service' });
    var creer = h('form', { class: 'form-carte', onsubmit: function (ev) {
      ev.preventDefault(); var nom = nomNv.value.trim(); if (nom.length < 2) return;
      var b = creer.querySelector('button'); b.disabled = true; b.textContent = 'Création… (environ 20 s)';
      action('service_creer', { donnees: { nom: nom } }, function (r) {
        annuaire(sess, null, h('div', { class: 'cap-cree' },
          h('h3', { text: '✅ Service « ' + r.service.nom + ' » créé' }),
          h('p', { class: 'section__note', text: 'Transmettez ces deux codes à l\'administrateur du service. Il pourra ensuite les changer, et nommer ses référents, depuis l\'appli (tuile Administration).' }),
          codeAffiche('Code ADMINISTRATEUR du service', r.codes.admin), codeAffiche('Code des AGENTS du service', r.codes.agents),
          blocLien(r.service)));
      });
    } }, h('h2', { text: 'Créer un service' }), h('div', { class: 'champ' }, h('label', { text: 'Nom du service' }), nomNv),
      h('button', { class: 'bouton', type: 'submit', text: 'Créer le service' }),
      h('p', { class: 'section__note', text: 'Un Google Sheets privé est créé pour le service sur le compte Cap NCHUG. Aucune manipulation Google n\'est nécessaire.' }));

    var services = h('section', { class: 'section' }, h('div', { class: 'section__tete' }, h('h2', { text: 'Services (' + e.services.length + ')' })),
      e.services.length ? h('ul', { class: 'liste-simple cap-admin-liste' }, e.services.map(function (s) {
        return h('li', { class: s.actif ? '' : 'cap-inactif' },
          h('div', { class: 'cap-ligne' }, h('b', { text: s.nom }), h('span', { class: 'section__note', text: (s.actif ? '' : 'Fermé · ') + 'créé le ' + (s.cree || '?') + (s.par ? ' par ' + s.par : '') })),
          h('div', { class: 'gps-boutons' },
            h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { annuaire(sess, null, h('div', { class: 'cap-cree' }, h('h3', { text: s.nom }), blocLien(s))); }, text: 'Lien et QR' }),
            h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { if (confirm('Créer un nouveau code ADMINISTRATEUR pour « ' + s.nom + ' » ? L\'ancien ne marchera plus.')) action('service_code', { id: s.id, quoi: 'admin' }, function (r) { annuaire(sess, null, codeAffiche('Nouveau code ADMINISTRATEUR · ' + s.nom, r.code)); }); }, text: 'Code admin perdu' }),
            h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { var n = prompt('Nouveau nom du service', s.nom); if (n && n.trim().length >= 2) action('service_modifier', { id: s.id, donnees: { nom: n.trim() } }, function () { annuaire(sess, 'Nom modifié.'); }); }, text: 'Renommer' }),
            e.role === 'super' ? h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () {
              if (!s.actif || confirm('Fermer « ' + s.nom + ' » ? Ses utilisateurs ne pourront plus se connecter (rien n\'est effacé, vous pourrez le rouvrir).'))
                action('service_modifier', { id: s.id, donnees: { actif: !s.actif } }, function () { annuaire(sess, s.actif ? 'Service fermé.' : 'Service rouvert.'); });
            }, text: s.actif ? 'Fermer' : 'Rouvrir' }) : null,
            s.lienSheets ? h('a', { class: 'bouton bouton--discret', href: s.lienSheets, target: '_blank', rel: 'noopener', text: 'Google Sheets' }) : null));
      })) : h('p', { class: 'vide', text: 'Aucun service pour l\'instant.' }));

    var createurs = null;
    if (e.createurs) {
      var nomC = h('input', { type: 'text', maxlength: '60', placeholder: 'ex. Sophie L. – cadre', 'aria-label': 'Nom du créateur' });
      createurs = h('section', { class: 'section' }, h('div', { class: 'section__tete' }, h('h2', { text: 'Admins créateurs' })),
        h('ul', { class: 'liste-simple' }, e.createurs.map(function (c) {
          return h('li', { class: c.actif ? '' : 'cap-inactif' }, h('div', { class: 'cap-ligne' }, h('b', { text: c.nom }), h('span', { class: 'section__note', text: c.actif ? 'Actif' : 'Désactivé' })),
            h('div', { class: 'gps-boutons' },
              h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { action('createur', { nom: c.nom }, function (r) { annuaire(sess, null, codeAffiche('Nouveau code créateur · ' + c.nom, r.code)); }); }, text: c.actif ? 'Nouveau code' : 'Réactiver' }),
              c.actif ? h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { action('createur', { nom: c.nom, actif: false }, function () { annuaire(sess, c.nom + ' est désactivé.'); }); }, text: 'Désactiver' }) : null));
        })),
        h('form', { class: 'form-carte', onsubmit: function (ev) { ev.preventDefault(); var n = nomC.value.trim(); if (!n) return; action('createur', { nom: n }, function (r) { annuaire(sess, null, codeAffiche('Code créateur · ' + n, r.code, 'Transmettez-le en main propre. Il ne sera plus affiché.')); }); } },
          h('div', { class: 'champ' }, h('label', { text: 'Nommer un admin créateur' }), nomC), h('button', { class: 'bouton', type: 'submit', text: 'Créer son code' })));
    }
    zone.replaceChildren.apply(zone, [
      flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
      montre || null,
      window.ReaDefiGestion ? h('section', { class: 'section defi-carte' }, h('div', { class: 'section__tete' }, h('h2', { text: '🏆 Défi CHU' })),
        h('p', { class: 'section__note', text: 'Questions communes à tous les services : phase de test, validation, ajout de questions, vue du ciel du Parcours.' }),
        h('button', { type: 'button', class: 'bouton', onclick: function () { window.ReaDefiGestion.ouvrir({ jeton: sess.jeton, role: sess.libelle || '', retour: function (m) { annuaire(sess, m || null); } }); }, text: 'Gérer le Défi CHU' })) : null,
      creer, services, e.role === 'super' ? rattacher(sess) : null, createurs,
      h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { ecrire(CLE_CAP, null); ecranServices(); }, text: 'Quitter l\'espace créateurs' })].filter(Boolean));
  }
  /* Rattacher un service qui a son propre moteur (la réa) : il garde ses données, ses codes et son Google Sheets */
  function rattacher(sess) {
    var lien = h('input', { type: 'url', placeholder: 'https://docs.google.com/spreadsheets/d/…', 'aria-label': 'Lien du Google Sheets du service' });
    var ident = h('input', { type: 'text', maxlength: '24', value: 'rea', 'aria-label': 'Identifiant du service' });
    var nom = h('input', { type: 'text', maxlength: '60', value: 'Réanimation – USC', 'aria-label': 'Nom du service' });
    var cle = h('input', { type: 'text', maxlength: '30', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX', 'aria-label': 'Clé à usage unique' });
    var err = h('p', { class: 'message-erreur', role: 'alert' }), b = h('button', { class: 'bouton', type: 'submit', text: 'Rattacher le service' });
    var form = h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); err.textContent = ''; b.disabled = true; b.textContent = 'Rattachement… (environ 20 s)';
      Api.appeler('service_rattacher', { jeton: sess.jeton, donnees: { sheets: lien.value.trim(), id: ident.value.trim(), nom: nom.value.trim(), cle: cle.value } }).then(function (r) {
        annuaire(sess, null, h('div', { class: 'cap-cree' },
          h('h3', { text: '✅ « ' + r.service.nom + ' » a rejoint Cap NCHUG' }),
          h('p', { class: 'section__note', text: 'Les codes ne changent pas : chacun ressaisit simplement son code une fois. L\'ancien moteur du service répond désormais « service déplacé ».' }),
          r.defi ? h('p', { class: 'section__note', text: r.defi }) : null,
          (r.avertissements || []).map(function (a) { return h('p', { class: 'message-erreur', text: '⚠ ' + a }); }),
          blocLien(r.service)));
      }).catch(function (x) { b.disabled = false; b.textContent = 'Rattacher le service'; if (A.ERREURS_SESSION.indexOf(x && x.code) >= 0) { ecrire(CLE_CAP, null); return ecranAnnuaire(erreurDe(x)); } err.textContent = erreurDe(x); });
    } },
      h('p', { class: 'section__note', text: 'Pour un service qui a déjà son propre moteur (la réa). Dans son Google Sheets : menu « Préparer le rattachement à Cap NCHUG », puis partagez ce Google Sheets et son dossier Drive avec le compte dédié (éditeur).' }),
      h('div', { class: 'champ' }, h('label', { text: 'Lien du Google Sheets « Base » du service' }), lien),
      h('div', { class: 'grille-2' }, h('div', { class: 'champ' }, h('label', { text: 'Identifiant' }), ident), h('div', { class: 'champ' }, h('label', { text: 'Nom' }), nom)),
      h('div', { class: 'champ' }, h('label', { text: 'Clé à usage unique' }), cle), err, b);
    return h('details', { class: 'section defi-ajout' }, h('summary', { text: 'Rattacher un service existant (la réa)' }), form);
  }
  function blocLien(s) {
    var url = lienService(s.id), boite = h('div', { class: 'cap-qr', 'aria-label': 'QR code du service' });
    chargerScript('vendor/qrcode.js').then(function () {
      var q = window.qrcode(0, 'M'); q.addData(url); q.make();
      boite.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    }).catch(function () { boite.textContent = 'QR code indisponible hors ligne.'; });
    return h('div', { class: 'cap-lien' },
      h('p', { class: 'section__note', text: 'Lien direct du service (à afficher, envoyer ou imprimer) : il ouvre l\'appli directement sur ce service.' }),
      h('p', { class: 'cap-url', text: url }),
      h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function (ev) { var b = ev.currentTarget; try { navigator.clipboard.writeText(url).then(function () { b.textContent = 'Lien copié ✓'; }); } catch (e) { /* ignoré */ } }, text: 'Copier le lien' }),
      boite);
  }
  var scripts = {};
  function chargerScript(src) {
    return scripts[src] || (scripts[src] = new Promise(function (ok, ko) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { delete scripts[src]; ko(); }; document.head.appendChild(s); }));
  }

  /* ---------- Administration du service : codes d'accès ---------- */
  function ecranCodes(flash, montre) {
    init(); A.definirEcran(null);
    var session = A.stock.lire(A.CLE.session); if (!session) return A.ecranConnexion();
    var zone = h('div', null, h('div', { class: 'squelette', style: 'height:240px' }));
    page('Administration', 'Codes d\'accès', zone, function () { A.ecranAccueil(); });
    function changer(quoi, nom, titre) {
      return Api.appeler('codes_changer', { jeton: session.jeton, quoi: quoi, nom: nom }).then(function (r) {
        if (quoi === 'deconnecter') { A.stock.effacer(A.CLE.session); return A.ecranConnexion('Tout le monde a été déconnecté, vous aussi.'); }
        ecranCodes(r.code ? null : 'Enregistré.', r.code ? codeAffiche(titre, r.code) : null);
      }).catch(function (e) { ecranCodes(erreurDe(e)); });
    }
    Api.appeler('codes_etat', { jeton: session.jeton }).then(function (e) {
      var nomR = h('input', { type: 'text', maxlength: '60', placeholder: 'ex. Marie D. – IDE', 'aria-label': 'Nom du référent' });
      zone.replaceChildren.apply(zone, [
        flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null, montre || null,
        h('section', { class: 'section form-carte' }, h('h2', { text: 'Code des agents' }),
          h('p', { class: 'section__note', text: 'Un code commun à toute l\'équipe. En le changeant, les agents déjà connectés le restent ; les nouveaux devront utiliser le nouveau code.' }),
          h('button', { type: 'button', class: 'bouton', onclick: function () { if (confirm('Créer un nouveau code pour les agents ? L\'ancien ne permettra plus de se connecter.')) changer('agents', null, 'Nouveau code des AGENTS'); }, text: 'Nouveau code agents' })),
        h('section', { class: 'section form-carte' }, h('h2', { text: 'Référents' }),
          e.referents.length ? h('ul', { class: 'liste-simple' }, e.referents.map(function (r) {
            return h('li', { class: r.actif ? '' : 'cap-inactif' }, h('div', { class: 'cap-ligne' }, h('b', { text: r.nom }), h('span', { class: 'section__note', text: r.actif ? 'Actif' : 'Désactivé' })),
              h('div', { class: 'gps-boutons' },
                h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { changer('referent', r.nom, 'Code de ' + r.nom); }, text: r.actif ? 'Nouveau code' : 'Réactiver' }),
                r.actif ? h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { if (confirm('Désactiver ' + r.nom + ' ? Sa session est coupée immédiatement.')) changer('referent_off', r.nom); }, text: 'Désactiver' }) : null));
          })) : h('p', { class: 'vide', text: 'Aucun référent pour l\'instant.' }),
          h('form', { onsubmit: function (ev) { ev.preventDefault(); var n = nomR.value.trim(); if (n) changer('referent', n, 'Code de ' + n); } },
            h('div', { class: 'champ' }, h('label', { text: 'Ajouter un référent (prénom, initiale, fonction)' }), nomR), h('button', { class: 'bouton', type: 'submit', text: 'Créer son code' }))),
        e.compteurs ? h('section', { class: 'section form-carte' }, h('h2', { text: 'Compteurs' }),
          h('p', { class: 'section__note', text: 'Remettre à zéro, par exemple après une phase d\'essai. Les badges et records restent sur les téléphones de chacun.' }),
          h('ul', { class: 'liste-simple' },
            h('li', null, h('div', { class: 'cap-ligne' }, h('b', { text: 'Quiz : défi d\'équipe' }), h('span', { class: 'section__note', text: e.compteurs.quiz.toLocaleString('fr-FR') + ' réponses' })),
              h('button', { type: 'button', class: 'bouton bouton--discret', disabled: !e.compteurs.quiz, onclick: function () { if (confirm('Remettre à zéro le compteur du quiz (' + e.compteurs.quiz + ' réponses) ?\n\nLa jauge d\'élan baissera d\'autant.')) changer('raz_quiz'); }, text: 'Remettre à zéro' })),
            h('li', null, h('div', { class: 'cap-ligne' }, h('b', { text: 'Points des jeux' }), h('span', { class: 'section__note', text: e.compteurs.jeux.toLocaleString('fr-FR') + ' points' })),
              h('button', { type: 'button', class: 'bouton bouton--discret', disabled: !e.compteurs.jeux, onclick: function () { if (confirm('Remettre à zéro les points des jeux (' + e.compteurs.jeux + ') ?')) changer('raz_jeux'); }, text: 'Remettre à zéro' }))),
          h('p', { class: 'section__note', text: 'La jauge d\'élan additionne ces deux compteurs. Les scores du Défi CHU se remettent à zéro dans « Gestion du Défi CHU ».' })) : null,
        h('section', { class: 'section form-carte' }, h('h2', { text: 'Sécurité' }),
          h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { if (confirm('Créer un nouveau code ADMINISTRATEUR ? Votre code actuel ne marchera plus.')) changer('admin', null, 'Votre nouveau code ADMINISTRATEUR'); }, text: 'Changer mon code administrateur' }),
          h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { if (confirm('Déconnecter tout le monde ? Chacun devra ressaisir son code (à faire si un code a fuité, après l\'avoir changé).')) changer('deconnecter'); }, text: 'Déconnecter tout le monde' }))
      ].filter(Boolean));
    }).catch(function (e) {
      if (A.ERREURS_SESSION.indexOf(e.code) >= 0) { A.stock.effacer(A.CLE.session); return A.ecranConnexion(erreurDe(e)); }
      zone.replaceChildren(h('p', { class: 'message-erreur', text: erreurDe(e) }));
    });
  }

  // Service fermé par le super-administrateur : retour à la liste
  window.addEventListener('rea:service-ferme', function () { init(); effacerDonneesLocales(); ecrire(CLE_SERVICE, null); Api.choisirService(null); ecranServices(A.message('service_inconnu')); });

  window.ReaCap = { demarrer: demarrer, ecranServices: ecranServices, changerService: changerService, serviceCourant: serviceCourant, ecranAnnuaire: ecranAnnuaire, ecranCodes: ecranCodes, lienService: lienService };
})();
