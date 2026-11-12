/* Réa – Nouveau CHU · application (étape 1 : connexion et accueil) */
(function () {
  'use strict';

  var Api = window.ReaApi;
  var cfg = window.REA_CONFIG || {};
  var FUSEAU = 'America/Guadeloupe';
  var CLE = { session: 'rea.session', accueil: 'rea.accueil', badges: 'rea.badges', planVu: 'rea.plan-vu', planMode: 'rea.plan-mode', visites: 'rea.visites', nlLues: 'rea.nl-lues' };
  var LOGO_CHU = 'assets/logos/chu-guadeloupe.png'; // logo officiel, jamais modifié (charte FI/COM/001, p. 10 à 18)
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
  function afficher(noeud) {
    if (noeud && noeud.classList) noeud.classList.add('entree'); // glissement doux (désactivé si le téléphone réduit les animations)
    app.replaceChildren(noeud);
  }

  /* ---------- Icônes filaires (style des pictogrammes de la charte) ---------- */
  var I = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var ICONES = {
    plan: I('<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>'),
    visites: I('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="M9 15l2 2 4-4"/>'),
    quiz: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5h.01"/>'),
    simulations: I('<path d="M3 12h4l2-5 4 10 2-5h6"/>'),
    souvenirs: I('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>'),
    jeux: I('<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v4M5 13h4"/><circle cx="16" cy="12" r="1"/><circle cx="18" cy="14" r="1"/>'),
    newsletter: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h6M7 12h10M7 16h10"/><rect x="15" y="7" width="3" height="2.5"/>'),
    docs: I('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>'),
    pret: I('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>'),
    cadenas: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    etoile: I('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>')
  };

  var MODULES = [
    // c : couleur de la carte ; e : pictogramme ; t : inclinaison (degrés)
    { id: 'plan', c: '#223b80', e: '🧭', t: 2, nom: 'Plan du service', desc: 'Plan interactif avec GPS, jeux pour apprendre le service', etape: 2, ouvrir: function () { ecranPlanHub(); } },
    // toujours : visible dans tous les services, même quand l'administrateur a choisi ses rubriques
    { id: 'plan-chu', c: '#40a8df', sombre: true, e: '🏥', t: -1.5, toujours: true, nom: 'Plans du CHU', desc: 'Plan virtuel : rechercher un service, vue du ciel, rue Caraïbes, ascenseur et services de chaque étage', ouvrir: function () { window.ReaDefi.plansChu(function () { ecranAccueil(); }); } },
    { id: 'visites', c: '#048e39', e: '🚶', t: -1.5, nom: 'Visites des locaux', desc: 'Réserver un créneau pour découvrir le service', etape: 3, ouvrir: function () { ecranVisites(); } },
    { id: 'newsletter', c: '#40a8df', sombre: true, e: '📰', t: 1.5, nom: 'Newsletter', desc: 'Les lettres d\'information du service et du CHU', etape: 3, ouvrir: function () { ecranNewsletters(); } },
    { id: 'souvenirs', c: '#95c127', sombre: true, e: '📸', t: -2, nom: 'Souvenirs', desc: 'Photos et anecdotes du CHU actuel', etape: 4, ouvrir: function () { window.ReaJeux.souvenirs(); } },
    { id: 'jeux', c: '#048e39', e: '🎮', t: 2, nom: 'Quiz et jeux', desc: 'Quiz, concours photo, nuage, QR codes, escape game, bingo, paris', etape: 4, ouvrir: function () { window.ReaJeux.hub(); } },
    { id: 'simulations', c: '#223b80', e: '🚑', t: 1.5, nom: 'Simulations in situ', desc: 'S\'entraîner aux situations critiques sur place', etape: 5 },
    { id: 'docs', c: '#95c127', sombre: true, e: '📚', t: -1.5, nom: 'Documents et FAQ', desc: 'Procédures, liens utiles, questions-réponses', etape: 6, ouvrir: function () { window.ReaCommuns.documents(); } },
    { id: 'pret', c: '#40a8df', sombre: true, e: '✅', t: 1, nom: 'Je suis prêt(e)', desc: 'Ma check-list personnelle avant le jour J', etape: 6 }
  ];

  var BADGES = [
    { id: 'visite', nom: 'Visite faite' },
    { id: 'plan', nom: 'Plan exploré' },
    { id: 'boussole', nom: 'Boussole' },
    { id: 'urgence', nom: 'Prêt pour l\'urgence' },
    { id: 'fidele', nom: 'Fidèle' },
    { id: 'expert', nom: 'Expert' },
    { id: 'qr5', nom: 'Explorateur' },
    { id: 'qr10', nom: 'Grand explorateur' },
    { id: 'qrtous', nom: 'Tous les QR codes' },
    { id: 'evade', nom: 'Évadé' },
    { id: 'bingo', nom: 'Bingo !' },
    { id: 'cartonplein', nom: 'Carton plein' },
    { id: 'simulation', nom: 'Simulation' },
    { id: 'pret', nom: 'Prêt(e) !' }
  ];

  var MESSAGES = {
    code_manquant: 'Saisissez votre code.',
    service_inconnu: 'Ce service n\'est plus ouvert dans Cap NCHUG. Choisissez votre service.',
    service_deplace: 'Votre service a rejoint Cap NCHUG : rechargez la page (ou touchez « Mettre à jour ») puis ressaisissez votre code habituel.',
    cle_incorrecte: 'Clé incorrecte : vérifiez la clé donnée par le moteur du service.',
    acces_refuse: 'Cap NCHUG ne peut pas ouvrir ce Google Sheets : partagez-le d\'abord avec le compte dédié (éditeur).',
    paquet_absent: 'Aucun paquet de rattachement dans ce Google Sheets : lancez d\'abord « Préparer le rattachement à Cap NCHUG » dans son menu.',
    deja_rattache: 'Ce service a déjà été rattaché à Cap NCHUG.',
    action_inconnue: 'Cette fonction attend la mise à jour du moteur (Code.gs) par l\'administrateur.',
    defi_perime: 'Un nouveau défi a commencé : rechargez le défi du jour.',
    infos_fermees: 'Les Infos générales ne sont pas encore ouvertes.',
    code_deja_utilise: 'Ce code est déjà utilisé par un autre rôle du service : choisissez-en un autre.',
    code_longueur: 'Le code doit compter de 6 à 32 lettres ou chiffres.',
    code_caracteres: 'Le code ne doit contenir que des lettres et des chiffres (sans espace, accent ni tiret).',
    code_infos_invalide: 'Le code doit compter de 6 à 32 lettres ou chiffres (le tiret est permis).',
    parcours_inactif: 'Le jeu Parcours n\'est pas encore ouvert. Les missions sont dans le Défi du jour !',
    question_invalide: 'Question incomplète.',
    service_existe: 'Un service porte déjà ce nom.',
    occupe: 'Beaucoup de monde en ce moment : réessayez dans une minute.',
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
    creneau_complet: 'Ce créneau est complet. Choisissez-en un autre.',
    creneau_passe: 'Ce créneau est déjà passé.',
    creneau_introuvable: 'Ce créneau n\'existe plus (il a peut-être été annulé).',
    reservation_introuvable: 'Réservation introuvable : elle a peut-être déjà été annulée.',
    places_insuffisantes: 'Il y a déjà plus d\'inscrits que ce nombre de places.',
    newsletter_introuvable: 'Cette newsletter n\'est plus disponible.',
    newsletter_incomplete: 'Toutes les pages n\'ont pas été reçues. Réessayez.',
    question_introuvable: 'Cette question n\'existe plus.',
    jeu_inactif: 'Cette rubrique n\'est pas ouverte pour le moment.',
    introuvable: 'Élément introuvable (peut-être retiré).',
    consentement: 'Cochez les règles pour la photo.',
    mot_refuse: 'Ce mot n\'est pas accepté.',
    pseudo_pris: 'Ce pseudo est déjà pris.',
    pseudo_invalide: 'Choisissez un autre pseudo.',
    paris_fermes: 'Les paris sont fermés.',
    qr_inconnu: 'QR code inconnu.',
    bingo_cases: 'Il faut au moins 16 cases.',
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
    if (window.ReaCap && window.ReaCap.enInfos()) return window.ReaCap.infosExpiree(erreurInitiale); // Infos générales : on redemande le code commun
    ecranCourant = null; // un chargement de l'accueil encore en cours ne doit pas réafficher l'accueil
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

    var multi = Api.multi && window.ReaCap, sv = multi ? window.ReaCap.serviceCourant() : null;
    if (multi && !sv) return window.ReaCap.ecranServices();
    var rea = !multi || (sv && sv.id === 'rea');
    afficher(h('section', { class: 'connexion', 'aria-labelledby': 'titre-connexion' },
      h('div', { class: 'connexion__carte' },
        h('div', { class: 'connexion__arc', 'aria-hidden': 'true' }),
        h('div', { class: 'logos logos--connexion' },
          h('img', { class: 'logo-chu', src: LOGO_CHU, alt: 'CHU de la Guadeloupe', width: '360', height: '279' }),
          rea ? h('img', { class: 'logo-rea', src: 'assets/logos/reanimation-guadeloupe.png', alt: 'Réanimation Guadeloupe', width: '450', height: '288' }) : null),
        multi ? h('p', { class: 'cap-marque', text: 'Cap NCHUG' }) : null,
        multi ? h('div', { class: 'cap-choisi' }, h('span', { text: sv.nom }),
          h('button', { type: 'button', class: 'lien-discret', onclick: function () { window.ReaCap.changerService(); }, text: 'Changer de service' })) : null,
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
      if (ecranCourant === ecranAccueil) dessinerAccueil(session, d); // on n'écrase pas un écran ouvert entre-temps
      verifierReservations().then(function (nouveau) { if (nouveau && ecranCourant === ecranAccueil) dessinerAccueil(session, d); });
    }).catch(function (e) {
      if (ERREURS_SESSION.indexOf(e.code) >= 0) {
        stock.effacer(CLE.session); stock.effacer(CLE.accueil);
        return ecranConnexion(message(e.code));
      }
      if (e.code === 'reseau') {
        majBandeaux({ horsLigne: true, depuis: cache && cache.le });
        if (!cache && ecranCourant === ecranAccueil) afficher(h('div', { class: 'page' }, h('p', { class: 'vide', text: message('reseau') }),
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
    var commun = !!(window.ReaCap && window.ReaCap.enCommun()); // contenus communs au CHU : seulement actualités, newsletters, documents
    var infos = role === 'visiteur'; // Infos générales : contenus communs en lecture, Défi en entraînement
    var libelleRole = infos ? 'Infos générales' : role === 'admin' ? 'Administrateur' : role === 'referent' ? 'Référent : ' + (session.libelle || '') : 'Équipe réa';

    afficher(h('div', { class: 'page' },
      h('header', { class: 'entete' },
        h('span', { class: 'pastille-logo logos' },
          h('img', { class: 'logo-chu logo-chu--petit', src: LOGO_CHU, alt: 'CHU de la Guadeloupe', width: '360', height: '279' }),
          d.logo && window.ReaService ? window.ReaService.logo(d.logo, d.service) : estRea() ? h('img', { class: 'logo-rea logo-rea--petit', src: 'assets/logos/reanimation-guadeloupe.png', alt: 'Réanimation Guadeloupe', width: '450', height: '288' }) : null),
        h('span', { class: 'entete__droite' },
          window.ReaFun && window.ReaFun.serie() ? h('span', { class: 'serie', title: 'Jours d\'affilée avec le quiz du jour', text: '🔥 ' + window.ReaFun.serie() }) : null,
          h('span', { class: 'entete__role', text: libelleRole }))),
      window.ReaCap && window.ReaCap.enCommun() ? window.ReaCap.bandeauCommun() : null,
      Api.multi ? h('p', { class: 'cap-entete' }, h('span', { text: 'Cap NCHUG' }), h('b', { text: infos ? 'Infos générales' : d.service || '' }),
        infos && window.ReaCap ? h('button', { type: 'button', class: 'lien-discret', onclick: function () { window.ReaCap.quitterInfos(); }, text: 'Choisir mon service' }) : null) : null,
      d.messageAccueil && !infos ? h('p', { class: 'message-accueil', text: d.messageAccueil }) : null,
      infos ? h('p', { class: 'message-accueil', text: 'Les informations communes à tout le CHU. Pour les contenus de votre service, choisissez votre service.' }) : null,
      commun || infos ? null : horizon(d),
      !commun && !infos && d.elan && window.ReaJeux ? window.ReaJeux.sectionJauge(d.elan) : null,
      !commun && window.ReaDefi ? window.ReaDefi.carteAccueil() : null,
      sectionModules(role, d),
      commun || infos ? null : sectionJauge(d.jauge),
      commun || infos ? null : sectionBadges(),
      sectionActus(d.actualites, role),
      piedDePage(d)));
    app.focus({ preventScroll: true });
    if (window.ReaJeux) window.ReaJeux.apresAccueil(); // QR code scanné en attente
  }

  function horizon(d) {
    var c = compteARebours(d.dateJ);
    var p = Math.max(0, Math.min(100, (d.jauge && d.jauge.pourcent) || 0));
    return h('section', { class: 'horizon', 'aria-labelledby': 'titre-horizon' },
      h('h1', { id: 'titre-horizon', class: 'horizon__j' + (c.texte ? ' horizon__j--texte' : ''), text: c.grand }),
      h('p', { class: 'horizon__sous' }, c.sous),
      h('span', { class: 'horizon__bulle', 'aria-hidden': 'true', text: '🚑' }),
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

  function sectionModules(role, d) {
    var nl = d && d.newsletter, nlNeuve = !!(nl && !(stock.lire(CLE.nlLues) || {})[nl.id]);
    var rub = d && d.rubriques; // lot 2 : rubriques choisies par l'administrateur (null = toutes)
    var liste = MODULES.filter(function (m) { return !rub || m.toujours || (m.ouvrir ? rub.indexOf(m.id) >= 0 : false); });
    if (role === 'visiteur') liste = MODULES.filter(function (m) { return ['plan-chu', 'newsletter', 'docs'].indexOf(m.id) >= 0; }); // Infos générales
    var commun = !!(window.ReaCap && window.ReaCap.enCommun());
    if (role === 'admin' && window.ReaService && !commun) liste.push({ id: 'perso', c: '#40a8df', sombre: true, e: '🎨', t: 1, nom: 'Personnaliser le service', desc: 'Nom, logo, rubriques, import du plan', ouvrir: function () { window.ReaService.ouvrir(); } });
    if (role === 'admin' && window.ReaCap && !commun) liste.push({ id: 'admin', c: '#223b80', e: '⚙️', t: -1, nom: 'Administration', desc: 'Codes d\'accès des agents et des référents', ouvrir: function () { window.ReaCap.ecranCodes(); } });
    // Service seul (sans Cap NCHUG) : son administrateur gère le Défi CHU ; sinon ce sont le super-admin et les créateurs
    if (role === 'admin' && (!Api.multi || (Api.service() && Api.service().api)) && window.ReaDefiGestion) liste.push({ id: 'defi-gestion', c: '#95c127', sombre: true, e: '🏆', t: 1, nom: 'Gestion du Défi CHU', desc: 'Phase de test, validation des questions, vue du ciel', ouvrir: function () { window.ReaDefiGestion.ouvrir({ jeton: stock.lire(CLE.session).jeton, role: 'Administrateur', retour: function (m) { m ? ecranConnexion(m) : ecranAccueil(); } }); } });
    else if (role !== 'agent' && role !== 'visiteur' && !commun && !rub) liste.push({ id: 'admin', c: '#223b80', e: '⚙️', t: -1, nom: 'Espace référent', desc: 'Bientôt' });
    return h('section', { class: 'section', 'aria-labelledby': 'titre-modules' },
      h('div', { class: 'section__tete' }, h('h2', { id: 'titre-modules', text: 'Se préparer' })),
      h('ul', { class: 'modules' }, liste.map(function (m) {
        var contenu = [
          m.id === 'newsletter' && nlNeuve ? h('span', { class: 'etiquette etiquette--nouveau module__nouveau', text: 'Nouveau' }) : null,
          h('span', { class: 'module__nom', text: m.nom }),
          h('span', { class: 'module__desc', text: m.ouvrir ? m.desc : 'Bientôt' }),
          h('span', { class: 'module__icone', 'aria-hidden': 'true', text: m.e })];
        var style = '--c:' + m.c + ';--t:' + (m.t || 0) + 'deg';
        return h('li', { class: 'module' + (m.ouvrir ? ' module--actif' : ' module--bientot') + (m.sombre ? ' module--clair' : ''), style: style },
          m.ouvrir ? h('button', { type: 'button', class: 'module__bouton', onclick: m.ouvrir }, contenu) : h('div', { class: 'module__bouton' }, contenu));
      })));
  }

  function sectionActus(actus, role) {
    actus = actus || [];
    return h('section', { class: 'section', 'aria-labelledby': 'titre-actus' },
      h('div', { class: 'section__tete' }, h('h2', { id: 'titre-actus', text: 'Actualités' }),
        (role === 'referent' || role === 'admin') && window.ReaCommuns ? h('button', { type: 'button', class: 'bouton bouton--discret', onclick: function () { window.ReaCommuns.actus(); }, text: '✏️ Gérer' }) : null),
      actus.length
        ? h('ul', { class: 'actus' }, actus.map(function (a) {
            return h('li', { class: 'actu' + (a.epinglee ? ' actu--epinglee' : '') + (a.chu ? ' actu--chu' : '') },
              a.chu || a.date ? h('p', { class: 'actu__date' }, a.chu ? h('span', { class: 'etiquette etiquette--chu', text: 'CHU' }) : null, a.date ? (a.epinglee ? ' Épinglée, ' : ' ') + dateCourte(a.date) : null) : null,
              h('h3', { class: 'actu__titre', text: a.titre }),
              a.texte ? h('p', { class: 'actu__texte', text: a.texte }) : null);
          }))
        : h('p', { class: 'vide', text: 'Aucune actualité pour le moment.' }));
  }

  function estRea() { var sv = Api.multi && window.ReaCap ? window.ReaCap.serviceCourant() : null; return !Api.multi || !!(sv && sv.id === 'rea'); }
  function piedDePage(d) {
    return h('footer', { class: 'pied' },
      h('span', { class: 'pied__texte', text: 'CHU de la Guadeloupe · ' + ((d && d.service) || 'Réanimation – USC') }),
      h('div', { class: 'pied__actions' },
        h('button', { class: 'bouton bouton--discret', type: 'button', onclick: ecranAccueil, text: 'Actualiser' }),
        window.ReaCap && window.ReaCap.enInfos() ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { window.ReaCap.quitterInfos(); }, text: 'Choisir mon service' })
          : h('button', { class: 'bouton bouton--discret', type: 'button', onclick: deconnexion, text: 'Se déconnecter' })));
  }

  /* ---------- Visites des locaux ---------- */
  function mesReservations() { return stock.lire(CLE.visites) || []; }
  function heureFin(heure, duree) {
    var m = (+heure.slice(0, 2)) * 60 + (+heure.slice(3, 5)) + (Number(duree) || 0);
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  function maintenantLocal() {
    var p = {}; new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
  }
  /* Met à jour les réservations gardées sur ce téléphone ; renvoie true si le badge « Visite faite » vient d'être obtenu. */
  function verifierReservations() {
    var session = stock.lire(CLE.session), res = mesReservations();
    if (!session || !res.length) return Promise.resolve(false);
    var avant = !!(stock.lire(CLE.badges) || {}).visite;
    return Api.appeler('visite_statut', { jeton: session.jeton, reservations: res.map(function (r) { return { id: r.id, code: r.code }; }) }).then(function (r) {
      var maj = [];
      r.reservations.forEach(function (x) {
        var loc = res.filter(function (y) { return y.id === x.id; })[0];
        if (!x.existe) return; // annulée ou effacée : on l'oublie
        maj.push(Object.assign({}, loc, { creneau: x.creneau || loc.creneau, present: x.present }));
        if (x.present) window.ReaBadges.attribuer('visite');
      });
      stock.ecrire(CLE.visites, maj);
      return !avant && !!(stock.lire(CLE.badges) || {}).visite;
    }).catch(function () { return false; });
  }

  function ecranVisites(messageFlash) {
    ecranCourant = ecranVisites;
    var session = stock.lire(CLE.session);
    if (!session) return ecranConnexion();
    var zone = h('div', { class: 'visites' }, h('div', { class: 'squelette', style: 'height:180px' }), h('div', { class: 'squelette', style: 'height:260px;margin-top:16px' }));
    afficher(h('div', { class: 'page' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour à l\'accueil', onclick: ecranAccueil, text: '‹' }),
        h('h1', { class: 'entete__titre', text: 'Visites des locaux' }),
        h('span', { class: 'entete__role', text: session.role === 'agent' ? 'Nouveau CHU' : 'Mode référent' })),
      messageFlash ? h('p', { class: 'flash', role: 'status', text: messageFlash }) : null,
      zone));
    window.scrollTo(0, 0);
    Promise.all([Api.appeler('visites', { jeton: session.jeton }), verifierReservations()]).then(function (t) {
      dessinerVisites(zone, session, t[0]);
    }).catch(function (e) {
      if (ERREURS_SESSION.indexOf(e.code) >= 0) { stock.effacer(CLE.session); return ecranConnexion(message(e.code)); }
      zone.replaceChildren(h('p', { class: 'vide', text: message(e.code) }), h('button', { class: 'bouton', type: 'button', onclick: function () { ecranVisites(); }, text: 'Réessayer' }));
    });
  }

  function dessinerVisites(zone, session, d) {
    var maintenant = d.maintenant || maintenantLocal(), res = mesReservations(), badgeVisite = !!(stock.lire(CLE.badges) || {}).visite;
    var mesIds = {}; res.forEach(function (r) { if (r.creneau) mesIds[r.creneau.id] = r; });
    var blocs = [];

    // Mes réservations
    if (res.length) {
      blocs.push(h('section', { class: 'section', 'aria-labelledby': 't-mesres' },
        h('div', { class: 'section__tete' }, h('h2', { id: 't-mesres', text: 'Mes réservations' }), h('span', { class: 'section__note', text: 'Gardées sur ce téléphone' })),
        h('ul', { class: 'cartes' }, res.map(function (r) {
          var c = r.creneau || {}, debut = c.date + 'T' + c.heure, commencee = debut <= maintenant;
          var etat = r.present ? h('span', { class: 'etiquette etiquette--ok', text: 'Présence validée' })
            : commencee ? h('span', { class: 'etiquette', text: 'Visite passée' }) : h('span', { class: 'etiquette etiquette--bleu', text: 'À venir' });
          return h('li', { class: 'carte-visite carte-visite--mienne' },
            h('div', { class: 'carte-visite__tete' }, h('div', null, h('p', { class: 'carte-visite__date', text: dateLongue(c.date) }),
              h('p', { class: 'carte-visite__heure', text: c.heure + ' – ' + heureFin(c.heure, c.duree) })), etat),
            c.lieu ? h('p', { class: 'carte-visite__info', text: 'Rendez-vous : ' + c.lieu }) : null,
            c.guide ? h('p', { class: 'carte-visite__info', text: 'Guide : ' + c.guide }) : null,
            h('p', { class: 'carte-visite__info' }, 'Inscrit(e) : ' + r.prenom + ' ' + r.initiale + '., ' + r.fonction),
            h('p', { class: 'code-resa' }, 'Code de réservation ', h('b', { text: r.code })),
            h('div', { class: 'carte-visite__actions' },
              commencee && !badgeVisite ? h('button', { class: 'bouton', type: 'button', onclick: function () { window.ReaBadges.attribuer('visite'); ecranVisites('Bravo ! Badge « Visite faite » obtenu.'); }, text: 'J\'ai fait la visite' }) : null,
              !commencee ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function (ev) { annulerReservation(r, ev.currentTarget); }, text: 'Annuler ma réservation' }) : null));
        }))));
    }

    // Créneaux
    var aVenir = d.creneaux.filter(function (c) { return c.date + 'T' + c.heure >= maintenant; });
    var passes = d.creneaux.filter(function (c) { return c.date + 'T' + c.heure < maintenant; }).reverse();
    var outils = d.peutModifier ? h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function (ev) { formulaireCreneau(ev.currentTarget.parentNode.parentNode, session, null); }, text: '+ Créer un créneau' }) : null;
    if (d.peutModifier && d.creneaux.length) {
      var exporter = function (format, bouton) {
        var texte = bouton.textContent; bouton.disabled = true; bouton.textContent = 'Préparation…';
        window.ReaExport[format](d.creneaux).catch(function () { alerteDouce(bouton.parentNode, 'Export impossible : vérifiez la connexion puis réessayez.'); })
          .then(function () { bouton.disabled = false; bouton.textContent = texte; });
      };
      blocs.push(h('section', { class: 'export', 'aria-label': 'Exporter la liste des visiteurs' },
        h('p', { class: 'export__titre', text: 'Liste des visiteurs (tous les créneaux affichés)' }),
        h('div', { class: 'export__boutons' },
          h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function (ev) { exporter('excel', ev.currentTarget); }, text: 'Exporter en Excel' }),
          h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function (ev) { exporter('pdf', ev.currentTarget); }, text: 'Exporter en PDF' }))));
    }
    blocs.push(h('section', { class: 'section', 'aria-labelledby': 't-creneaux' },
      h('div', { class: 'section__tete' }, h('h2', { id: 't-creneaux', text: 'Créneaux de visite' }), outils),
      aVenir.length ? listeCreneaux(aVenir, d, session, mesIds, false)
        : h('p', { class: 'vide', text: d.peutModifier ? 'Aucun créneau à venir. Créez le premier avec « Créer un créneau ».' : 'Aucun créneau ouvert pour l\'instant. Les référents en ajouteront bientôt.' })));
    if (d.peutModifier && passes.length) {
      blocs.push(h('section', { class: 'section' }, h('details', { class: 'detail-jauge' }, h('summary', { text: 'Créneaux passés (' + passes.length + ')' }),
        h('div', { style: 'padding:0 14px 14px' }, listeCreneaux(passes, d, session, mesIds, true)))));
    }
    blocs.push(h('p', { class: 'plan-note', text: 'Seuls votre prénom, l\'initiale de votre nom et votre fonction sont enregistrés. Ils sont effacés 30 jours après le déménagement.' }));
    zone.replaceChildren.apply(zone, blocs);
  }

  function listeCreneaux(liste, d, session, mesIds, passes) {
    var parJour = [], dernier = null;
    liste.forEach(function (c) { if (c.date !== dernier) { parJour.push({ date: c.date, l: [] }); dernier = c.date; } parJour[parJour.length - 1].l.push(c); });
    return h('div', null, parJour.map(function (j) {
      return h('div', { class: 'jour' }, h('h3', { class: 'jour__titre', text: dateLongue(j.date) }), h('ul', { class: 'cartes' }, j.l.map(function (c) {
        var annule = c.statut === 'annulé', complet = c.restantes <= 0, mien = mesIds[c.id];
        var pct = c.places ? Math.round(100 * c.inscrits / c.places) : 0;
        var carte = h('li', { class: 'carte-visite' + (annule ? ' carte-visite--annulee' : '') },
          h('div', { class: 'carte-visite__tete' }, h('p', { class: 'carte-visite__heure', text: c.heure + ' – ' + heureFin(c.heure, c.duree) }),
            annule ? h('span', { class: 'etiquette', text: 'Annulé' }) : mien ? h('span', { class: 'etiquette etiquette--ok', text: 'Vous êtes inscrit(e)' })
              : h('span', { class: 'etiquette' + (complet ? '' : ' etiquette--bleu'), text: complet ? 'Complet' : c.restantes + ' place' + (c.restantes > 1 ? 's' : '') + ' libre' + (c.restantes > 1 ? 's' : '') })),
          c.lieu ? h('p', { class: 'carte-visite__info', text: 'Rendez-vous : ' + c.lieu }) : null,
          c.guide ? h('p', { class: 'carte-visite__info', text: 'Guide : ' + c.guide }) : null,
          h('div', { class: 'remplissage', role: 'progressbar', 'aria-label': 'Places prises', 'aria-valuemin': '0', 'aria-valuemax': String(c.places), 'aria-valuenow': String(c.inscrits) },
            h('div', { style: 'width:' + pct + '%' })),
          h('p', { class: 'carte-visite__info', text: c.inscrits + ' inscrit' + (c.inscrits > 1 ? 's' : '') + ' sur ' + c.places + ' places, ' + c.duree + ' min' }));
        var actions = h('div', { class: 'carte-visite__actions' });
        if (!passes && !annule && !complet && !mien) actions.appendChild(h('button', { class: 'bouton', type: 'button', onclick: function () { formulaireInscription(carte, session, c, d.fonctions); }, text: 'M\'inscrire' }));
        if (d.peutModifier) {
          actions.appendChild(h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function () { formulaireCreneau(carte, session, c); }, text: 'Modifier' }));
          actions.appendChild(h('button', { class: 'bouton bouton--discret', type: 'button', onclick: function (ev) {
            var b = ev.currentTarget; b.disabled = true;
            window.ReaExport.pdf([c], { emargement: true }).catch(function () { alerteDouce(actions, 'Export impossible : vérifiez la connexion puis réessayez.'); }).then(function () { b.disabled = false; });
          }, text: 'Émargement (PDF)' }));
          if (c.liste) carte.appendChild(listeInscrits(c, session));
        }
        carte.appendChild(actions);
        return carte;
      })));
    }));
  }

  function listeInscrits(c, session) {
    if (!c.liste.length) return h('p', { class: 'carte-visite__info', text: 'Aucun inscrit pour l\'instant.' });
    return h('details', { class: 'inscrits' }, h('summary', { text: 'Inscrits (' + c.liste.length + '), cocher les présents' }),
      h('ul', null, c.liste.map(function (x) {
        var caseP = h('input', { type: 'checkbox', id: 'pr-' + x.id });
        caseP.checked = !!x.present;
        caseP.addEventListener('change', function () {
          caseP.disabled = true;
          Api.appeler('visite_presence', { jeton: session.jeton, id: x.id, present: caseP.checked })
            .catch(function (e) { caseP.checked = !caseP.checked; alerteDouce(caseP.parentNode, message(e.code)); })
            .then(function () { caseP.disabled = false; });
        });
        return h('li', null, h('label', { for: 'pr-' + x.id }, caseP, ' ' + x.prenom + ' ' + x.initiale + '.', h('span', { class: 'inscrits__fonction', text: x.fonction })));
      })));
  }
  function alerteDouce(parent, texte) { var p = h('p', { class: 'message-erreur', role: 'alert', text: texte }); parent.appendChild(p); setTimeout(function () { p.remove(); }, 5000); }

  function formulaireInscription(carte, session, c, fonctions) {
    var ancien = carte.querySelector('.form-carte'); if (ancien) { ancien.remove(); return; }
    var prenom = h('input', { type: 'text', id: 'in-prenom', maxlength: '20', autocomplete: 'given-name', required: true });
    var initiale = h('input', { type: 'text', id: 'in-init', maxlength: '1', autocomplete: 'off', required: true, class: 'champ-court', 'aria-describedby': 'in-init-aide' });
    var fonction = h('select', { id: 'in-fonction', required: true }, h('option', { value: '', text: 'Choisir…' }), fonctions.map(function (f) { return h('option', { value: f, text: f }); }));
    var erreur = h('p', { class: 'message-erreur', role: 'alert' }), bouton = h('button', { class: 'bouton', type: 'submit', text: 'Confirmer mon inscription' });
    var form = h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); erreur.textContent = '';
      if (!prenom.value.trim()) { erreur.textContent = 'Indiquez votre prénom.'; return prenom.focus(); }
      if (!/^[A-Za-zÀ-ÿ]$/.test(initiale.value.trim())) { erreur.textContent = 'Indiquez la première lettre de votre nom.'; return initiale.focus(); }
      if (!fonction.value) { erreur.textContent = 'Choisissez votre fonction.'; return fonction.focus(); }
      bouton.disabled = true; bouton.textContent = 'Inscription…';
      var donnees = { prenom: prenom.value.trim(), initiale: initiale.value.trim().toUpperCase(), fonction: fonction.value };
      Api.appeler('visite_inscrire', { jeton: session.jeton, creneau: c.id, donnees: donnees }).then(function (r) {
        var l = mesReservations(); l.push(Object.assign({ id: r.id, code: r.code, creneau: c, present: false }, donnees)); stock.ecrire(CLE.visites, l);
        ecranVisites('Inscription confirmée pour le ' + dateLongue(c.date) + ' à ' + c.heure + '. Votre code de réservation : ' + r.code + '.');
      }).catch(function (e) { erreur.textContent = message(e.code); bouton.disabled = false; bouton.textContent = 'Confirmer mon inscription'; });
    } },
      h('div', { class: 'champ' }, h('label', { for: 'in-prenom', text: 'Prénom' }), prenom),
      h('div', { class: 'champ' }, h('label', { for: 'in-init', text: 'Initiale du nom' }), initiale, h('p', { id: 'in-init-aide', class: 'champ__aide', text: 'Une seule lettre, par exemple D pour Dupont.' })),
      h('div', { class: 'champ' }, h('label', { for: 'in-fonction', text: 'Fonction' }), fonction),
      bouton, erreur);
    carte.appendChild(form); prenom.focus();
  }

  function annulerReservation(r, bouton) {
    var session = stock.lire(CLE.session);
    if (bouton.dataset.confirme !== '1') { bouton.dataset.confirme = '1'; bouton.textContent = 'Confirmer l\'annulation'; return; }
    bouton.disabled = true;
    Api.appeler('visite_annuler', { jeton: session.jeton, id: r.id, code: r.code }).then(function () { return true; }, function (e) {
      if (e.code === 'reservation_introuvable') return true; throw e;
    }).then(function () {
      stock.ecrire(CLE.visites, mesReservations().filter(function (x) { return x.id !== r.id; }));
      ecranVisites('Réservation annulée. La place est libérée.');
    }).catch(function (e) { bouton.disabled = false; alerteDouce(bouton.parentNode, message(e.code)); });
  }

  function formulaireCreneau(conteneur, session, c) {
    var ancien = conteneur.querySelector('.form-carte'); if (ancien) { ancien.remove(); return; }
    var demain = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    var date = h('input', { type: 'date', id: 'cr-date', required: true, value: c ? c.date : demain });
    var heure = h('input', { type: 'time', id: 'cr-heure', required: true, value: c ? c.heure : '14:00', step: '300' });
    var duree = h('select', { id: 'cr-duree' }, [30, 45, 60, 90, 120].map(function (m) { var o = h('option', { value: String(m), text: m + ' min' }); if ((c ? c.duree : 60) === m) o.selected = true; return o; }));
    var places = h('input', { type: 'number', id: 'cr-places', min: '1', max: '50', value: String(c ? c.places : 8), required: true, class: 'champ-court' });
    var lieu = h('input', { type: 'text', id: 'cr-lieu', maxlength: '80', value: c ? c.lieu : '', placeholder: 'Ex. : hall du bâtiment 50, niveau 3' });
    var guide = h('input', { type: 'text', id: 'cr-guide', maxlength: '40', value: c ? c.guide : (session.libelle || '') });
    var erreur = h('p', { class: 'message-erreur', role: 'alert' }), bouton = h('button', { class: 'bouton', type: 'submit', text: c ? 'Enregistrer' : 'Créer le créneau' });
    function envoyer(statut) {
      erreur.textContent = ''; bouton.disabled = true;
      var donnees = { id: c && c.id, date: date.value, heure: heure.value, duree: Number(duree.value), places: Number(places.value), lieu: lieu.value.trim(), guide: guide.value.trim(), statut: statut };
      Api.appeler('visite_creneau', { jeton: session.jeton, donnees: donnees })
        .then(function () { ecranVisites(statut === 'annulé' ? 'Créneau annulé.' : c ? 'Créneau modifié.' : 'Créneau créé.'); })
        .catch(function (e) { erreur.textContent = message(e.code); bouton.disabled = false; });
    }
    var form = h('form', { class: 'form-carte', novalidate: true, onsubmit: function (ev) { ev.preventDefault(); envoyer(c && c.statut === 'annulé' ? 'ouvert' : 'ouvert'); } },
      h('h3', { text: c ? 'Modifier le créneau' : 'Nouveau créneau' }),
      h('div', { class: 'grille-2' },
        h('div', { class: 'champ' }, h('label', { for: 'cr-date', text: 'Date' }), date),
        h('div', { class: 'champ' }, h('label', { for: 'cr-heure', text: 'Heure' }), heure),
        h('div', { class: 'champ' }, h('label', { for: 'cr-duree', text: 'Durée' }), duree),
        h('div', { class: 'champ' }, h('label', { for: 'cr-places', text: 'Places' }), places)),
      h('div', { class: 'champ' }, h('label', { for: 'cr-lieu', text: 'Lieu de rendez-vous' }), lieu),
      h('div', { class: 'champ' }, h('label', { for: 'cr-guide', text: 'Guide' }), guide),
      bouton,
      c && c.statut !== 'annulé' ? h('button', { class: 'bouton bouton--discret bouton--danger', type: 'button', onclick: function (ev) {
        var b = ev.currentTarget; if (b.dataset.confirme !== '1') { b.dataset.confirme = '1'; b.textContent = 'Confirmer : annuler le créneau'; return; } envoyer('annulé');
      }, text: 'Annuler ce créneau' }) : null,
      erreur);
    conteneur.appendChild(form); date.focus();
  }

  /* ---------- Parcours de découverte du plan (badge « Plan exploré ») ---------- */
  var LIEUX_CLES = [
    { id: 'poste', nom: 'Un poste de soins', test: /^poste de soins/i },
    { id: 'soins', nom: 'La salle de soins', test: /^salle de soins/i },
    { id: 'pharmacie', nom: 'La pharmacie', test: /pharmacie/i },
    { id: 'linge', nom: 'Le linge propre', test: /^linge propre/i },
    { id: 'garde', nom: 'Une chambre de garde', test: /^garde/i },
    { id: 'vestiaire', nom: 'Les vestiaires', test: /^vestiaire (h|f)\b|^vestiaire$/i },
    { id: 'detente', nom: 'La salle de détente', test: /^détente/i },
    { id: 'familles', nom: 'L\'attente des familles', test: /^attente familles/i }
  ];
  function lieuDe(nom) { for (var i = 0; i < LIEUX_CLES.length; i++) if (nom && LIEUX_CLES[i].test.test(nom)) return LIEUX_CLES[i].id; return null; }

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
  /* ---------- Rubrique Plan : plan interactif (avec GPS) et jeux pour apprendre le service ---------- */
  var sansUnites = false; // plan sans unités ni couleurs (la plupart des services) : jeux de couleurs masqués
  function verifierUnites(d) { var n = d && d.donnees ? Object.keys(d.donnees.unites || {}).length : 2, avant = sansUnites; sansUnites = n < 2; return avant !== sansUnites; }
  function ecranPlanHub(flash) {
    ecranCourant = ecranPlanHub;
    planEnCache().then(function (c) {
      if (c) { if (verifierUnites(c) && ecranCourant === ecranPlanHub) ecranPlanHub(flash); return; }
      Api.appeler('plan', { jeton: (stock.lire(CLE.session) || {}).jeton }).then(function (d) { mettrePlanEnCache(d); if (verifierUnites(d) && ecranCourant === ecranPlanHub) ecranPlanHub(flash); }).catch(function () {});
    });
    var session = stock.lire(CLE.session);
    if (!session) return ecranConnexion();
    var rec = window.ReaQuiz ? window.ReaQuiz.records() : {};
    function record(cle) { return rec[cle] != null ? ' · record : ' + rec[cle] + ' erreur' + (rec[cle] > 1 ? 's' : '') : ''; }
    function jeu(cle) { return function () { window.ReaQuiz.jeu(cle, ecranPlanHub); }; }
    var tuiles = [
      { ic: '🗺️', nom: 'Plan interactif', desc: 'Toutes les pièces, les équipements et votre position GPS', ouvrir: ecranPlan, classe: 'quiz-theme--plan' },
      { ic: '🏷️', nom: 'Placer le nom des unités', desc: 'Glisser chaque nom d\'unité au bon endroit' + record('etiquettes'), ouvrir: jeu('etiquettes'), unites: true },
      { ic: '🖍️', nom: 'Colorier les unités', desc: 'Glisser chaque couleur sur la bonne étiquette' + record('couleurs'), ouvrir: jeu('couleurs'), unites: true },
      { ic: '🎨', nom: 'Colorier les chambres', desc: 'Chaque chambre avec la couleur de son unité' + record('chambres'), ouvrir: jeu('chambres'), unites: true },
      sansUnites ? { ic: '📍', nom: 'Où est… ?', desc: 'Retrouver les pièces du service sur le plan ou en QCM', ouvrir: function () { window.ReaQuiz.theme('plan', ecranPlanHub); } } : null,
      { ic: '🏆', nom: 'Niveau ultime', desc: 'Replacer toutes les pièces, zone par zone' + record('ultime'), ouvrir: jeu('ultime'), classe: 'quiz-theme--ultime' }
    ];
    afficher(h('div', { class: 'page page--large' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour à l\'accueil', onclick: ecranAccueil, text: '‹' }),
        h('h1', { class: 'entete__titre', text: 'Plan du service' }),
        h('span', { class: 'entete__role', text: 'Niveau 3' })),
      flash ? h('p', { class: 'flash', role: 'status', text: flash }) : null,
      h('div', { class: 'quiz-themes quiz-themes--plan' }, tuiles.filter(Boolean).filter(function (t) { return !(sansUnites && t.unites); }).map(function (t) {
        return h('button', { type: 'button', class: 'quiz-theme' + (t.classe ? ' ' + t.classe : ''), 'data-ic': t.ic, onclick: function () { t.ouvrir(); } }, h('b', { text: t.nom }), h('span', { text: t.desc }));
      })),
      h('p', { class: 'plan-note', text: 'Les jeux suivent le plan : chaque modification du plan est prise en compte automatiquement.' })));
    window.scrollTo(0, 0);
  }

  function ecranPlan() {
    ecranCourant = ecranPlan;
    var session = stock.lire(CLE.session);
    if (!session) return ecranConnexion();
    var zone = h('div', { class: 'zone-plan' }, h('div', { class: 'squelette', style: 'height:60vh' })), zoneGps = h('div', { class: 'zone-gps' });
    afficher(h('div', { class: 'page page--large' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour', onclick: function () { ecranPlanHub(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: 'Plan interactif' }),
        h('span', { class: 'entete__role', text: session.role === 'agent' ? 'Niveau 3' : 'Mode référent' })),
      zone, zoneGps,
      h('section', { class: 'decouverte', 'aria-labelledby': 't-decouverte', hidden: true }),
      h('p', { class: 'plan-note', text: 'Touchez une pièce pour voir son nom. Le plan reste consultable sans réseau sur ce téléphone, jusqu\'à la déconnexion.' })));
    var zoneDecouverte = document.querySelector('.decouverte');
    window.scrollTo(0, 0);
    var monte = false;
    function monter(r, depuisCache) {
      monte = true;
      var vus = stock.lire(CLE.planVu);       // { pieces: {P012: 1, …}, lieux: {poste: 1, …} }
      if (!vus || !vus.pieces) vus = { pieces: {}, lieux: {} };
      var OBJECTIF = 8;                         // badge « Plan exploré » : 8 pièces différentes, peu importe lesquelles
      var plan;
      function majDecouverte() {
        var n = Math.min(OBJECTIF, Object.keys(vus.pieces).length), fini = n >= OBJECTIF;
        if (fini && window.ReaBadges && !(stock.lire(CLE.badges) || {}).plan) window.ReaBadges.attribuer('plan');
        zoneDecouverte.hidden = false;
        zoneDecouverte.replaceChildren.apply(zoneDecouverte, [
          h('div', { class: 'decouverte__tete' }, h('h2', { id: 't-decouverte', text: 'Pièces explorées' }), h('span', { class: 'decouverte__compte', text: n + ' / ' + OBJECTIF })),
          h('div', { class: 'remplissage', role: 'progressbar', 'aria-label': 'Pièces explorées', 'aria-valuemin': '0', 'aria-valuemax': String(OBJECTIF), 'aria-valuenow': String(n) },
            h('div', { style: 'width:' + Math.round(100 * n / OBJECTIF) + '%;background:var(--succes)' })),
          h('p', { class: 'section__note', style: 'margin-top:8px', text: 'Touchez ' + OBJECTIF + ' pièces différentes du plan (chambres, bureaux, locaux…) pour obtenir le badge « Plan exploré ». Quelques idées :' }),
          h('ul', null, LIEUX_CLES.map(function (l) {
            return h('li', null, h('button', { type: 'button', 'aria-pressed': String(!!vus.lieux[l.id]), onclick: function () {
              var cible = plan.pieces().filter(function (p) { return lieuDe(p.nom) === l.id; })[0];
              if (cible) { plan.choisir(cible.id, true); document.querySelector('.plan__cadre').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            } }, h('span', { 'aria-hidden': 'true', text: vus.lieux[l.id] ? '✓' : '' }), l.nom));
          })),
          fini ? h('p', { class: 'decouverte__bravo', text: 'Bravo, vous avez exploré le plan ! Badge « Plan exploré » obtenu.' }) : null].filter(function (x) { return x != null; }));
      }
      plan = window.ReaPlan.creer(zone, {
        donnees: r.donnees, reglages: r.reglages, peutModifier: !!r.peutModifier && !depuisCache,
        mode: stock.lire(CLE.planMode) || 'texte',
        surMode: function (m) { stock.ecrire(CLE.planMode, m); },
        surChoix: function (id) {
          var p = plan.pieces().filter(function (x) { return x.id === id; })[0], lieu = p && lieuDe(p.nom), neuf = !vus.pieces[id];
          vus.pieces[id] = 1; if (lieu) vus.lieux[lieu] = 1;
          if (neuf || lieu) { stock.ecrire(CLE.planVu, vus); majDecouverte(); }
        },
        enregistrerPiece: function (id, d) {
          return Api.appeler('plan_piece', { jeton: session.jeton, id: id, donnees: d })
            .then(function () { majCache(); }, function (e) { throw new Error(message(e.code)); });
        },
        enregistrerPoint: function (id, d) {
          return Api.appeler('plan_point', { jeton: session.jeton, id: id, donnees: d })
            .then(function () { majCache(); }, function (e) { throw new Error(message(e.code)); });
        },
        enregistrerCategorie: function (cat, d) {
          return Api.appeler('plan_categorie', { jeton: session.jeton, categorie: cat, donnees: d })
            .then(function () { majCache(); }, function (e) { throw new Error(message(e.code)); });
        }
      });
      function majCache() { mettrePlanEnCache({ donnees: r.donnees, reglages: plan.reglages, peutModifier: r.peutModifier, gps: r.gps }); }
      majDecouverte();
      // Position GPS (calculée sur le téléphone, jamais envoyée) ; calage par un administrateur
      zoneGps.replaceChildren();
      if (window.ReaGps) {
        var barre = window.ReaGps.brancher({ h: h, zone: zone, plan: plan, calage: r.gps, admin: session.role === 'admin' && !depuisCache,
          enregistrer: function (c) {
            return Api.appeler('gps_calage', { jeton: session.jeton, calage: c }).then(function (x) { r.gps = x.calage; majCache(); }, function (e) { throw new Error(message(e.code)); });
          } });
        if (barre) zoneGps.appendChild(barre);
      }
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

  /* ---------- Newsletters ---------- */
  // Pages gardées sur le téléphone (lecture sans réseau), effacées à la déconnexion
  function cleNl(id, k) { return 'nl/' + id + '/' + k; }
  function nlDepuisCache(cle) {
    if (!window.caches) return Promise.resolve(null);
    return caches.open(CACHE_DONNEES).then(function (c) { return c.match(cle); }).catch(function () { return null; });
  }
  function nlEnCache(cle, reponse) {
    if (!window.caches || !stock.lire(CLE.session)) return;
    caches.open(CACHE_DONNEES).then(function (c) { return c.put(cle, reponse); }).catch(function () {});
  }
  function b64EnBlob(b64, type) {
    var bin = atob(b64), n = bin.length, octets = new Uint8Array(n);
    for (var i = 0; i < n; i++) octets[i] = bin.charCodeAt(i);
    return new Blob([octets], { type: type || 'image/jpeg' });
  }
  function pageNl(session, id, k) { // → Blob de l'image
    return nlDepuisCache(cleNl(id, k)).then(function (r) {
      if (r) return r.blob();
      return Api.appeler('nl_page', { jeton: session.jeton, id: id, page: k }).then(function (p) {
        var b = b64EnBlob(p.data, p.type);
        nlEnCache(cleNl(id, k), new Response(b, { headers: { 'Content-Type': 'image/jpeg' } }));
        return b;
      });
    });
  }
  function titreNl(n) { return n.titre + (n.parution ? ' – ' + n.parution : ''); }

  function ecranNewsletters(messageFlash) {
    ecranCourant = ecranNewsletters;
    var session = stock.lire(CLE.session);
    if (!session) return ecranConnexion();
    var zone = h('div', { class: 'nl' }, h('div', { class: 'squelette', style: 'height:140px' }), h('div', { class: 'squelette', style: 'height:140px;margin-top:12px' }));
    afficher(h('div', { class: 'page' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour à l\'accueil', onclick: ecranAccueil, text: '‹' }),
        h('h1', { class: 'entete__titre', text: 'Newsletter' }),
        h('span', { class: 'entete__role', text: session.role === 'admin' ? 'Administrateur' : 'Lettres d\'information' })),
      messageFlash ? h('p', { class: 'flash', role: 'status', text: messageFlash }) : null,
      zone));
    window.scrollTo(0, 0);
    function dessiner(d, depuisCache) {
      if (!zone.isConnected) return;
      var l = d.newsletters || [];
      zone.replaceChildren.apply(zone, [
        d.peutGerer && !depuisCache ? sectionAjoutNl(session) : null,
        l.length ? h('ul', { class: 'nl__liste' }, l.map(function (n, i) {
          var lu = (stock.lire(CLE.nlLues) || {})[n.id];
          return h('li', null, h('div', { class: 'carte-nl' },
            h('button', { type: 'button', class: 'carte-nl__ouvrir', onclick: function () { lireNewsletter(n); } },
              h('span', { class: 'carte-nl__vignette', 'data-id': n.id, style: 'aspect-ratio:1/' + (n.ratio || 1.414) }),
              h('span', { class: 'carte-nl__texte' },
                !lu ? h('span', { class: 'etiquette etiquette--nouveau', text: 'Nouveau' }) : (i === 0 ? h('span', { class: 'etiquette', text: 'Dernier numéro' }) : null),
                h('b', { class: 'carte-nl__titre' }, n.chu ? h('span', { class: 'etiquette etiquette--chu', text: 'CHU' }) : null, n.chu ? ' ' : null, n.titre),
                h('span', { class: 'carte-nl__info', text: (n.parution ? n.parution + ' · ' : '') + n.pages + ' page' + (n.pages > 1 ? 's' : '') }),
                h('span', { class: 'carte-nl__lire', text: 'Lire ›' }))),
            d.peutGerer && !depuisCache ? h('button', { type: 'button', class: 'bouton bouton--discret bouton--danger carte-nl__retirer', onclick: function (ev) {
              var b = ev.currentTarget; if (b.dataset.confirme !== '1') { b.dataset.confirme = '1'; b.textContent = 'Confirmer : retirer de l\'appli'; return; }
              b.disabled = true;
              Api.appeler('nl_retirer', { jeton: session.jeton, id: n.id }).then(function () { ecranNewsletters('Newsletter retirée.'); })
                .catch(function (e) { b.disabled = false; alerteDouce(b.parentNode, message(e.code)); });
            }, text: 'Retirer' }) : null));
        })) : h('p', { class: 'vide', text: 'Aucune newsletter pour le moment.' }),
        h('p', { class: 'section__note nl__note', text: 'Les newsletters lues restent consultables sans réseau sur ce téléphone, jusqu\'à la déconnexion.' })].filter(Boolean));
      // vignettes : première page (en cache ou téléchargée)
      zone.querySelectorAll('.carte-nl__vignette').forEach(function (v) {
        pageNl(session, v.getAttribute('data-id'), 0).then(function (b) {
          var img = h('img', { alt: '', src: URL.createObjectURL(b) }); v.replaceChildren(img); v.classList.add('carte-nl__vignette--ok');
        }).catch(function () { /* vignette absente hors ligne : sans gravité */ });
      });
    }
    nlDepuisCache('nl/liste').then(function (r) { return r ? r.json() : null; }).then(function (c) {
      if (c) dessiner(c, true);
      return Api.appeler('nl_liste', { jeton: session.jeton }).then(function (d) {
        nlEnCache('nl/liste', new Response(JSON.stringify({ newsletters: d.newsletters }), { headers: { 'Content-Type': 'application/json' } }));
        majBandeaux({ horsLigne: false }); dessiner(d, false);
      }).catch(function (e) {
        if (ERREURS_SESSION.indexOf(e.code) >= 0) { stock.effacer(CLE.session); return ecranConnexion(message(e.code)); }
        if (e.code === 'reseau') majBandeaux({ horsLigne: true, depuis: null });
        if (!c) zone.replaceChildren(h('p', { class: 'vide', text: message(e.code) }), h('button', { class: 'bouton', type: 'button', onclick: function () { ecranNewsletters(); }, text: 'Réessayer' }));
      });
    });
  }

  function lireNewsletter(n) {
    ecranCourant = null; // pas de rechargement automatique pendant la lecture
    var session = stock.lire(CLE.session);
    if (!session) return ecranConnexion();
    var lues = stock.lire(CLE.nlLues) || {}; if (!lues[n.id] && window.ReaJeux) window.ReaJeux.point('newsletter'); lues[n.id] = 1; stock.ecrire(CLE.nlLues, lues);
    var pages = [];
    for (var k = 0; k < n.pages; k++) pages.push(h('figure', { class: 'nl-page', style: 'aspect-ratio:1/' + (n.ratio || 1.414) },
      h('div', { class: 'squelette nl-page__attente' }), h('figcaption', { class: 'visuellement-cache', text: 'Page ' + (k + 1) + ' sur ' + n.pages })));
    afficher(h('div', { class: 'page page--large page--nl' },
      h('header', { class: 'entete entete--module' },
        h('button', { type: 'button', class: 'retour', 'aria-label': 'Retour aux newsletters', onclick: function () { ecranNewsletters(); }, text: '‹' }),
        h('h1', { class: 'entete__titre', text: n.titre }),
        h('span', { class: 'entete__role', text: n.parution || '' })),
      h('p', { class: 'section__note nl__aide', text: 'Écartez deux doigts pour zoomer sur une page.' }),
      h('div', { class: 'nl-pages' }, pages),
      h('button', { type: 'button', class: 'bouton bouton--discret nl__retour', onclick: function () { ecranNewsletters(); }, text: '‹ Toutes les newsletters' })));
    window.scrollTo(0, 0);
    // chargement page après page (la première s'affiche vite)
    (function suivante(k) {
      if (k >= n.pages || !pages[k].isConnected) return;
      pageNl(session, n.id, k).then(function (b) {
        var img = h('img', { alt: 'Page ' + (k + 1) + ' sur ' + n.pages + ' de ' + titreNl(n), src: URL.createObjectURL(b), decoding: 'async' });
        pages[k].replaceChildren(img); pages[k].classList.add('nl-page--ok');
        suivante(k + 1);
      }).catch(function (e) {
        pages[k].replaceChildren(h('div', { class: 'nl-page__erreur' }, h('p', { text: e.code === 'reseau' ? 'Page non disponible sans réseau.' : message(e.code) }),
          h('button', { type: 'button', class: 'bouton', onclick: function () { pages[k].replaceChildren(h('div', { class: 'squelette nl-page__attente' })); suivante(k); }, text: 'Réessayer' })));
      });
    })(0);
  }

  function sectionAjoutNl(session) {
    var fichier = h('input', { type: 'file', id: 'nl-fichier', accept: 'application/pdf,.pdf' });
    var titre = h('input', { type: 'text', id: 'nl-titre', maxlength: '80', placeholder: 'Ex. : Actu Réa #2', required: true });
    var parution = h('input', { type: 'text', id: 'nl-parution', maxlength: '40', placeholder: 'Ex. : Octobre 2026' });
    var etat = h('p', { class: 'section__note', role: 'status' }), erreur = h('p', { class: 'message-erreur', role: 'alert' });
    var apercu = h('div', { class: 'nl-apercu' });
    var bouton = h('button', { class: 'bouton', type: 'submit', text: 'Publier la newsletter', disabled: true });
    var conversion = null;
    function majBouton() { bouton.disabled = !conversion || !titre.value.trim(); }
    titre.addEventListener('input', majBouton);
    fichier.addEventListener('change', function () {
      conversion = null; majBouton(); erreur.textContent = ''; apercu.replaceChildren();
      var f = fichier.files && fichier.files[0]; if (!f) return;
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { erreur.textContent = 'Choisissez un fichier PDF.'; return; }
      if (f.size > 40 * 1024 * 1024) { erreur.textContent = 'Ce PDF dépasse 40 Mo.'; return; }
      etat.textContent = 'Préparation du convertisseur…'; fichier.disabled = true;
      window.ReaPdf.convertir(f, function (n, t) { etat.textContent = 'Conversion en images : page ' + n + ' sur ' + t + '…'; }).then(function (r) {
        conversion = r;
        apercu.replaceChildren.apply(apercu, r.apercus.map(function (src, i) { return h('img', { src: src, alt: 'Aperçu page ' + (i + 1) }); }));
        var ko = Math.round(r.pages.reduce(function (s, p) { return s + p.length * 0.75; }, 0) / 1024);
        etat.textContent = r.pages.length + ' page' + (r.pages.length > 1 ? 's' : '') + ' converties en images haute définition (' + (ko > 1024 ? (ko / 1024).toFixed(1) + ' Mo' : ko + ' Ko') + '). Vérifiez l\'aperçu puis publiez.';
        majBouton(); titre.focus();
      }).catch(function (e) {
        etat.textContent = ''; erreur.textContent = (e && e.message && !/^[a-z_]+$/.test(e.message)) ? e.message : 'Ce PDF n\'a pas pu être lu. Essayez de l\'exporter à nouveau (PDF standard).';
      }).finally(function () { fichier.disabled = false; });
    });
    var form = h('form', { class: 'form-carte nl-ajout', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); if (!conversion || !titre.value.trim()) return;
      erreur.textContent = ''; bouton.disabled = true; fichier.disabled = true;
      var pages = conversion.pages, id = null;
      etat.textContent = 'Création de la newsletter…';
      Api.appeler('nl_ajouter', { jeton: session.jeton, donnees: { titre: titre.value.trim(), parution: parution.value.trim(), pages: pages.length, ratio: conversion.ratio } })
        .then(function (r) {
          id = r.id;
          return pages.reduce(function (p, data, k) {
            return p.then(function () {
              etat.textContent = 'Envoi de la page ' + (k + 1) + ' sur ' + pages.length + '…';
              return Api.appeler('nl_envoyer_page', { jeton: session.jeton, id: id, page: k, data: data });
            });
          }, Promise.resolve());
        })
        .then(function () { etat.textContent = 'Publication…'; return Api.appeler('nl_publier', { jeton: session.jeton, id: id }); })
        .then(function () { ecranNewsletters('Newsletter publiée : elle est visible par toute l\'équipe.'); })
        .catch(function (e) { etat.textContent = ''; erreur.textContent = message(e.code) + ' La newsletter n\'a pas été publiée.'; bouton.disabled = false; fichier.disabled = false; });
    } },
      h('h3', { text: 'Ajouter une newsletter' }),
      h('p', { class: 'section__note', text: 'Choisissez le PDF : il est converti en images sur cet appareil, puis seules les images sont envoyées.' }),
      h('div', { class: 'champ' }, h('label', { for: 'nl-fichier', text: 'Fichier PDF' }), fichier),
      etat, apercu,
      h('div', { class: 'grille-2' },
        h('div', { class: 'champ' }, h('label', { for: 'nl-titre', text: 'Titre' }), titre),
        h('div', { class: 'champ' }, h('label', { for: 'nl-parution', text: 'Parution' }), parution)),
      erreur, bouton);
    return h('details', { class: 'section nl-admin' }, h('summary', { text: '+ Ajouter une newsletter' }), form);
  }

  function deconnexion() {
    stock.effacer(CLE.session); stock.effacer(CLE.accueil);
    // Supprime aussi les données mises en cache hors ligne (le plan) et l'historique de consultation
    stock.effacer(CLE.planVu);
    // Les réservations de visite (identifiant + code) restent : elles servent à annuler et au badge.
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

  // Utilisé par les modules suivants pour attribuer un badge
  // Outils partagés avec le module Quiz (js/quiz.js)
  window.ReaApp = {
    h: h, afficher: afficher, stock: stock, CLE: CLE, Api: Api, message: message, ERREURS_SESSION: ERREURS_SESSION,
    ecranAccueil: function () { ecranAccueil(); }, ecranConnexion: function (m) { ecranConnexion(m); },
    majBandeaux: function (c) { majBandeaux(c); }, definirEcran: function (f) { ecranCourant = f; },
    planEnCache: planEnCache, mettrePlanEnCache: mettrePlanEnCache, CACHE_DONNEES: CACHE_DONNEES, alerteDouce: alerteDouce,
    aujourdhui: aujourdhuiIso, dateCourte: dateCourte
  };
  window.ReaBadges = {
    attribuer: function (id) { var b = stock.lire(CLE.badges) || {}; b[id] = new Date().toISOString(); stock.ecrire(CLE.badges, b); }
  };

  /* ---------- Démarrage (après la mise à disposition des outils partagés) ---------- */
  function lancer() {
    var s = stock.lire(CLE.session);
    if (s && s.expiration && Date.parse(s.expiration) < Date.now()) { stock.effacer(CLE.session); s = null; }
    if (s) ecranAccueil(); else ecranConnexion();
  }
  if (Api.multi && window.ReaCap) window.ReaCap.demarrer(lancer); else lancer();
})();
