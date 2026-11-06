/* Réa – Nouveau CHU · application (étape 1 : connexion et accueil) */
(function () {
  'use strict';

  var Api = window.ReaApi;
  var cfg = window.REA_CONFIG || {};
  var FUSEAU = 'America/Guadeloupe';
  var CLE = { session: 'rea.session', accueil: 'rea.accueil', badges: 'rea.badges', planVu: 'rea.plan-vu', planMode: 'rea.plan-mode' };
  var app = document.getElementById('app');
  var zoneBandeaux = document.getElementById('bandeaux');

  /* ---------- Stockage local protégé (navigation privée, stockage bloqué…) ---------- */
  var stock = {
    lire: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    ecrire: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignoré */ } },
    effacer: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignoré */ } }
  };

  /* ---------- Construction DOM sûre (jamais d'innerHTML avec des données) ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) ajouter(el, arguments[i]);
    return el;
  }
  function ajouter(el, enfant) {
    if (enfant == null || enfant === false) return;
    if (Array.isArray(enfant)) return enfant.forEach(function (c) { ajouter(el, c); });
    el.appendChild(typeof enfant === 'string' ? document.createTextNode(enfant) : enfant);
  }
  function svg(markup) { // icônes internes uniquement (constantes)
    var tpl = document.createElement('template'); tpl.innerHTML = markup.trim(); return tpl.content.firstChild;
  }
  function afficher(noeud) { app.replaceChildren(noeud); }

  /* ---------- Icônes filaires (style des pictogrammes de la charte) ---------- */
  var I = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var ICONES = {
    plan: I('<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>'),
    visites: I('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="M9 15l2 2 4-4"/>'),
    quiz: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5h.01"/>'),
    simulations: I('<path d="M3 12h4l2-5 4 10 2-5h6"/>'),
    docs: I('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>'),
    pret: I('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>'),
    cadenas: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    etoile: I('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>')
  };

  var MODULES = [
    { id: 'plan', nom: 'Plan du service', desc: 'Chambres, postes de soins, bureaux, garde, vestiaires…', etape: 2, ouvrir: function () { ecranPlan(); } },
    { id: 'visites', nom: 'Visites des locaux', desc: 'Réserver un créneau pour découvrir le service', etape: 3 },
    { id: 'quiz', nom: 'Quiz', desc: 'Vérifier ce que l\'on sait du nouveau service', etape: 4 },
    { id: 'simulations', nom: 'Simulations in situ', desc: 'S\'entraîner aux situations critiques sur place', etape: 5 },
    { id: 'docs', nom: 'Documents et FAQ', desc: 'Procédures, annuaire, questions-réponses', etape: 6 },
    { id: 'pret', nom: 'Je suis prêt(e)', desc: 'Ma check-list personnelle avant le jour J', etape: 6 }
  ];

  var BADGES = [
    { id: 'visite', nom: 'Visite faite' },
    { id: 'plan', nom: 'Plan exploré' },
    { id: 'quiz', nom: 'Quiz réussi' },
    { id: 'simulation', nom: 'Simulation' },
    { id: 'pret', nom: 'Prêt(e) !' }
  ];

  var MESSAGES = {
    code_manquant: 'Saisissez votre code.',
    code_incorrect: 'Ce code n\'est pas reconnu. Vérifiez-le auprès de votre cadre ou d\'un référent.',
    trop_de_tentatives: 'Trop d\'essais incorrects. Réessayez dans 5 minutes.',
    session_absente: 'Votre session a expiré. Saisissez à nouveau votre code.',
    session_invalide: 'Votre session a expiré. Saisissez à nouveau votre code.',
    session_expiree: 'Votre session a expiré. Saisissez à nouveau votre code.',
    non_installe: 'L\'application n\'est pas encore installée. Prévenez l\'administrateur.',
    reseau: 'Pas de connexion au serveur. Vérifiez le réseau puis réessayez.',
    plan_absent: 'Le plan n\'est pas encore installé. Prévenez l\'administrateur.',
    non_autorise: 'Seuls les référents peuvent modifier le plan.',
    requete_invalide: 'Certaines informations ne sont pas valides. Vérifiez la saisie.',
    erreur_serveur: 'Le serveur a rencontré un problème. Réessayez dans un instant.'
  };
  function message(code) { return MESSAGES[code] || MESSAGES.erreur_serveur; }
  var ERREURS_SESSION = ['session_absente', 'session_invalide', 'session_expiree'];

  /* ---------- Dates (heure de la Guadeloupe) ---------- */
  function aujourdhuiIso() {
    var p = new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return p; // fr-CA donne AAAA-MM-JJ
  }
  function joursEntre(isoA, isoB) {
    var a = Date.UTC(+isoA.slice(0, 4), +isoA.slice(5, 7) - 1, +isoA.slice(8, 10));
    var b = Date.UTC(+isoB.slice(0, 4), +isoB.slice(5, 7) - 1, +isoB.slice(8, 10));
    return Math.round((b - a) / 864e5);
  }
  function dateLongue(iso) {
    var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12));
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  }
  function dateCourte(iso) {
    if (!iso) return '';
    var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12));
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(d);
  }
  function heureLocale(isoComplet) {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(isoComplet));
  }

  /* Texte du compte à rebours (‑ insécable pour ne jamais couper « J‑42 ») */
  function compteARebours(dateJ) {
    if (!dateJ) return { grand: 'Date J à définir', texte: true, sous: [ 'Elle s\'affichera ici dès qu\'elle sera fixée.' ] };
    var n = joursEntre(aujourdhuiIso(), dateJ);
    var quand = h('span', { class: 'horizon__date', text: dateLongue(dateJ) });
    if (n > 0) return { grand: 'J‑' + n, sous: [ 'avant le premier transfert, le ', quand ] };
    if (n === 0) return { grand: 'Jour J', texte: true, sous: [ 'Premiers transferts aujourd\'hui' ] };
    if (n >= -4) return { grand: 'J+' + (-n), sous: [ 'Transferts en cours depuis le ', quand ] };
    return { grand: 'J+' + (-n), sous: [ 'Installés dans le nouveau CHU depuis le ', quand ] };
  }

  /* ---------- Bandeaux ---------- */
  function bandeaux(etat) {
    var liste = [];
    if (Api.demo) liste.push(h('div', { class: 'bandeau bandeau--demo', text: 'Mode démonstration : données fictives.' }));
    if (etat && etat.horsLigne) {
      liste.push(h('div', { class: 'bandeau bandeau--horsligne', text: etat.depuis
        ? 'Hors ligne. Données du ' + heureLocale(etat.depuis) + '.'
        : 'Hors ligne. Reconnectez-vous au réseau pour charger les données.' }));
    }
    if (etat && etat.majDispo) {
      liste.push(h('div', { class: 'bandeau bandeau--maj' },
        h('span', { text: 'Une nouvelle version est disponible.' }),
        h('button', { type: 'button', onclick: function () { window.location.reload(); }, text: 'Mettre à jour' })));
    }
    zoneBandeaux.replaceChildren.apply(zoneBandeaux, liste);
  }
  var etatBandeaux = { horsLigne: false, depuis: null, majDispo: false };
  function majBandeaux(changements) { Object.assign(etatBandeaux, changements); bandeaux(etatBandeaux); }

  /* ---------- Écran de connexion ---------- */
  function ecranConnexion(erreurInitiale) {
    var champ = h('input', { id: 'code', name: 'code', type: 'text', inputmode: 'text', autocomplete: 'off',
      autocapitalize: 'characters', spellcheck: 'false', maxlength: '32', required: true, 'aria-describedby': 'code-aide' });
    var erreur = h('p', { class: 'message-erreur', role: 'alert', text: erreurInitiale || '' });
    var bouton = h('button', { class: 'bouton', type: 'submit', text: 'Se connecter' });

    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      erreur.textContent = '';
      if (!champ.value.trim()) { erreur.textContent = message('code_manquant'); champ.focus(); return; }
      bouton.disabled = true; bouton.textContent = 'Connexion…';
      Api.appeler('login', { code: champ.value }).then(function (r) {
        stock.ecrire(CLE.session, { jeton: r.jeton, role: r.role, libelle: r.libelle, expiration: r.expiration });
        ecranAccueil();
      }).catch(function (e) {
        erreur.textContent = message(e.code);
        bouton.disabled = false; bouton.textContent = 'Se connecter';
        champ.select();
      });
    } },
      h('div', { class: 'champ' },
        h('label', { for: 'code', text: 'Code d\'accès' }),
        champ,
        h('p', { id: 'code-aide', class: 'champ__aide', text: 'Code du service, ou votre code personnel si vous êtes référent.' })),
      bouton, erreur);

    afficher(h('section', { class: 'connexion', 'aria-labelledby': 'titre-connexion' },
      h('div', { class: 'connexion__carte' },
        h('div', { class: 'connexion__arc', 'aria-hidden': 'true' }),
        h('img', { class: 'logo-rea', src: 'assets/logos/reanimation-guadeloupe.png', alt: 'Réanimation Guadeloupe', width: '900', height: '577' }),
        h('h1', { id: 'titre-connexion', text: 'Préparons le nouveau service' }),
        h('p', { class: 'connexion__intro', text: 'Visites, plan, quiz et simulations pour être prêts le jour du déménagement.' }),
        form,
        h('p', { class: 'connexion__pied', text: 'Aucune donnée patient. Aucun compte Google nécessaire.' }))));
    bandeaux(etatBandeaux);
    setTimeout(function () { champ.focus(); }, 50);
  }

  /* ---------- Écran d'accueil ---------- */
  function ecranAccueil() {
    ecranCourant = ecranAccueil;
    var session = stock.lire(CLE.session);
    if (!session || !session.jeton) return ecranConnexion();

    var cache = stock.lire(CLE.accueil);
    if (cache && cache.donnees) dessinerAccueil(session, cache.donnees);
    else afficher(squelette());

    Api.appeler('home', { jeton: session.jeton }).then(function (d) {
      stock.ecrire(CLE.accueil, { donnees: d, le: new Date().toISOString() });
      majBandeaux({ horsLigne: false, depuis: null });
      dessinerAccueil(session, d);
    }).catch(function (e) {
      if (ERREURS_SESSION.indexOf(e.code) >= 0) {
        stock.effacer(CLE.session); stock.effacer(CLE.accueil);
        return ecranConnexion(message(e.code));
      }
      if (e.code === 'reseau') {
        majBandeaux({ horsLigne: true, depuis: cache && cache.le });
        if (!cache) afficher(h('div', { class: 'page' }, h('p', { class: 'vide', text: message('reseau') }),
          h('button', { class: 'bouton', type: 'button', onclick: ecranAccueil, text: 'Réessayer' })));
        return;
      }
      if (!cache) afficher(h('div', { class: 'page' }, h('p', { class: 'vide', text: message(e.code) })));
    });
  }

  function squelette() {
    return h('div', { class: 'page', 'aria-busy': 'true' },
      h('div', { class: 'squelette', style: 'height:56px;margin-top:16px' }),
      h('div', { class: 'squelette', style: 'height:240px;margin-top:24px' }),
      h('div', { class: 'squelette', style: 'height:320px;margin-top:32px' }));
  }

  function dessinerAccueil(session, d) {
    var role = session.role;
    var libelleRole = role === 'admin' ? 'Administrateur' : role === 'referent' ? 'Référent : ' + (session.libelle || '') : 'Équipe réa';

    afficher(h('div', { class: 'page' },
      h('header', { class: 'entete' },
        h('span', { class: 'pastille-logo' },
          h('img', { class: 'logo-rea logo-rea--petit', src: 'assets/logos/reanimation-guadeloupe.png', alt: 'Réanimation Guadeloupe', width: '900', height: '577' })),
        h('span', { class: 'entete__role', text: libelleRole })),
      horizon(d),
      d.messageAccueil ? h('p', { class: 'message-accueil', text: d.messageAccueil }) : null,
      sectionJauge(d.jauge),
      sectionBadges(),
      sectionModules(role),
      sectionActus(d.actualites),
      piedDePage()));
    app.focus({ preventScroll: true });
  }

  function horizon(d) {
    var c = compteARebours(d.dateJ);
    var p = Math.max(0, Math.min(100, (d.jauge && d.jauge.pourcent) || 0));
    var arc = svg(
      '<svg class="horizon__arc" viewBox="0 0 440 236" role="img" aria-label="Jauge Service prêt : ' + p + ' %">' +
        '<path class="horizon__piste" d="M24 220 A196 196 0 0 1 416 220" pathLength="100"/>' +
        '<path class="horizon__progression" d="M24 220 A196 196 0 0 1 416 220" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>' +
      '</svg>');
    // Animation unique : l'arc se remplit à l'arrivée sur l'accueil
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      var prog = arc.querySelector('.horizon__progression');
      if (prog) prog.setAttribute('stroke-dashoffset', String(p > 0 ? Math.max(100 - p, 0) : 100));
    }); });
    return h('section', { class: 'horizon', 'aria-labelledby': 'titre-horizon' },
      h('div', { class: 'horizon__cadre' },
        arc,
        h('div', { class: 'horizon__centre' },
          h('h1', { id: 'titre-horizon', class: 'horizon__j' + (c.texte ? ' horizon__j--texte' : ''), text: c.grand }))),
      h('p', { class: 'horizon__sous' }, c.sous),
      h('p', { class: 'jauge-resume' }, h('strong', { text: p + ' %' }), ' du service se déclare prêt'));
  }

  function sectionJauge(j) {
    var parF = (j && j.parFonction) || [];
    var contenu = parF.some(function (f) { return f.prets > 0; })
      ? h('ul', { class: 'barres' }, parF.map(function (f) {
          return h('li', null,
            h('div', { class: 'barre__ligne' }, h('span', { text: f.fonction }), h('span', { text: f.prets + ' / ' + f.effectif })),
            h('div', { class: 'barre__piste', role: 'progressbar', 'aria-label': f.fonction, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(f.pourcent) },
              h('div', { class: 'barre__plein', style: 'width:' + f.pourcent + '%' })));
        }))
      : h('p', { class: 'detail-jauge__vide', text: 'La jauge se remplira quand chacun pourra se déclarer prêt depuis le module « Je suis prêt(e) ». Les déclarations sont anonymes.' });
    return h('section', { class: 'section', 'aria-label': 'Détail de la jauge' },
      h('details', { class: 'detail-jauge' },
        h('summary', { text: 'Détail par fonction' }),
        contenu));
  }

  function sectionBadges() {
    var obtenus = stock.lire(CLE.badges) || {};
    return h('section', { class: 'section', 'aria-labelledby': 'titre-badges' },
      h('div', { class: 'section__tete' },
        h('h2', { id: 'titre-badges', text: 'Mes badges' }),
        h('span', { class: 'section__note', text: 'Visibles sur ce téléphone uniquement' })),
      h('ul', { class: 'badges' }, BADGES.map(function (b) {
        var ok = !!obtenus[b.id];
        var disque = h('span', { class: 'badge__disque' });
        disque.appendChild(svg(ok ? ICONES.etoile : ICONES.cadenas));
        return h('li', { class: 'badge' + (ok ? ' badge--obtenu' : '') },
          disque, h('span', { text: b.nom }), h('span', { class: 'visuellement-cache', text: ok ? ' (obtenu)' : ' (à obtenir)' }));
      })));
  }

  function sectionModules(role) {
    return h('section', { class: 'section', 'aria-labelledby': 'titre-modules' },
      h('div', { class: 'section__tete' }, h('h2', { id: 'titre-modules', text: 'Se préparer' })),
      h('ul', { class: 'modules' }, MODULES.map(function (m) {
        var icone = h('span', { class: 'module__icone' }); icone.appendChild(svg(ICONES[m.id]));
        var contenu = [icone,
          h('div', { class: 'module__texte' },
            h('div', { class: 'module__nom', text: m.nom }),
            h('div', { class: 'module__desc', text: m.desc })),
          m.ouvrir ? h('span', { class: 'module__fleche', 'aria-hidden': 'true', text: '›' }) : h('span', { class: 'module__etat', text: 'Bientôt' })];
        return h('li', { class: 'module' + (m.ouvrir ? ' module--actif' : '') },
          m.ouvrir ? h('button', { type: 'button', class: 'module__bouton', onclick: m.ouvrir }, contenu) : contenu);
      }).concat(role !== 'agent' ? [h('li', { class: 'module' },
        (function () { var i = h('span', { class: 'module__icone' }); i.appendChild(svg(ICONES.docs)); return i; })(),
        h('div', { class: 'module__texte' },
          h('div', { class: 'module__nom', text: role === 'admin' ? 'Administration' : 'Espace référent' }),
          h('div', { class: 'module__desc', text: 'En attendant : actualités, date J et effectifs se gèrent dans le Google Sheets « Base ».' })),
        h('span', { class: 'module__etat', text: 'Bientôt' }))] : [])));
  }

  function sectionActus(actus) {
    actus = actus || [];
    return h('section', { class: 'section', 'aria-labelledby': 'titre-actus' },
      h('div', { class: 'section__tete' }, h('h2', { id: 'titre-actus', text: 'Actualités' })),
      actus.length
        ? h('ul', { class: 'actus' }, actus.map(function (a) {
            return h('li', { class: 'actu' + (a.epinglee ? ' actu--epinglee' : '') },
              a.date ? h('p', { class: 'actu__date', text: (a.epinglee ? 'Épinglée, ' : '') + dateCourte(a.date) }) : null,
              h('h3', { class: 'actu__titre', text: a.titre }),
              a.texte ? h('p', { class: 'actu__texte', text: a.texte }) : null);
          }))
        : h('p', { class: 'vide', text: 'Aucune actualité pour le moment.' }));
  }

  function piedDePage() {
    var logoChu = h('img', { class: 'logo-chu', src: cfg.LOGO_CHU || 'assets/logos/chu-guadeloupe.png', alt: 'CHU de la Guadeloupe' });
    var bloc = h('span', { class: 'pastille-logo' }, logoChu);
    logoChu.addEventListener('error', function () {
      bloc.replaceWith(h('span', { class: 'logo-chu-texte', text: 'CHU de la Guadeloupe' }));
    });
    return h('footer', { class: 'pied' },
      bloc,
      h('div', { class: 'pied__actions' },
        h('button', { class: 'bouton bouton--discret', type: 'button', onclick: ecranAccueil, text: 'Actualiser' }),
        h('button', { class: 'bouton bouton--discret', type: 'button', onclick: deconnexion, text: 'Se déconnecter' })));
  }

  /* ---------- Écran Plan du service ---------- */
  var CACHE_DONNEES = 'rea-donnees'; // effacé à la déconnexion
  function planEnCache() {
    if (!window.caches) return Promise.resolve(null);
    return caches.open(CACHE_DONNEES).then(function (c) { return c.match('plan'); })
      .then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
  }
  function mettrePlanEnCache(d) {
    if (!window.caches || !stock.lire(CLE.session)) return; // jamais après une déconnexion
    caches.open(CACHE_DONNEES).then(function (c) { return c.put('plan', new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } })); }).catch(function () {});
  }
  function ecranPlan() {
    ecranCourant = ecranPlan;
    var session = stock.lire(CLE.session);
    if (!session) return ecranConnexion();
    var zone = h('div', { class: 'zone-plan' }, h('div', { class: 'squelette', style: 'height:60vh' }));
    afficher(h('div', { class: 'page page--large' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour à l\'accueil', onclick: ecranAccueil, text: '‹' }),
        h('h1', { class: 'entete__titre', text: 'Plan du service' }),
        h('span', { class: 'entete__role', text: session.role === 'agent' ? 'Niveau 3' : 'Mode référent' })),
      zone,
      h('p', { class: 'plan-note', text: 'Touchez une pièce pour voir son nom. Le plan reste consultable sans réseau sur ce téléphone, jusqu\'à la déconnexion.' })));
    window.scrollTo(0, 0);
    var monte = false;
    function monter(r, depuisCache) {
      monte = true;
      var vus = stock.lire(CLE.planVu) || {};
      var plan = window.ReaPlan.creer(zone, {
        donnees: r.donnees, reglages: r.reglages, peutModifier: !!r.peutModifier && !depuisCache,
        mode: stock.lire(CLE.planMode) || 'texte',
        surMode: function (m) { stock.ecrire(CLE.planMode, m); },
        surChoix: function (id) {
          vus[id] = 1; stock.ecrire(CLE.planVu, vus);
          if (Object.keys(vus).length >= 8 && window.ReaBadges) window.ReaBadges.attribuer('plan');
        },
        enregistrerPiece: function (id, d) {
          return Api.appeler('plan_piece', { jeton: session.jeton, id: id, donnees: d })
            .then(function () { majCache(); }, function (e) { throw new Error(message(e.code)); });
        },
        enregistrerCategorie: function (cat, d) {
          return Api.appeler('plan_categorie', { jeton: session.jeton, categorie: cat, donnees: d })
            .then(function () { majCache(); }, function (e) { throw new Error(message(e.code)); });
        }
      });
      function majCache() { mettrePlanEnCache({ donnees: r.donnees, reglages: plan.reglages, peutModifier: r.peutModifier }); }
    }
    planEnCache().then(function (c) {
      if (c) monter(c, true);
      return Api.appeler('plan', { jeton: session.jeton }).then(function (r) {
        mettrePlanEnCache(r); majBandeaux({ horsLigne: false });
        if (zone.isConnected) monter(r, false);
      }).catch(function (e) {
        if (ERREURS_SESSION.indexOf(e.code) >= 0) { stock.effacer(CLE.session); return ecranConnexion(message(e.code)); }
        if (e.code === 'reseau') majBandeaux({ horsLigne: true, depuis: null });
        if (!monte) zone.replaceChildren(h('p', { class: 'vide', text: message(e.code) }),
          h('button', { class: 'bouton', type: 'button', onclick: ecranPlan, text: 'Réessayer' }));
      });
    });
  }

  function deconnexion() {
    stock.effacer(CLE.session); stock.effacer(CLE.accueil);
    // Supprime aussi les données mises en cache hors ligne (le plan) et l'historique de consultation
    stock.effacer(CLE.planVu);
    if (window.caches) caches.keys().then(function (cles) { cles.filter(function (c) { return c.indexOf('rea-donnees') === 0; }).forEach(function (c) { caches.delete(c); }); });
    majBandeaux({ horsLigne: false, depuis: null });
    ecranConnexion();
  }

  /* ---------- Hors ligne et mises à jour ---------- */
  var ecranCourant = null; // écran à rafraîchir au retour du réseau
  window.addEventListener('online', function () { if (stock.lire(CLE.session) && ecranCourant) ecranCourant(); });
  window.addEventListener('offline', function () {
    var c = stock.lire(CLE.accueil); majBandeaux({ horsLigne: true, depuis: c && c.le });
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var nouveau = reg.installing;
        if (!nouveau) return;
        nouveau.addEventListener('statechange', function () {
          if (nouveau.state === 'installed' && navigator.serviceWorker.controller) majBandeaux({ majDispo: true });
        });
      });
    }).catch(function () { /* l'app fonctionne sans */ });
  }

  /* ---------- Démarrage ---------- */
  var s = stock.lire(CLE.session);
  if (s && s.expiration && Date.parse(s.expiration) < Date.now()) { stock.effacer(CLE.session); s = null; }
  if (s) ecranAccueil(); else ecranConnexion();

  // Utilisé par les modules suivants pour attribuer un badge
  window.ReaBadges = {
    attribuer: function (id) { var b = stock.lire(CLE.badges) || {}; b[id] = new Date().toISOString(); stock.ecrire(CLE.badges, b); }
  };
})();
