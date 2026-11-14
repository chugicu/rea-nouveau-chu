/**
 * Déménagement Réanimation – CHU de la Guadeloupe, puis Cap NCHUG (tous les services)
 * Moteur de l'application (Google Apps Script, lié au Google Sheets "Base" ou à l'annuaire Cap NCHUG).
 * 2.0 : Cap NCHUG : un seul moteur pour tous les services (mode « annuaire »), codes d'accès gérés dans l'appli.
 *
 * Étape 1 : installation, connexion par codes, accueil.
 * Étape 2 : plan du service (lecture du plan depuis le Drive, désignation des pièces par les référents).
 * Étape 3 : visites des locaux (créneaux, inscriptions prénom + initiale + fonction, présence, purge à J+30).
 * 1.3 : modification de la forme du plan (déplacer, redimensionner, supprimer, ajouter une pièce).
 * 1.7 : jeux (jauge du déménagement, souvenirs, concours photo, nuage, QR codes, paris, escape game, bingo), activables par l'administrateur.
 * 1.6 : quiz (questions rédigées, brouillons relus par l'administrateur, compteur collectif anonyme).
 * 1.5 : sections WC, Pharmacie, DM, Biomed, Secrétariats, Entretiens ; équipements placés sur le plan (chariots d'urgence, échographes, imprimantes).
 * 2.4 : PDF dans Documents et FAQ (images + texte pour la recherche), rubriques personnalisées partagées entre services, rubriques communes.
 * 1.4 : newsletters (PDF converti en images sur le téléphone de l'administrateur, pages stockées dans le Drive).
 *
 * Principes :
 *  - Aucune donnée de santé. Aucun compte Google demandé aux agents.
 *  - Les codes ne sont jamais stockés en clair : seulement leur empreinte (SHA-256 salée).
 *  - L'interface (GitHub Pages) appelle ce script en POST ; chaque appel porte un jeton signé.
 *
 * Installation : voir GUIDE_DEPLOIEMENT.md (menu « Réa – Administration » > « 1. Installer »).
 */

// ============================================================================
// Réglages
// ============================================================================
var APP = {
  nom: 'Réa – Nouveau CHU',
  version: '2.5.1',
  dureeJetonJours: { agent: 30, referent: 14, admin: 1, visiteur: 30 },
  longueurMinCode: 6,
  // Anti-force brute : au-delà de N échecs en 10 min, connexion bloquée 5 min pour tous
  maxEchecs: 30,
  fenetreEchecsSec: 600,
  blocageSec: 300
};

var ONGLETS = {
  parametres: 'Paramètres',
  effectifs: 'Effectifs',
  actualites: 'Actualités',
  prets: 'Je suis prêt',
  referents: 'Référents',
  pieces: 'Pièces',
  categories: 'Catégories',
  creneaux: 'Créneaux',
  inscriptions: 'Inscriptions',
  newsletters: 'Newsletters',
  points: 'Équipements',
  quiz: 'Quiz',
  jeux: 'Jeux', souvenirs: 'Souvenirs', nuage: 'Nuage', qr: 'QR codes', paris: 'Paris', pronostics: 'Pronostics', retours: 'Retours',
  escape: 'Escape game', documents: 'Documents et FAQ',
  streetPoints: 'Street – Points', streetLiens: 'Street – Liens'
};

// Visite virtuelle (visionneuse photo 360°) : points de prise de vue et liens entre eux (flèches, infos).
var STREET = {
  entetesPoints: ['ID', 'Nom', 'Zone', 'ID photo (Drive)', 'ID vignette (Drive)', 'ID illustration (Drive)', 'Cap initial', 'Date de prise de vue', 'Pris par'],
  entetesLiens: ['ID', 'Point de départ', 'Type', 'Point d\'arrivée', 'Position horizontale', 'Position verticale', 'Texte', 'Modifié le', 'Par'],
  reId: /^(E-\d{2}|C-\d{2,3}|CH-\d{3}|L-\d{2})$/,
  reLien: /^S[a-z0-9]{6,12}$/,
  types: ['fleche', 'info']
};

var NL = { maxPages: 16, maxOctetsPage: 3 * 1024 * 1024, entetes: ['ID', 'Titre', 'Parution', 'Pages', 'Fichiers (ID Drive)', 'Statut', 'Ajoutée le', 'Par', 'Format (largeur/hauteur)'] };

// Valeurs autorisées pour la désignation des pièces (identiques à docs/js/plan.js)
var PLAN = {
  categories: ['poste', 'soins', 'wc', 'pharmacie', 'dm', 'logistique', 'biomed', 'secretariat', 'entretien', 'bureau', 'personnel', 'familles', 'technique', 'urgence', 'exterieur', 'autre'],
  points: ['chariot', 'echographe', 'imprimante'],
  icones: ['poste', 'soins', 'bureau', 'personnel', 'garde', 'familles', 'vestiaire', 'office', 'linge', 'reserve', 'menage', 'pharmacie',
           'technique', 'reunion', 'simulation', 'urgence', 'dae', 'wc', 'dm', 'biomed', 'secretariat', 'entretien', 'exterieur', 'autre'],
  cacheSec: 21600
};

var FONCTIONS_DEFAUT = [
  ['Médecin', 30], ['Interne', 25], ['IDE', 100], ['AS', 50],
  ['ASH', 0], ['Cadre', 2], ['Secrétaire', 3], ['Kinésithérapeute', 3]
];

// ============================================================================
// Points d'entrée web
// ============================================================================
function doGet() {
  return json_({ ok: true, app: APP.nom, version: APP.version });
}

function doPost(e) {
  var req; MEMO_PROPS = {}; sortirService_();
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, erreur: 'requete_invalide' });
  }
  try {
    var action = String(req.action || ''); ACTION_COURANTE_ = action;
    // Annuaire (Cap NCHUG) : routes communes, puis entrée dans le service demandé
    if (action !== 'ping' && serviceDeplace_()) return json_({ ok: false, erreur: 'service_deplace' }); // rattaché à Cap NCHUG
    if (ROUTES_DEFI_GESTION[action]) return json_(ROUTES_DEFI_GESTION[action](req)); // Défi CHU : gestion commune
    if (ROUTES_ANNUAIRE[action]) { if (!modeAnnuaire_()) return json_({ ok: false, erreur: 'action_inconnue' }); return json_(ROUTES_ANNUAIRE[action](req)); }
    if (action !== 'ping' && modeAnnuaire_()) entrerService_(req.service);
    var routes = {
      ping: function () { return { ok: true, version: APP.version, serveur: new Date().toISOString() }; },
      login: function () { return login_(req.code); },
      home: function () { return home_(verifierJeton_(req.jeton)); },
      plan: function () { return plan_(verifierJeton_(req.jeton)); },
      plan_piece: function () { return planPiece_(exigerReferent_(verifierJeton_(req.jeton)), req.id, req.donnees); },
      jeux_etat: function () { return jeuxEtat_(verifierJeton_(req.jeton)); },
      jeux_reglage: function () { exigerAdmin_(verifierJeton_(req.jeton)); return jeuxReglage_(req.id, req.donnees); },
      jeux_points: function () { verifierJeton_(req.jeton); return jeuxPoints_(req.type, req.n); },
      souvenirs: function () { return souvenirsListe_(verifierJeton_(req.jeton), req.type); },
      souvenir_ajouter: function () { return souvenirAjouter_(verifierJeton_(req.jeton), req.donnees); },
      souvenir_photo: function () { return souvenirPhoto_(verifierJeton_(req.jeton), req.id, req.taille); },
      souvenir_moderer: function () { return souvenirModerer_(exigerReferent_(verifierJeton_(req.jeton)), req.id, req.statut); },
      souvenir_coeur: function () { verifierJeton_(req.jeton); return souvenirCoeur_(req.id, req.plus); },
      nuage: function () { return nuageListe_(verifierJeton_(req.jeton)); },
      nuage_ajouter: function () { verifierJeton_(req.jeton); return nuageAjouter_(req.q, req.mot); },
      nuage_retirer: function () { exigerReferent_(verifierJeton_(req.jeton)); return nuageRetirer_(req.ids); },
      qr_liste: function () { return qrListe_(verifierJeton_(req.jeton)); },
      qr_trouver: function () { verifierJeton_(req.jeton); return qrTrouver_(req.code); },
      qr_enregistrer: function () { exigerAdmin_(verifierJeton_(req.jeton)); return qrEnregistrer_(req.code, req.donnees); },
      paris: function () { return parisListe_(verifierJeton_(req.jeton), req.appareil); },
      pronostic: function () { verifierJeton_(req.jeton); return pronostic_(req.id, req.donnees); },
      pari_admin: function () { exigerAdmin_(verifierJeton_(req.jeton)); return pariAdmin_(req.id, req.donnees); },
      escape_scenarios: function () { return escapeScenarios_(verifierJeton_(req.jeton)); },
      escape_enregistrer: function () { return escapeEnregistrer_(exigerReferent_(verifierJeton_(req.jeton)), req.id, req.scenario, req.modeles); },
      escape_retirer: function () { return escapeRetirer_(exigerReferent_(verifierJeton_(req.jeton)), req.id, req.modeles); },
      escape_valider: function () { return escapeValider_(exigerReferent_(verifierJeton_(req.jeton)), req.scenario, req.valide, req.remarque); },
      quiz_liste: function () { return quizListe_(verifierJeton_(req.jeton)); },
      quiz_question: function () { return quizQuestion_(exigerReferent_(verifierJeton_(req.jeton)), req.id, req.donnees); },
      quiz_statut: function () { return quizStatut_(exigerReferent_(verifierJeton_(req.jeton)), req.ids, req.statut); },
      quiz_compteur: function () { verifierJeton_(req.jeton); return quizAjouterTotal_(req.n); },
      gps_calage: function () { return gpsCalage_(exigerAdmin_(verifierJeton_(req.jeton)), req.calage); },
      plan_point: function () { return planPoint_(exigerReferent_(verifierJeton_(req.jeton)), req.id, req.donnees); },
      plan_categorie: function () { return planCategorie_(exigerReferent_(verifierJeton_(req.jeton)), req.categorie, req.donnees); },
      street_liste: function () { return streetListe_(verifierJeton_(req.jeton)); },
      street_lien_modifier: function () { return streetLienModifier_(exigerReferent_(verifierJeton_(req.jeton)), req.id, req.donnees); },
      visites: function () { return visites_(verifierJeton_(req.jeton)); },
      visite_inscrire: function () { return visiteInscrire_(verifierJeton_(req.jeton), req.creneau, req.donnees); },
      visite_statut: function () { verifierJeton_(req.jeton); return visiteStatut_(req.reservations); },
      visite_annuler: function () { verifierJeton_(req.jeton); return visiteAnnuler_(req.id, req.code); },
      visite_creneau: function () { return visiteCreneau_(exigerReferent_(verifierJeton_(req.jeton)), req.donnees); },
      visite_presence: function () { exigerReferent_(verifierJeton_(req.jeton)); return visitePresence_(req.id, req.present); },
      nl_liste: function () { var r = nlListe_(verifierJeton_(req.jeton)); r.newsletters = communNewsletters_().concat(r.newsletters); return r; },
      nl_page: function () { var se = verifierJeton_(req.jeton), id = String(req.id || ''); if (id.indexOf('chu:') === 0) return avecCommun_(function () { return nlPage_({ r: 'agent' }, id.slice(4), req.page); }) || { ok: false, erreur: 'newsletter_introuvable' }; return nlPage_(se, id, req.page); },
      actu_liste: function () { exigerReferent_(verifierJeton_(req.jeton)); return actuListe_(); },
      actu_enregistrer: function () { return actuEnregistrer_(exigerReferent_(verifierJeton_(req.jeton)), req.donnees || {}); },
      actu_supprimer: function () { exigerReferent_(verifierJeton_(req.jeton)); return actuSupprimer_(req.ligne, req.titre); },
      service_reglages: function () { exigerAdmin_(verifierJeton_(req.jeton)); return serviceReglages_(req.donnees); },
      logo: function () { verifierJeton_(req.jeton); return logoLire_(); },
      logo_envoyer: function () { exigerAdmin_(verifierJeton_(req.jeton)); return logoEnvoyer_(req.data, req.type); },
      plan_importer: function () { return planImporter_(exigerAdmin_(verifierJeton_(req.jeton)), req.texte, req.enregistrer === true); },
      docs_liste: function () { return docsListe_(verifierJeton_(req.jeton), req.rubrique); },
      docs_pdf_envoyer: function () { exigerReferent_(verifierJeton_(req.jeton)); return docsPdfEnvoyer_(req.id, req.page, req.data); },
      docs_pdf_page: function () { return docsPdfPage_(verifierJeton_(req.jeton), req.id, req.page); },
      rub_etat: function () { exigerAdmin_(verifierJeton_(req.jeton)); return rubEtat_(); },
      rub_gerer: function () { return rubGerer_(exigerAdmin_(verifierJeton_(req.jeton)), req.quoi, req.id, req.donnees); },
      docs_enregistrer: function () { return docsEnregistrer_(exigerReferent_(verifierJeton_(req.jeton)), req.id, req.donnees || {}); },
      docs_supprimer: function () { exigerReferent_(verifierJeton_(req.jeton)); return docsSupprimer_(req.id); },
      nl_ajouter: function () { return nlAjouter_(exigerAdmin_(verifierJeton_(req.jeton)), req.donnees); },
      nl_envoyer_page: function () { exigerAdmin_(verifierJeton_(req.jeton)); return nlEnvoyerPage_(req.id, req.page, req.data); },
      nl_publier: function () { exigerAdmin_(verifierJeton_(req.jeton)); return nlPublier_(req.id); },
      nl_retirer: function () { exigerAdmin_(verifierJeton_(req.jeton)); return nlRetirer_(req.id); },
      // Codes d'accès gérés dans l'appli par l'administrateur du service
      codes_etat: function () { exigerAdmin_(verifierJeton_(req.jeton)); return codesEtat_(); },
      codes_changer: function () { return codesChanger_(exigerAdmin_(verifierJeton_(req.jeton)), req.quoi, req.nom, req.code); },
      // Défi CHU (commun à tous les services)
      defi_jour: function () { return defiJour_(verifierJeton_(req.jeton)); },
      defi_repondre: function () { return defiRepondre_(verifierJeton_(req.jeton), req.donnees); },
      defi_classement: function () { return defiClassement_(verifierJeton_(req.jeton)); },
      defi_parcours: function () { return defiParcours_(verifierJeton_(req.jeton)); },
      defi_plan: function () { return defiPlan_(verifierJeton_(req.jeton)); } // Plans du CHU : plan virtuel
    };
    if (!routes[action]) return json_({ ok: false, erreur: 'action_inconnue' });
    return json_(routes[action]());
  } catch (err) {
    var code = (err && err.codeApp) || 'erreur_serveur';
    if (code === 'erreur_serveur') console.error(err && err.stack || err);
    return json_({ ok: false, erreur: code });
  }
}

// ============================================================================
// Connexion
// ============================================================================
function login_(code) {
  code = normaliserCode_(code);
  if (!code) throw erreurApp_('code_manquant');

  var cache = cache_();
  if (cache.get('blocage')) throw erreurApp_('trop_de_tentatives');

  var props = props_();
  var empreinte = empreinte_(code);
  var role = null, libelle = '';

  if (empreinte === props.getProperty('CODE_ADMIN')) {
    role = 'admin'; libelle = 'Administrateur';
  } else {
    var refs = lireReferents_();
    for (var i = 0; i < refs.length; i++) {
      if (refs[i].actif && refs[i].empreinte === empreinte) { role = 'referent'; libelle = refs[i].nom; break; }
    }
    if (!role && empreinte === props.getProperty('CODE_SERVICE')) { role = 'agent'; libelle = ''; }
  }

  if (!role) {
    enregistrerEchec_(cache);
    Utilities.sleep(600);
    throw erreurApp_('code_incorrect');
  }

  var exp = Date.now() + APP.dureeJetonJours[role] * 86400000;
  return {
    ok: true,
    jeton: signerJeton_({ r: role, n: libelle, v: versionJetons_(), exp: exp, s: CTX_SERVICE ? CTX_SERVICE.id : undefined }),
    service: CTX_SERVICE ? CTX_SERVICE.id : undefined,
    role: role,
    libelle: libelle,
    expiration: new Date(exp).toISOString()
  };
}

function enregistrerEchec_(cache) {
  var n = Number(cache.get('echecs') || 0) + 1;
  cache.put('echecs', String(n), APP.fenetreEchecsSec);
  if (n >= APP.maxEchecs) {
    cache.put('blocage', '1', APP.blocageSec);
    cache.remove('echecs');
  }
}

// ============================================================================
// Accueil
// ============================================================================
function home_(session) {
  var ss = classeur_();
  var params = lireParametres_(ss);
  var dateJ = params['Date J'];
  var dateJIso = (dateJ instanceof Date && !isNaN(dateJ)) ? formaterDate_(dateJ) : null;

  return {
    ok: true,
    session: { role: session.r, libelle: session.n },
    service: params['Nom du service'] || 'Réanimation – USC',
    messageAccueil: params["Message d'accueil"] || '',
    rubriques: rubriquesActives_(params),
    perso: (function () { try { return rubriquesService_(ss, params); } catch (e) { console.error('rubriques : ' + e); return []; } })(), // rubriques personnalisées (2.4.0)
    logo: params['Logo du service (ID Drive)'] ? String(props_().getProperty('LOGO_VERSION') || '1') : null,
    dateJ: dateJIso,
    actualites: communActus_().concat(lireActualites_(ss)),
    newsletter: derniereNewsletterTout_(ss),
    jauge: calculerJauge_(ss),
    elan: calculerElan_(ss),
    misAJour: new Date().toISOString()
  };
}

function lireParametres_(ss) {
  var valeurs = ss.getSheetByName(ONGLETS.parametres).getDataRange().getValues();
  var p = {};
  for (var i = 1; i < valeurs.length; i++) {
    if (valeurs[i][0]) p[String(valeurs[i][0]).trim()] = valeurs[i][1];
  }
  return p;
}

/** Vrai/faux d'un paramètre, quelle que soit la façon dont il a été saisi.
   Le classeur est en français : une case cochée, un VRAI tapé à la main et un TRUE importé donnent trois
   valeurs différentes (booléen, texte « VRAI », texte « TRUE »). Toutes comptent pour « activé ». */
function parametreVrai_(v) {
  if (v === true) return true;
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'VRAI' || s === 'TRUE' || s === 'OUI';
}

function lireActualites_(ss) {
  var valeurs = ss.getSheetByName(ONGLETS.actualites).getDataRange().getValues();
  var liste = [];
  for (var i = 1; i < valeurs.length; i++) {
    var l = valeurs[i];
    if (!l[1] || l[3] !== true) continue; // Titre requis + case « Publiée » cochée
    liste.push({
      date: l[0] instanceof Date ? formaterDate_(l[0]) : '',
      titre: String(l[1]).slice(0, 120),
      texte: String(l[2] || '').slice(0, 2000),
      epinglee: l[4] === true
    });
  }
  liste.sort(function (a, b) {
    if (a.epinglee !== b.epinglee) return a.epinglee ? -1 : 1;
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });
  return liste.slice(0, 20);
}

/** Jauge collective anonyme : déclarations « prêt » / effectif, par fonction (plafonnée à 100 %). */
function calculerJauge_(ss) {
  var eff = ss.getSheetByName(ONGLETS.effectifs).getDataRange().getValues();
  var prets = ss.getSheetByName(ONGLETS.prets).getDataRange().getValues();
  var compte = {};
  for (var i = 1; i < prets.length; i++) {
    var f = String(prets[i][1] || '').trim();
    if (f) compte[f] = (compte[f] || 0) + 1;
  }
  var parFonction = [], totalEff = 0, totalPrets = 0;
  for (var j = 1; j < eff.length; j++) {
    var nom = String(eff[j][0] || '').trim();
    var n = Number(eff[j][1]) || 0;
    if (!nom || n <= 0) continue;
    var p = Math.min(compte[nom] || 0, n);
    parFonction.push({ fonction: nom, effectif: n, prets: p, pourcent: Math.round(100 * p / n) });
    totalEff += n; totalPrets += p;
  }
  return {
    pourcent: totalEff ? Math.round(100 * totalPrets / totalEff) : 0,
    prets: totalPrets,
    effectif: totalEff,
    parFonction: parFonction
  };
}

// ============================================================================
// Plan du service
// ============================================================================
/** Géométrie (fichier JSON du Drive, jamais publié sur GitHub) + réglages des référents. */
function plan_(session) {
  return { ok: true, donnees: geometriePlan_(), reglages: reglagesPlan_(), peutModifier: session.r !== 'agent', gps: lireGpsCalage_(), admin: session.r === 'admin',
    visiteVirtuelle: visiteVirtuelleActive_() };
}

function visiteVirtuelleActive_() {
  return parametreVrai_(lireParametres_(classeur_())['Visite virtuelle (activée)']);
}

/* ---------- GPS : calage du plan (admin), partagé avec tous ----------
   Le calage relie des points GPS du bâtiment à des points du plan : ce n'est pas une donnée personnelle.
   La position de chaque utilisateur est calculée sur son téléphone et n'est jamais envoyée. */
function lireGpsCalage_() {
  try { return JSON.parse(props_().getProperty('gps_calage') || 'null'); } catch (e) { return null; }
}
function gpsCalage_(session, c) {
  if (!c || !Array.isArray(c.points) || c.points.length > 40) throw erreurApp_('requete_invalide');
  var points = c.points.map(function (p) {
    var g = p && p.geo, q = p && p.plan;
    if (!Array.isArray(g) || !Array.isArray(q) || g.length !== 2 || q.length !== 2) throw erreurApp_('requete_invalide');
    var v = g.concat(q).map(Number);
    if (!v.every(isFinite) || Math.abs(v[0]) > 90 || Math.abs(v[1]) > 180) throw erreurApp_('requete_invalide');
    return { geo: [Math.round(v[0] * 1e7) / 1e7, Math.round(v[1] * 1e7) / 1e7], plan: [Math.round(v[2]), Math.round(v[3])], acc: Math.max(0, Math.min(999, Math.round(Number(p.acc) || 0))), nom: nettoyerTexte_(p.nom, 60) };
  });
  var val = { points: points, le: new Date().toISOString() };
  props_().setProperty('gps_calage', JSON.stringify(val));
  return { ok: true, calage: val };
}

function geometriePlan_() {
  var cache = cache_();
  var morceaux = Number(cache.get('plan_n') || 0), texte = '';
  if (morceaux) {
    var parts = cache.getAll(Array.apply(null, Array(morceaux)).map(function (_, i) { return 'plan_' + i; }));
    for (var i = 0; i < morceaux; i++) { if (parts['plan_' + i] == null) { texte = ''; break; } texte += parts['plan_' + i]; }
  }
  if (!texte) {
    var id = String(lireParametres_(classeur_())['Fichier du plan (ID Drive)'] || '').trim();
    if (!id) throw erreurApp_('plan_absent');
    try {
      var blob = DriveApp.getFileById(id).getBlob(), octets = blob.getBytes();
      var gzip = octets.length > 2 && (octets[0] & 255) === 31 && (octets[1] & 255) === 139; // fichier compressé (.json.gz)
      texte = gzip ? Utilities.ungzip(blob.setContentType('application/x-gzip')).getDataAsString('UTF-8') : blob.getDataAsString('UTF-8');
    } catch (e) { throw erreurApp_('plan_absent'); }
    var taille = 90000, valeurs = {}, n = Math.ceil(texte.length / taille);
    for (var j = 0; j < n; j++) valeurs['plan_' + j] = texte.substr(j * taille, taille);
    valeurs.plan_n = String(n);
    try { cache.putAll(valeurs, PLAN.cacheSec); } catch (e) { /* le cache est un plus */ }
  }
  return JSON.parse(texte);
}

function reglagesPlan_() {
  var ss = classeur_(), r = { pieces: {}, categories: {}, points: {} };
  try { synchroniserPlan_(ss); } catch (e) { console.error('synchronisation du plan : ' + e); } // ne bloque jamais l'affichage
  var p = ss.getSheetByName(ONGLETS.pieces).getDataRange().getValues();
  for (var i = 1; i < p.length; i++) {
    var id = String(p[i][0] || '').trim(); if (!id) continue;
    var o = {}, nom = String(p[i][1] || '');
    if (nom) { o.nom = nom; o.precision = String(p[i][2] || ''); }
    if (p[i][3]) o.categorie = String(p[i][3]);
    if (p[i][4]) o.icone = String(p[i][4]);
    if (p[i][5]) o.couleur = String(p[i][5]);
    var forme = String(p[i][8] || '').split(',').map(Number);
    if (forme.length === 4 && forme.every(isFinite)) o.forme = forme;
    if (p[i][9] === true) o.supprimee = true;
    if (p[i][10] === true) o.ajout = true;
    r.pieces[id] = o;
  }
  var c = ss.getSheetByName(ONGLETS.categories).getDataRange().getValues();
  for (var j = 1; j < c.length; j++) {
    var cat = String(c[j][0] || '').trim(), coul = String(c[j][1] || '').trim();
    if (cat && /^#[0-9a-fA-F]{6}$/.test(coul)) r.categories[cat] = { couleur: coul };
  }
  var shp = ss.getSheetByName(ONGLETS.points);
  if (shp) {
    var q = shp.getDataRange().getValues();
    for (var k = 1; k < q.length; k++) {
      var pid = String(q[k][0] || '').trim(), type = String(q[k][1] || '').trim(), x = Number(q[k][2]), y = Number(q[k][3]);
      if (pid && PLAN.points.indexOf(type) >= 0 && q[k][2] !== '' && q[k][3] !== '' && isFinite(x) && isFinite(y)) r.points[pid] = { type: type, x: x, y: y, precision: String(q[k][4] || '') };
    }
  }
  return r;
}

function exigerReferent_(session) {
  if (session.r !== 'referent' && session.r !== 'admin') throw erreurApp_('non_autorise');
  return session;
}

function exigerAdmin_(session) {
  if (session.r !== 'admin') throw erreurApp_('non_autorise');
  return session;
}

function nettoyerTexte_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max); }
function couleurValide_(v) { return v == null || v === '' ? '' : (/^#[0-9a-fA-F]{6}$/.test(String(v)) ? String(v) : null); }

/** Désigne (ou modifie) une pièce. donnees = null : retour au plan d'origine. */
function planPiece_(session, id, d) {
  id = String(id || '');
  if (!/^(P\d{3}|N[a-z0-9]{6,12})$/.test(id)) throw erreurApp_('requete_invalide'); // P… : pièce du plan, N… : pièce ajoutée
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var sh = classeur_().getSheetByName(ONGLETS.pieces), v = sh.getDataRange().getValues(), ligne = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) { ligne = i + 1; break; }
    if (d == null) { if (ligne > 0) sh.deleteRow(ligne); return { ok: true }; }
    var nom = nettoyerTexte_(d.nom, 40), precision = nom ? nettoyerTexte_(d.precision, 40) : '';
    if (d.categorie != null && d.categorie !== '' && PLAN.categories.indexOf(d.categorie) < 0) throw erreurApp_('requete_invalide');
    var categorie = d.categorie ? d.categorie : (nom ? 'autre' : '');
    var icone = PLAN.icones.indexOf(d.icone) >= 0 ? d.icone : null, couleur = couleurValide_(d.couleur);
    var forme = '';
    if (d.forme != null) {
      var f = Array.isArray(d.forme) ? d.forme.map(Number) : [];
      var ok = f.length === 4 && f.every(function (n) { return isFinite(n) && n > -2000 && n < 6000; }) && f[2] - f[0] >= 10 && f[3] - f[1] >= 10;
      if (!ok) throw erreurApp_('requete_invalide');
      forme = f.map(Math.round).join(',');
    }
    var supprimee = d.supprimee === true, ajout = /^N/.test(id);
    if (ajout && !forme) throw erreurApp_('requete_invalide');            // une pièce ajoutée a forcément une forme
    if (!nom && !forme && !supprimee && !couleur) throw erreurApp_('requete_invalide');
    if (couleur === null) throw erreurApp_('requete_invalide');
    colonnesRepere_(sh);
    var valeurs = [[id, nom, precision, categorie, icone || '', couleur, new Date(), session.n || 'Administrateur', forme, supprimee, ajout, ajout ? '' : repereDe_(indexPlan_(geometriePlan_())[id]), '']];
    if (ligne > 0) sh.getRange(ligne, 1, 1, 13).setValues(valeurs); else sh.appendRow(valeurs[0]);
    return { ok: true };
  } finally { verrou.releaseLock(); }
}

/** Ajoute, modifie (type, position, précision) ou supprime (donnees = null) un équipement placé sur le plan. */
function planPoint_(session, id, d) {
  id = String(id || '');
  if (!/^Q[a-z0-9]{6,12}$/.test(id)) throw erreurApp_('requete_invalide');
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var sh = classeur_().getSheetByName(ONGLETS.points);
    if (!sh) throw erreurApp_('non_installe');
    var v = sh.getDataRange().getValues(), ligne = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) { ligne = i + 1; break; }
    if (d == null) { if (ligne > 0) sh.deleteRow(ligne); return { ok: true }; }
    var x = Number(d.x), y = Number(d.y);
    if (PLAN.points.indexOf(d.type) < 0 || !isFinite(x) || !isFinite(y) || x < -2000 || x > 6000 || y < -2000 || y > 6000) throw erreurApp_('requete_invalide');
    var valeurs = [[id, d.type, Math.round(x), Math.round(y), nettoyerTexte_(d.precision, 40), new Date(), session.n || 'Administrateur']];
    if (ligne > 0) sh.getRange(ligne, 1, 1, 7).setValues(valeurs); else sh.appendRow(valeurs[0]);
    return { ok: true };
  } finally { verrou.releaseLock(); }
}

/** Couleur d'une catégorie entière (donnees = null ou couleur vide : couleur par défaut). */
function planCategorie_(session, categorie, d) {
  if (PLAN.categories.indexOf(categorie) < 0) throw erreurApp_('requete_invalide');
  var couleur = couleurValide_(d && d.couleur);
  if (couleur === null) throw erreurApp_('requete_invalide');
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var sh = classeur_().getSheetByName(ONGLETS.categories), v = sh.getDataRange().getValues(), ligne = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === categorie) { ligne = i + 1; break; }
    if (!couleur) { if (ligne > 0) sh.deleteRow(ligne); return { ok: true }; }
    var valeurs = [[categorie, couleur, new Date(), session.n || 'Administrateur']];
    if (ligne > 0) sh.getRange(ligne, 1, 1, 4).setValues(valeurs); else sh.appendRow(valeurs[0]);
    return { ok: true };
  } finally { verrou.releaseLock(); }
}

/* ---------- Visite virtuelle : points de prise de vue (Street – Points) et liens entre eux (Street – Liens) ----------
   Les photos et vignettes restent sur le Drive (jamais sur GitHub) ; seuls leurs identifiants Drive sont ici.
   Une nouvelle version du fichier du plan ne retouche pas ces identifiants : les points de prise de vue sont
   indépendants des pièces du plan schématique. */
function streetListe_(session) {
  var ss = classeur_(), shP = ss.getSheetByName(ONGLETS.streetPoints), shL = ss.getSheetByName(ONGLETS.streetLiens);
  if (!shP || !shL) return { ok: true, actif: false, points: {}, liens: [], peutModifier: session.r !== 'agent' };
  var points = {}, p = shP.getDataRange().getValues();
  for (var i = 1; i < p.length; i++) {
    var id = String(p[i][0] || '').trim(); if (!id) continue;
    points[id] = {
      nom: String(p[i][1] || ''), zone: String(p[i][2] || ''),
      photo: String(p[i][3] || ''), vignette: String(p[i][4] || ''), illustration: String(p[i][5] || ''),
      cap: isFinite(Number(p[i][6])) ? Number(p[i][6]) : 0
    };
  }
  var liens = [], l = shL.getDataRange().getValues();
  for (var j = 1; j < l.length; j++) {
    var lid = String(l[j][0] || '').trim(); if (!lid) continue;
    liens.push({
      id: lid, depart: String(l[j][1] || ''), type: String(l[j][2] || ''), arrivee: String(l[j][3] || ''),
      x: Number(l[j][4]), y: Number(l[j][5]), texte: String(l[j][6] || '')
    });
  }
  return { ok: true, actif: true, points: points, liens: liens, peutModifier: session.r !== 'agent' };
}

/** Ajoute, modifie ou supprime (donnees = null) un lien (flèche ou point d'info) entre deux points de prise de vue. */
function streetLienModifier_(session, id, d) {
  id = String(id || '');
  if (!STREET.reLien.test(id)) throw erreurApp_('requete_invalide');
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var ss = classeur_(), sh = ss.getSheetByName(ONGLETS.streetLiens);
    if (!sh) throw erreurApp_('non_installe');
    var v = sh.getDataRange().getValues(), ligne = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) { ligne = i + 1; break; }
    if (d == null) { if (ligne > 0) sh.deleteRow(ligne); return { ok: true }; }
    var depart = String(d.depart || ''), type = String(d.type || ''), arrivee = String(d.arrivee || '');
    if (!STREET.reId.test(depart) || STREET.types.indexOf(type) < 0) throw erreurApp_('requete_invalide');
    if (type === 'fleche' && !STREET.reId.test(arrivee)) throw erreurApp_('requete_invalide');
    if (type === 'info') arrivee = '';
    var x = Number(d.x), y = Number(d.y);
    if (!isFinite(x) || !isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) throw erreurApp_('requete_invalide');
    var texte = nettoyerTexte_(d.texte, 300);
    if (type === 'info' && texte.length < 2) throw erreurApp_('requete_invalide');
    var valeurs = [[id, depart, type, arrivee, Math.round(x * 10) / 10, Math.round(y * 10) / 10, texte, new Date(), session.n || 'Administrateur']];
    if (ligne > 0) sh.getRange(ligne, 1, 1, 9).setValues(valeurs); else sh.appendRow(valeurs[0]);
    return { ok: true };
  } finally { verrou.releaseLock(); }
}

/* ---------- Nouvelle version du fichier du plan : les modifications suivent les pièces ----------
   Les pièces du fichier sont numérotées P001, P002… : une nouvelle version du fichier peut changer cette numérotation.
   Chaque modification garde donc un « repère » (position et numéro de chambre de la pièce). Quand le fichier change,
   le moteur retrouve chaque pièce par son repère et met à jour les identifiants partout (Pièces, Quiz, QR codes).
   Rien n'est jamais effacé : une pièce introuvable est signalée « À vérifier » dans l'onglet Pièces (et reste
   visible sur le plan comme pièce ajoutée si sa forme est connue). Le détail est noté dans l'onglet « Suivi du plan ». */
var ENTETES_REPERE = ['Repère (automatique, ne pas modifier)', 'À vérifier'];
function colonnesRepere_(sh) {
  if (sh.getLastColumn() < 13 || String(sh.getRange(1, 12).getValue()) !== ENTETES_REPERE[0])
    sh.getRange(1, 12, 1, 2).setValues([ENTETES_REPERE]).setFontWeight('bold').setBackground('#223b80').setFontColor('#ffffff');
}
function indexPlan_(D) { // id → { c: centre, b: rectangle, ch: numéro de chambre }
  var ix = {};
  (D.pieces || []).forEach(function (p) {
    var b = p.r || p.bbox; if (!b || b.length < 4) return;
    ix[p.id] = { c: p.centre ? [p.centre[0], p.centre[1]] : [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], b: b, ch: p.chambre ? String(p.chambre) : '' };
  });
  return ix;
}
function repereDe_(x) { return x ? Math.round(x.c[0]) + ',' + Math.round(x.c[1]) + (x.ch ? '|' + x.ch : '') : ''; }
function lireRepere_(t) {
  var m = /^(-?\d+),(-?\d+)(?:\|(.+))?$/.exec(String(t || '').trim());
  return m ? { c: [Number(m[1]), Number(m[2])], ch: m[3] || '' } : null;
}
function empreintePlan_(ix) {
  var t = Object.keys(ix).sort().map(function (id) { return id + ':' + ix[id].b.map(Math.round).join(','); }).join(';');
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, t)).slice(0, 22);
}
function retrouverPiece_(rep, ix, pris) { // la pièce du nouveau plan qui correspond au repère
  var ids = Object.keys(ix).filter(function (id) { return !pris[id]; });
  if (rep.ch) { var memes = ids.filter(function (id) { return ix[id].ch === rep.ch; }); if (memes.length === 1) return memes[0]; }
  var meilleur = null, dmin = Infinity;
  ids.forEach(function (id) {
    var x = ix[id], dedans = rep.c[0] >= x.b[0] && rep.c[0] <= x.b[2] && rep.c[1] >= x.b[1] && rep.c[1] <= x.b[3];
    var d = Math.hypot(x.c[0] - rep.c[0], x.c[1] - rep.c[1]);
    if ((dedans || d <= 40) && d < dmin) { dmin = d; meilleur = id; }
  });
  return meilleur;
}
function synchroniserPlan_(ss) {
  var props = props_(), ix = indexPlan_(geometriePlan_()), emp = empreintePlan_(ix), avant = props.getProperty('plan_empreinte');
  if (avant === emp) return null;
  var verrou = LockService.getScriptLock(); if (!verrou.tryLock(5000)) return null;
  try {
    if (props.getProperty('plan_empreinte') === emp) return null;
    var sh = ss.getSheetByName(ONGLETS.pieces); colonnesRepere_(sh);
    var v = sh.getDataRange().getValues(), corresp = {}, pris = {}, journal = [], i;
    if (!avant) { // première fois : on note le repère des pièces déjà modifiées (le plan n'a pas encore changé)
      for (i = 1; i < v.length; i++) { var id0 = String(v[i][0] || ''); if (/^P/.test(id0) && !v[i][11] && ix[id0]) sh.getRange(i + 1, 12).setValue(repereDe_(ix[id0])); }
      props.setProperty('plan_empreinte', emp); return { premier: true };
    }
    for (i = 1; i < v.length; i++) { // 1) les pièces qui n'ont pas bougé gardent leur identifiant
      var id = String(v[i][0] || ''), rep = lireRepere_(v[i][11]);
      if (!/^P/.test(id) || !rep || !ix[id]) continue;
      if (Math.hypot(ix[id].c[0] - rep.c[0], ix[id].c[1] - rep.c[1]) <= 40 && (!rep.ch || ix[id].ch === rep.ch)) { pris[id] = 1; v[i].__ok = true; }
    }
    for (i = 1; i < v.length; i++) { // 2) les autres sont retrouvées par leur repère
      var id2 = String(v[i][0] || ''), rep2 = lireRepere_(v[i][11]);
      if (!/^P/.test(id2) || v[i].__ok) continue;
      var nom = String(v[i][1] || '') || '(sans nom)';
      if (!rep2) { sh.getRange(i + 1, 13).setValue('Repère inconnu : vérifier sur le plan'); journal.push([new Date(), id2, '', nom, 'À vérifier (pas de repère)']); continue; }
      var nouvel = retrouverPiece_(rep2, ix, pris);
      if (nouvel) {
        pris[nouvel] = 1; corresp[id2] = nouvel;
        sh.getRange(i + 1, 1).setValue(nouvel); sh.getRange(i + 1, 12, 1, 2).setValues([[repereDe_(ix[nouvel]), '']]);
        journal.push([new Date(), id2, nouvel, nom, 'Rattachée']);
      } else if (v[i][9] === true) { // pièce masquée qui n'existe plus : rien à afficher
        sh.getRange(i + 1, 13).setValue('Pièce masquée absente du nouveau plan'); journal.push([new Date(), id2, '', nom, 'Masquée, absente du nouveau plan']);
      } else {
        var forme = String(v[i][8] || ''), nid = 'N' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toLowerCase();
        if (!forme) forme = [rep2.c[0] - 40, rep2.c[1] - 40, rep2.c[0] + 40, rep2.c[1] + 40].join(',');
        sh.getRange(i + 1, 1).setValue(nid); sh.getRange(i + 1, 9).setValue(forme); sh.getRange(i + 1, 11).setValue(true);
        sh.getRange(i + 1, 13).setValue('Pièce introuvable dans le nouveau plan : gardée comme pièce ajoutée, à vérifier');
        corresp[id2] = nid; journal.push([new Date(), id2, nid, nom, 'Introuvable : gardée comme pièce ajoutée, à vérifier']);
      }
    }
    remplacerIds_(ss, corresp);
    if (journal.length) { var sj = creerOnglet_(ss, 'Suivi du plan', ['Date', 'Ancien ID', 'Nouvel ID', 'Nom', 'Résultat'], []); sj.getRange(sj.getLastRow() + 1, 1, journal.length, 5).setValues(journal); }
    props.setProperty('plan_empreinte', emp);
    return { corresp: corresp, journal: journal };
  } finally { verrou.releaseLock(); }
}
function remplacerIds_(ss, corresp) { // dans les questions du quiz (pièces liées, bonne réponse) et les QR codes
  if (!Object.keys(corresp).length) return;
  function conv(t) { return String(t || '').split(',').map(function (x) { x = x.trim(); return corresp[x] || x; }).join(','); }
  var q = ss.getSheetByName(ONGLETS.quiz);
  if (q) { var vq = q.getDataRange().getValues(); for (var i = 1; i < vq.length; i++) {
    if (vq[i][7]) q.getRange(i + 1, 8).setValue(conv(vq[i][7]));
    if (String(vq[i][2]) === 'plan' && vq[i][5]) q.getRange(i + 1, 6).setValue(conv(vq[i][5]));
  } }
  var r = ss.getSheetByName(ONGLETS.qr);
  if (r) { var vr = r.getDataRange().getValues(); for (var j = 1; j < vr.length; j++) if (corresp[String(vr[j][2] || '')]) r.getRange(j + 1, 3).setValue(corresp[String(vr[j][2])]); }
}

/** À lancer après avoir remplacé le fichier du plan dans le Drive. */
function viderCachePlan() { viderCachePlan_(); alerte_('Le plan sera relu depuis le Drive au prochain affichage.'); }
function viderCachePlan_() {
  var cache = cache_(), n = Number(cache.get('plan_n') || 0);
  cache.removeAll(['plan_n'].concat(Array.apply(null, Array(n)).map(function (_, i) { return 'plan_' + i; })));
}

// ============================================================================
// Visites des locaux
// ============================================================================
var VISITE = { joursPasses: 30, maxPlaces: 50, maxReservations: 10 };

function maintenantLocal_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm"); }
function texteDate_(v) { return v instanceof Date ? formaterDate_(v) : String(v || '').trim(); }
function texteHeure_(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm') : String(v || '').trim(); }
function decalerJours_(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function lireCreneaux_(ss) {
  var v = ss.getSheetByName(ONGLETS.creneaux).getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0] || '').trim(); if (!id) continue;
    l.push({ ligne: i + 1, id: id, date: texteDate_(v[i][1]), heure: texteHeure_(v[i][2]), duree: Number(v[i][3]) || 60,
             lieu: String(v[i][4] || ''), guide: String(v[i][5] || ''), places: Number(v[i][6]) || 0, statut: String(v[i][7] || 'ouvert') });
  }
  return l;
}
function lireInscriptions_(ss) {
  var v = ss.getSheetByName(ONGLETS.inscriptions).getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0] || '').trim(); if (!id) continue;
    l.push({ ligne: i + 1, id: id, creneau: String(v[i][1]), prenom: String(v[i][2] || ''), initiale: String(v[i][3] || ''),
             fonction: String(v[i][4] || ''), empreinte: String(v[i][5] || ''), present: v[i][7] === true });
  }
  return l;
}
function fonctionsService_(ss) {
  var v = ss.getSheetByName(ONGLETS.effectifs).getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) if (String(v[i][0] || '').trim() && Number(v[i][1]) > 0) l.push(String(v[i][0]).trim());
  return l;
}
function publierCreneau_(c, inscrits, avecListe) {
  var o = { id: c.id, date: c.date, heure: c.heure, duree: c.duree, lieu: c.lieu, guide: c.guide, places: c.places,
            inscrits: inscrits.length, restantes: Math.max(0, c.places - inscrits.length), statut: c.statut };
  if (avecListe) o.liste = inscrits.map(function (x) { return { id: x.id, prenom: x.prenom, initiale: x.initiale, fonction: x.fonction, present: x.present }; });
  return o;
}

/** Créneaux à venir (et, pour les référents, ceux des 30 derniers jours avec la liste des inscrits). */
function visites_(session) {
  var ss = classeur_(), ref = session.r !== 'agent', maintenant = maintenantLocal_(), jour = maintenant.slice(0, 10);
  var limite = ref ? decalerJours_(jour, -VISITE.joursPasses) : jour;
  var ins = lireInscriptions_(ss), parCreneau = {};
  ins.forEach(function (x) { (parCreneau[x.creneau] = parCreneau[x.creneau] || []).push(x); });
  var liste = lireCreneaux_(ss).filter(function (c) { return c.date >= limite && (ref || c.statut !== 'annulé'); })
    .sort(function (a, b) { return (a.date + a.heure) < (b.date + b.heure) ? -1 : 1; })
    .map(function (c) { return publierCreneau_(c, parCreneau[c.id] || [], ref); });
  return { ok: true, creneaux: liste, fonctions: fonctionsService_(ss), maintenant: maintenant, peutModifier: ref };
}

function visiteInscrire_(session, idCreneau, d) {
  d = d || {};
  var prenom = nettoyerTexte_(d.prenom, 20), initiale = nettoyerTexte_(d.initiale, 1).toUpperCase(), fonction = String(d.fonction || '');
  if (!prenom || !/^[A-ZÀ-Ý]$/.test(initiale)) throw erreurApp_('requete_invalide');
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var ss = classeur_();
    if (fonctionsService_(ss).indexOf(fonction) < 0) throw erreurApp_('requete_invalide');
    var c = lireCreneaux_(ss).filter(function (x) { return x.id === String(idCreneau); })[0];
    if (!c || c.statut === 'annulé') throw erreurApp_('creneau_introuvable');
    if (c.date + 'T' + c.heure < maintenantLocal_()) throw erreurApp_('creneau_passe');
    var pris = lireInscriptions_(ss).filter(function (x) { return x.creneau === c.id; }).length;
    if (pris >= c.places) throw erreurApp_('creneau_complet');
    var id = 'I' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), code = genererCode_(6);
    ss.getSheetByName(ONGLETS.inscriptions).appendRow([id, c.id, prenom, initiale, fonction, empreinte_(code), new Date(), false]);
    if (jeuxConfig_(ss).jauge.actif) ajouterPointsJeux_(JEUX.points.visite, true);
    return { ok: true, id: id, code: code, creneau: publierCreneau_(c, new Array(pris + 1), false) };
  } finally { verrou.releaseLock(); }
}

/** Statut des réservations gardées sur le téléphone (identifiant + code). Sert au badge « Visite faite ». */
function visiteStatut_(reservations) {
  reservations = (Array.isArray(reservations) ? reservations : []).slice(0, VISITE.maxReservations);
  var ss = classeur_(), ins = lireInscriptions_(ss), cr = {}, parCreneau = {};
  lireCreneaux_(ss).forEach(function (c) { cr[c.id] = c; });
  ins.forEach(function (x) { (parCreneau[x.creneau] = parCreneau[x.creneau] || []).push(x); });
  return { ok: true, maintenant: maintenantLocal_(), reservations: reservations.map(function (r) {
    var x = ins.filter(function (i) { return i.id === String(r && r.id); })[0];
    if (!x || x.empreinte !== empreinte_(normaliserCode_(r.code))) return { id: String(r && r.id), existe: false };
    var c = cr[x.creneau];
    return { id: x.id, existe: true, present: x.present, prenom: x.prenom, initiale: x.initiale, fonction: x.fonction,
             creneau: c ? publierCreneau_(c, parCreneau[c.id] || [], false) : null };
  }) };
}

function visiteAnnuler_(id, code) {
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var ss = classeur_(), x = lireInscriptions_(ss).filter(function (i) { return i.id === String(id); })[0];
    if (!x || x.empreinte !== empreinte_(normaliserCode_(code))) throw erreurApp_('reservation_introuvable');
    ss.getSheetByName(ONGLETS.inscriptions).deleteRow(x.ligne);
    return { ok: true };
  } finally { verrou.releaseLock(); }
}

/** Création, modification ou annulation d'un créneau (référents). */
function visiteCreneau_(session, d) {
  d = d || {};
  var date = String(d.date || ''), heure = String(d.heure || ''), duree = Math.round(Number(d.duree)), places = Math.round(Number(d.places));
  var lieu = nettoyerTexte_(d.lieu, 80), guide = nettoyerTexte_(d.guide, 40), statut = d.statut === 'annulé' ? 'annulé' : 'ouvert';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(heure) || !(duree >= 15 && duree <= 240) ||
      !(places >= 1 && places <= VISITE.maxPlaces)) throw erreurApp_('requete_invalide');
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var ss = classeur_(), sh = ss.getSheetByName(ONGLETS.creneaux), auteur = session.n || 'Administrateur';
    var ligne = [date, heure, duree, lieu, guide, places, statut, auteur, new Date()];
    if (d.id) {
      var c = lireCreneaux_(ss).filter(function (x) { return x.id === String(d.id); })[0];
      if (!c) throw erreurApp_('creneau_introuvable');
      var pris = lireInscriptions_(ss).filter(function (x) { return x.creneau === c.id; }).length;
      if (statut === 'ouvert' && places < pris) throw erreurApp_('places_insuffisantes');
      sh.getRange(c.ligne, 2, 1, 9).setValues([ligne]);
      return { ok: true, id: c.id };
    }
    var id = 'C' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    sh.appendRow([id].concat(ligne));
    return { ok: true, id: id };
  } finally { verrou.releaseLock(); }
}

function visitePresence_(id, present) {
  var ss = classeur_(), x = lireInscriptions_(ss).filter(function (i) { return i.id === String(id); })[0];
  if (!x) throw erreurApp_('reservation_introuvable');
  ss.getSheetByName(ONGLETS.inscriptions).getRange(x.ligne, 8).setValue(present === true);
  return { ok: true };
}

/** Données personnelles des visites (prénom, initiale, fonction) effacées à J+30. Lancée chaque nuit. */
function purgerVisites() { // tâche quotidienne ; en mode annuaire, pour chaque service ; puis les totaux du Défi CHU
  var defi; try { defi = defiArchiver_(); } catch (e) { defi = 'Défi : ' + e.message; }
  if (!modeAnnuaire_()) return purgerVisitesService_() + '\n' + defi;
  var r = [];
  lireServices_().forEach(function (sv) { if (!sv.actif) return; try { entrerService_(sv.id); r.push(sv.nom + ' : ' + purgerVisitesService_()); } catch (e) { r.push(sv.nom + ' : ' + e.message); } });
  sortirService_(); r.push(defi); return r.join('\n');
}
function purgerVisitesService_() {
  var ss = classeur_(), j = lireParametres_(ss)['Date J'];
  if (!(j instanceof Date) || isNaN(j)) return 'Date J non fixée : rien à purger.';
  if (formaterDate_(new Date()) <= decalerJours_(formaterDate_(j), 30)) return 'Purge prévue après le ' + decalerJours_(formaterDate_(j), 30) + '.';
  var sh = ss.getSheetByName(ONGLETS.inscriptions), n = sh.getLastRow() - 1;
  if (n > 0) sh.deleteRows(2, n);
  return n > 0 ? n + ' inscription(s) effacée(s).' : 'Aucune inscription à effacer.';
}
function menuPurgerVisites() { alerte_(purgerVisites()); }

function installerPurgeQuotidienne_() {
  var existe = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'purgerVisites'; });
  if (!existe) ScriptApp.newTrigger('purgerVisites').timeBased().everyDays(1).atHour(3).create();
}

// ============================================================================
// Newsletters : chaque page est une image JPEG (fabriquée depuis le PDF sur l'appareil de l'administrateur),
// rangée dans un dossier privé du Drive et servie uniquement aux personnes connectées.
// ============================================================================
function lireNewsletters_(ss) {
  var sh = ss.getSheetByName(ONGLETS.newsletters);
  if (!sh) return [];
  var v = sh.getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0] || '').trim(); if (!id) continue;
    var fichiers = []; try { fichiers = JSON.parse(v[i][4] || '[]'); } catch (e) { fichiers = []; }
    l.push({ ligne: i + 1, id: id, titre: String(v[i][1] || ''), parution: String(v[i][2] || ''), pages: Number(v[i][3]) || 0,
      fichiers: fichiers, statut: String(v[i][5] || '').trim().toLowerCase(),
      ajout: v[i][6] instanceof Date ? formaterDate_(v[i][6]) : String(v[i][6] || ''), ratio: Number(v[i][8]) || 1.414 });
  }
  return l;
}
function publieeNl_(n) { return n.statut === 'publiée' || n.statut === 'publiee'; }
function derniereNewsletter_(ss) {
  var l = lireNewsletters_(ss).filter(publieeNl_);
  if (!l.length) return null;
  var n = l[l.length - 1];
  return { id: n.id, titre: n.titre };
}
function nlListe_(session) {
  var l = lireNewsletters_(classeur_()).filter(publieeNl_).reverse() // la plus récente d'abord
    .map(function (n) { return { id: n.id, titre: n.titre, parution: n.parution, pages: n.pages, ratio: n.ratio, ajout: n.ajout }; });
  return { ok: true, newsletters: l, peutGerer: session.r === 'admin' };
}
function trouverNl_(id) {
  id = String(id || '');
  if (!/^NL[a-z0-9]{6,12}$/.test(id)) throw erreurApp_('requete_invalide');
  var ss = classeur_(), l = lireNewsletters_(ss);
  for (var i = 0; i < l.length; i++) if (l[i].id === id) return { ss: ss, nl: l[i] };
  throw erreurApp_('newsletter_introuvable');
}
function nlPage_(session, id, page) {
  var t = trouverNl_(id), n = t.nl, k = Number(page);
  if (!publieeNl_(n) && session.r !== 'admin') throw erreurApp_('newsletter_introuvable');
  if (!(k >= 0 && k < n.pages && n.fichiers[k])) throw erreurApp_('requete_invalide');
  var octets = DriveApp.getFileById(n.fichiers[k]).getBlob().getBytes();
  return { ok: true, page: k, type: 'image/jpeg', data: Utilities.base64Encode(octets) };
}
function dossierNewsletters_(ss) { return dossierPrive_(ss, 'Dossier des newsletters (ID Drive)', 'Réa – Newsletters'); }
function dossierPrive_(ss, nom, titre) { // dossier Drive privé, créé à côté du Google Sheets au premier envoi
  var params = lireParametres_(ss), id = String(params[nom] || '').trim();
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* dossier supprimé : on en recrée un */ } }
  var parents = DriveApp.getFileById(ss.getId()).getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var dossier = parent.createFolder(titre);
  ajouterParametre_(ss, nom, 'Créé automatiquement au premier envoi. Dossier privé : ne pas le partager.');
  var sh = ss.getSheetByName(ONGLETS.parametres), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === nom) sh.getRange(i + 1, 2).setValue(dossier.getId());
  return dossier;
}
function nlAjouter_(session, d) {
  d = d || {};
  var titre = nettoyerTexte_(d.titre, 80), parution = nettoyerTexte_(d.parution, 40), pages = Number(d.pages), ratio = Number(d.ratio);
  if (!titre || !(pages >= 1 && pages <= NL.maxPages && Math.floor(pages) === pages)) throw erreurApp_('requete_invalide');
  if (!(ratio > 0.2 && ratio < 5)) ratio = 1.414;
  var ss = classeur_(), sh = ss.getSheetByName(ONGLETS.newsletters);
  if (!sh) throw erreurApp_('non_installe');
  var id = 'NL' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toLowerCase();
  sh.appendRow([id, titre, parution, pages, '[]', 'brouillon', new Date(), session.n || 'Administrateur', Math.round(ratio * 1000) / 1000]);
  return { ok: true, id: id };
}
function nlEnvoyerPage_(id, page, data) {
  var verrou = LockService.getScriptLock(); verrou.waitLock(20000);
  try {
    var t = trouverNl_(id), n = t.nl, k = Number(page);
    if (n.statut !== 'brouillon' || !(k >= 0 && k < n.pages && Math.floor(k) === k)) throw erreurApp_('requete_invalide');
    var octets;
    try { octets = Utilities.base64Decode(String(data || '')); } catch (e) { throw erreurApp_('requete_invalide'); }
    // Seules des images JPEG sont acceptées (signature FF D8 FF), de taille raisonnable
    if (octets.length < 1000 || octets.length > NL.maxOctetsPage || (octets[0] & 255) !== 0xFF || (octets[1] & 255) !== 0xD8 || (octets[2] & 255) !== 0xFF) throw erreurApp_('requete_invalide');
    var dossier = dossierNewsletters_(t.ss);
    if (n.fichiers[k]) { try { DriveApp.getFileById(n.fichiers[k]).setTrashed(true); } catch (e) { /* déjà absent */ } }
    var f = dossier.createFile(Utilities.newBlob(octets, 'image/jpeg', n.id + '-page' + (k + 1) + '.jpg'));
    n.fichiers[k] = f.getId();
    t.ss.getSheetByName(ONGLETS.newsletters).getRange(n.ligne, 5).setValue(JSON.stringify(n.fichiers));
    return { ok: true, page: k };
  } finally { verrou.releaseLock(); }
}
function nlPublier_(id) {
  var t = trouverNl_(id), n = t.nl;
  for (var k = 0; k < n.pages; k++) if (!n.fichiers[k]) throw erreurApp_('newsletter_incomplete');
  t.ss.getSheetByName(ONGLETS.newsletters).getRange(n.ligne, 6).setValue('publiée');
  return { ok: true };
}
function nlRetirer_(id) {
  var t = trouverNl_(id), n = t.nl;
  n.fichiers.forEach(function (fid) { if (fid) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) { /* déjà absent */ } } });
  t.ss.getSheetByName(ONGLETS.newsletters).getRange(n.ligne, 5, 1, 2).setValues([['[]', 'retirée']]);
  return { ok: true };
}

// ============================================================================
// Quiz : questions rédigées (QCM, vrai/faux, toucher sur le plan) + compteur collectif anonyme.
// Les questions automatiques (pièces, unités, couleurs, équipements) sont fabriquées dans l'appli à partir du plan.
// Aucune réponse individuelle n'est enregistrée : seul un total anonyme est compté.
// ============================================================================
var QUIZ = {
  entetes: ['ID', 'Thème', 'Type', 'Question', 'Propositions', 'Bonne réponse', 'Explication', 'Pièces liées', 'Statut', 'Auteur', 'Créée le', 'Modifiée le'],
  themes: ['plan', 'urgences'], types: ['qcm', 'vf', 'plan'], objectifDefaut: 3000
};
// Première banque, préparée par Claude : arrive en brouillon, l'administrateur relit puis publie.
var QUIZ_BANQUE = [
  ['plan', 'qcm', 'Combien de lits de réanimation compte le nouveau service (hors lits gelés) ?', ['29', '34', '38', '45'], 0, 'Bougainvillier 9 + Hibiscus 8 + Atoumo 4 + Flamboyant 8 = 29 lits de réanimation.'],
  ['plan', 'qcm', 'Quelle unité regroupe les 4 lits de SRPR (chambres 330 à 333) ?', ['Orchidée', 'Mahogany', 'Cannelle', 'Atoumo'], 0, 'Orchidée : SRPR, 4 lits, chambres 330 à 333.'],
  ['plan', 'qcm', 'Mahogany, c\'est…', ['L\'USC (12 lits)', 'La SRPR (4 lits)', 'Une unité de réanimation (8 lits)', 'Les lits gelés'], 0, 'Mahogany est l\'USC : 12 lits, chambres 341 à 352.'],
  ['plan', 'vf', 'Les 5 lits de Cannelle (chambres 336 à 340) sont gelés à l\'ouverture.', null, 'vrai', 'Cannelle compte 5 lits gelés, en réserve.'],
  ['plan', 'qcm', 'Les chambres 334 et 335 sont destinées…', ['Aux brûlés ambulatoires', 'À la SRPR', 'À l\'USC', 'Aux lits gelés'], 0, '334 et 335 : brûlés ambulatoires (hors réanimation).'],
  ['plan', 'vf', 'Les chambres de Flamboyant vont de 301 à 308.', null, 'vrai', 'Flamboyant : 8 lits, chambres 301 à 308.'],
  ['plan', 'qcm', 'Combien de lits compte l\'unité Atoumo ?', ['4', '8', '9', '12'], 0, 'Atoumo : 4 lits, chambres 326 à 329.'],
  ['plan', 'qcm', 'Quelle unité de réanimation compte le plus de lits ?', ['Bougainvillier', 'Hibiscus', 'Flamboyant', 'Atoumo'], 0, 'Bougainvillier : 9 lits (309 à 317). Hibiscus et Flamboyant : 8 lits, Atoumo : 4.'],
  ['plan', 'qcm', 'Les chambres 318 à 325 font partie de…', ['Hibiscus', 'Bougainvillier', 'Atoumo', 'Mahogany'], 0, 'Hibiscus : 8 lits, chambres 318 à 325.'],
  ['plan', 'vf', 'L\'USC Mahogany compte 12 lits, chambres 341 à 352.', null, 'vrai', 'Mahogany : 12 lits d\'USC, de 341 à 352.'],
  ['urgences', 'vf', 'Le chariot d\'urgence se vérifie avec une check-list datée et signée, y compris après chaque utilisation.', null, 'vrai', 'Vérification régulière et après chaque utilisation (à adapter à la procédure du service).'],
  ['urgences', 'qcm', 'Devant un arrêt cardiaque dans une chambre, la première chose à faire est de…', ['Appeler à l\'aide et commencer le massage cardiaque', 'Aller chercher seul le chariot d\'urgence', 'Prévenir la famille', 'Chercher le dossier du patient'], 0, 'Alerter et masser sans attendre : un collègue apporte le chariot et le DAE.'],
  ['urgences', 'qcm', 'Début d\'incendie dans une chambre : quel est le bon enchaînement ?', ['Donner l\'alerte, mettre à l\'abri les personnes menacées, fermer les portes, attaquer le feu si c\'est sans risque', 'Ouvrir les fenêtres pour évacuer la fumée', 'Attendre les pompiers sans rien faire', 'Descendre les patients par l\'ascenseur'], 0, 'Alerter, protéger, fermer les portes pour confiner la fumée ; jamais l\'ascenseur (à adapter aux consignes incendie du CHU).'],
  ['urgences', 'vf', 'En cas d\'incendie, on prend les ascenseurs pour évacuer plus vite les patients.', null, 'faux', 'Les ascenseurs ne s\'utilisent pas en cas d\'incendie, sauf consigne contraire des secours.'],
  ['urgences', 'vf', 'Il faut connaître l\'emplacement des vannes de coupure des fluides médicaux (oxygène, air, vide) de son secteur.', null, 'vrai', 'En cas de fuite ou d\'incendie, savoir où elles sont fait gagner un temps précieux.'],
  ['urgences', 'vf', 'Un DAE peut être utilisé par n\'importe qui : l\'appareil guide chaque étape à voix haute.', null, 'vrai', 'Le défibrillateur automatisé externe analyse le rythme et guide l\'utilisateur.'],
  ['urgences', 'qcm', 'Après avoir utilisé le chariot d\'urgence, il faut…', ['Le réapprovisionner, refaire la check-list et le remettre à sa place', 'Le laisser dans la chambre jusqu\'au lendemain', 'Le ranger sans contrôle s\'il semble complet', 'Prévenir seulement la pharmacie'], 0, 'Un chariot incomplet ou absent de sa place est un risque pour le patient suivant.'],
  ['urgences', 'vf', 'Pendant le déménagement, on peut encombrer un moment une issue de secours avec des cartons.', null, 'faux', 'Les issues et dégagements de secours restent libres en permanence.'],
  ['urgences', 'qcm', 'En arrivant dans les nouveaux locaux, que faut-il repérer en premier dans son secteur ?', ['Chariot d\'urgence, DAE, vannes de fluides et issues de secours', 'La salle de détente', 'Le parking', 'Le secrétariat'], 0, 'Ce sont les repères de sécurité indispensables dès le premier jour.'],
  ['urgences', 'qcm', 'La bouteille d\'oxygène de transport se vérifie…', ['Avant chaque transfert (pression, autonomie)', 'Une fois par mois', 'Seulement si une alarme sonne', 'Uniquement par le brancardier'], 0, 'L\'autonomie doit couvrir tout le trajet, avec une marge.'],
  ['urgences', 'vf', 'Lors d\'une alarme incendie, on ferme les portes des chambres et des locaux.', null, 'vrai', 'Fermer les portes limite la propagation de la fumée.']
];
// Questions générales valables pour tous les services (ajoutées aux questions « urgences » à la création d'un service)
var QUIZ_GENERIQUE = [
  ['urgences', 'vf', 'Dans les nouveaux locaux, les numéros d\'appel d\'urgence internes peuvent changer : on les vérifie dès le premier jour.', null, 'vrai', 'Numéros d\'urgence, alerte incendie, sécurité : à vérifier sur les affichages du nouveau service (à adapter aux consignes du CHU).'],
  ['urgences', 'qcm', 'Le jour du déménagement, une issue de secours est encombrée par des cartons. Que faites-vous ?', ['Je la dégage tout de suite et je préviens l\'encadrement', 'J\'attends la fin du déménagement', 'Je mets un panneau « attention »', 'Rien, ce n\'est pas mon secteur'], 0, 'Les issues de secours restent libres en permanence, même pendant un déménagement.'],
  ['urgences', 'qcm', 'Où trouver le plan d\'évacuation de votre secteur ?', ['Affiché près des sorties et des circulations', 'Uniquement chez la direction', 'Il n\'y en a pas dans un bâtiment neuf', 'Sur demande au standard'], 0, 'Les plans d\'évacuation sont affichés dans les circulations : repérez-les dès votre arrivée.'],
  ['urgences', 'vf', 'Avant le déménagement, il est utile de repérer son trajet domicile – nouveau site et les accès réservés au personnel.', null, 'vrai', 'Repérer les accès, les parkings et le trajet évite le stress du premier jour.']
];

function quizDatesModif_(ss) { // id pièce ou équipement → date de dernière modification ; équipements existants
  var m = {}, existe = {};
  var p = ss.getSheetByName(ONGLETS.pieces).getDataRange().getValues();
  for (var i = 1; i < p.length; i++) if (p[i][0] && p[i][6] instanceof Date) m[String(p[i][0])] = p[i][6].getTime();
  var shp = ss.getSheetByName(ONGLETS.points);
  if (shp) { var q = shp.getDataRange().getValues(); for (var j = 1; j < q.length; j++) if (q[j][0]) { existe[String(q[j][0])] = 1; if (q[j][5] instanceof Date) m[String(q[j][0])] = q[j][5].getTime(); } }
  return { m: m, existe: existe };
}
function lireQuiz_(ss) {
  var sh = ss.getSheetByName(ONGLETS.quiz);
  if (!sh) return [];
  var v = sh.getDataRange().getValues(), l = [], dm = quizDatesModif_(ss);
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0] || '').trim(); if (!id) continue;
    var choix = null; try { choix = v[i][4] ? JSON.parse(v[i][4]) : null; } catch (e) { choix = null; }
    var lies = String(v[i][7] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var modif = v[i][11] instanceof Date ? v[i][11].getTime() : 0;
    var aReverifier = lies.some(function (x) { return (dm.m[x] && dm.m[x] > modif) || (/^Q/.test(x) && !dm.existe[x]); });
    var bonne = v[i][5] === '' || v[i][5] == null ? '' : String(v[i][5]);
    l.push({ ligne: i + 1, id: id, theme: String(v[i][1] || ''), type: String(v[i][2] || ''), texte: String(v[i][3] || ''), choix: choix, bonne: bonne,
      explication: String(v[i][6] || ''), lies: lies, statut: String(v[i][8] || '').trim().toLowerCase(), auteur: String(v[i][9] || ''),
      modifiee: v[i][11] instanceof Date ? formaterDate_(v[i][11]) : '', aReverifier: aReverifier });
  }
  return l;
}
function quizCompteur_() { return Number(props_().getProperty('quiz_total') || 0); }
function quizListe_(session) {
  var ss = classeur_(), ref = session.r === 'referent' || session.r === 'admin', admin = session.r === 'admin';
  var l = lireQuiz_(ss).filter(function (q) {
    if (q.statut === 'brouillon') return admin;
    if (ref) return true;
    return q.statut === 'publiée' && !q.aReverifier;
  }).map(function (q) {
    var o = { id: q.id, theme: q.theme, type: q.type, texte: q.texte, choix: q.choix, bonne: q.bonne, explication: q.explication, lies: q.lies };
    if (ref) { o.statut = q.statut; o.auteur = q.auteur; o.modifiee = q.modifiee; o.aReverifier = q.aReverifier; }
    return o;
  });
  var objectif = Number(lireParametres_(ss)['Objectif quiz équipe']) || QUIZ.objectifDefaut;
  return { ok: true, questions: l, total: quizCompteur_(), objectif: objectif, peutGerer: ref, admin: admin };
}
function validerQuestion_(d) {
  d = d || {};
  var theme = String(d.theme || ''), type = String(d.type || ''), texte = nettoyerTexte_(d.texte, 300), expl = nettoyerTexte_(d.explication, 400);
  if (QUIZ.themes.indexOf(theme) < 0 || QUIZ.types.indexOf(type) < 0 || texte.length < 5) throw erreurApp_('requete_invalide');
  var choix = '', bonne = '', lies = (Array.isArray(d.lies) ? d.lies : []).map(String).filter(function (x) { return /^(P\d{3}|N[a-z0-9]{6,12}|Q[a-z0-9]{6,12})$/.test(x); });
  if (type === 'qcm') {
    var c = (Array.isArray(d.choix) ? d.choix : []).map(function (x) { return nettoyerTexte_(x, 120); }).filter(Boolean);
    var b = Number(d.bonne);
    if (c.length < 2 || c.length > 4 || !(b >= 0 && b < c.length && Math.floor(b) === b)) throw erreurApp_('requete_invalide');
    choix = JSON.stringify(c); bonne = String(b);
  } else if (type === 'vf') {
    if (d.bonne !== 'vrai' && d.bonne !== 'faux') throw erreurApp_('requete_invalide');
    bonne = d.bonne;
  } else {
    var cibles = (Array.isArray(d.bonne) ? d.bonne : String(d.bonne || '').split(',')).map(String).map(function (x) { return x.trim(); })
      .filter(function (x) { return /^(P\d{3}|N[a-z0-9]{6,12}|Q[a-z0-9]{6,12})$/.test(x); });
    if (!cibles.length || cibles.length > 20) throw erreurApp_('requete_invalide');
    bonne = cibles.join(',');
    cibles.forEach(function (x) { if (lies.indexOf(x) < 0) lies.push(x); });
  }
  return { theme: theme, type: type, texte: texte, choix: choix, bonne: bonne, explication: expl, lies: lies.slice(0, 30).join(',') };
}
function quizQuestion_(session, id, d) {
  var q = validerQuestion_(d), verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var ss = classeur_(), sh = ss.getSheetByName(ONGLETS.quiz);
    if (!sh) throw erreurApp_('non_installe');
    var maintenant = new Date();
    if (!id) {
      var nid = 'QZ' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toLowerCase();
      sh.appendRow([nid, q.theme, q.type, q.texte, q.choix, q.bonne, q.explication, q.lies, 'publiée', session.n || 'Administrateur', maintenant, maintenant]);
      return { ok: true, id: nid };
    }
    var l = lireQuiz_(ss), x = null;
    for (var i = 0; i < l.length; i++) if (l[i].id === String(id)) x = l[i];
    if (!x) throw erreurApp_('question_introuvable');
    if (x.statut === 'brouillon' && session.r !== 'admin') throw erreurApp_('non_autorise');
    sh.getRange(x.ligne, 2, 1, 7).setValues([[q.theme, q.type, q.texte, q.choix, q.bonne, q.explication, q.lies]]);
    sh.getRange(x.ligne, 12).setValue(maintenant);
    return { ok: true, id: x.id };
  } finally { verrou.releaseLock(); }
}
function quizStatut_(session, ids, action) {
  if (['publier', 'retirer', 'confirmer'].indexOf(action) < 0) throw erreurApp_('requete_invalide');
  ids = (Array.isArray(ids) ? ids : [ids]).map(String);
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var ss = classeur_(), sh = ss.getSheetByName(ONGLETS.quiz), l = lireQuiz_(ss), n = 0;
    l.forEach(function (x) {
      if (ids.indexOf(x.id) < 0) return;
      if (x.statut === 'brouillon' && session.r !== 'admin') throw erreurApp_('non_autorise'); // brouillons : relus par l'administrateur
      if (action === 'retirer') sh.getRange(x.ligne, 9).setValue('retirée');
      if (action === 'publier') sh.getRange(x.ligne, 9).setValue('publiée');
      if (action === 'publier' || action === 'confirmer') sh.getRange(x.ligne, 12).setValue(new Date()); // efface l'alerte « à revérifier »
      n++;
    });
    if (!n) throw erreurApp_('question_introuvable');
    return { ok: true, n: n };
  } finally { verrou.releaseLock(); }
}
function quizAjouterTotal_(n) {
  n = Math.floor(Number(n));
  if (!(n >= 1 && n <= 50)) throw erreurApp_('requete_invalide');
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var props = props_(), t = Number(props.lireFrais('quiz_total') || 0) + n;
    props.setProperty('quiz_total', String(t));
    return { ok: true, total: t };
  } finally { verrou.releaseLock(); }
}
function installerBanqueQuiz_(ss, generique) { // seulement si l'onglet est vide ; un nouveau service n'a pas les questions du plan de la réa
  var sh = ss.getSheetByName(ONGLETS.quiz);
  if (!sh || sh.getLastRow() > 1) return 0;
  var banque = generique ? QUIZ_BANQUE.filter(function (b) { return b[0] !== 'plan'; }).concat(QUIZ_GENERIQUE) : QUIZ_BANQUE;
  var maintenant = new Date(), lignes = banque.map(function (b, i) {
    return ['QZclaude' + ('0' + (i + 1)).slice(-2), b[0], b[1], b[2], b[3] ? JSON.stringify(b[3]) : '', String(b[4]), b[5], '', 'brouillon', 'Claude (à relire)', maintenant, maintenant];
  });
  sh.getRange(2, 1, lignes.length, QUIZ.entetes.length).setValues(lignes);
  return lignes.length;
}

// ============================================================================
// Jeux (1.7) : réglages par l'administrateur, jauge du déménagement, souvenirs, concours photo,
// nuage de mots, QR codes cachés, paris, escape game, bingo.
// Aucun suivi individuel : seuls des totaux, des textes signés librement (ou pas) et des pseudos sont enregistrés.
// ============================================================================
var JEUX = {
  liste: ['jauge', 'souvenirs', 'concours', 'nuage', 'qr', 'escape', 'bingo', 'paris'],
  noms: { jauge: 'Jauge du déménagement', souvenirs: 'Souvenirs', concours: 'Concours photo', nuage: 'Le nuage', qr: 'QR codes cachés', escape: 'Escape game', bingo: 'Bingo du déménagement', paris: 'Paris' },
  points: { newsletter: 1, qr: 2, bingo_ligne: 3, bingo_plein: 10, escape: 5, visite: 3, souvenir: 5, concours: 3, nuage: 1, pari: 1, ultime: 5 },
  maxPhoto: 2 * 1024 * 1024, maxMini: 300 * 1024
};
var JEUX_DEFAUTS = {
  jauge: { objectif: 4000, paliers: [
    { pc: 10, titre: 'Échauffement', texte: 'L\'équipe est lancée : merci à toutes et à tous !' },
    { pc: 25, titre: 'Les cartons sont prêts', texte: 'Un quart du chemin : le nouveau service commence à devenir familier.' },
    { pc: 50, titre: 'Mi-parcours', texte: 'La moitié ! Le plan n\'a presque plus de secrets pour l\'équipe.' },
    { pc: 75, titre: 'Dernière ligne droite', texte: 'Encore un effort : les urgences et les circuits sont presque maîtrisés.' },
    { pc: 100, titre: 'Prêts pour le grand départ', texte: 'Objectif atteint ! Récompense collective à définir avec l\'encadrement.' }] },
  nuage: { questions: ['Ce que j\'emporte', 'Ce que je laisse', 'Ce qui me fait envie', 'Ce qui m\'inquiète'] },
  bingo: { cases: [
    { texte: 'J\'ai visité les nouveaux locaux', auto: 'visite' }, { texte: 'J\'ai fait le quiz du jour', auto: 'quizjour' },
    { texte: 'J\'ai trouvé un QR code caché', auto: 'qr' }, { texte: 'J\'ai exploré 8 pièces du plan', auto: 'plan' },
    { texte: 'J\'ai lu la newsletter', auto: 'newsletter' }, { texte: 'J\'ai partagé un souvenir', auto: 'souvenir' },
    { texte: 'J\'ai mis un mot dans le nuage', auto: 'nuage' }, { texte: 'J\'ai fait un pari', auto: 'pari' },
    { texte: 'J\'ai terminé un escape game', auto: 'escape' }, { texte: 'Je sais où est le chariot d\'urgence de mon secteur' },
    { texte: 'J\'ai repéré les vannes de fluides' }, { texte: 'J\'ai trouvé mon vestiaire' }, { texte: 'J\'ai aidé un collègue à se repérer' },
    { texte: 'Je connais mon trajet domicile – nouveau CHU' }, { texte: 'J\'ai rangé mon casier actuel' }, { texte: 'J\'ai participé à une simulation' },
    { texte: 'Je connais les repères de mon nouveau service' }, { texte: 'J\'ai pris une photo souvenir de l\'ancien service' }, { texte: 'J\'ai repéré la salle de détente' },
    { texte: 'J\'ai parlé du déménagement avec un collègue d\'une autre équipe' }] },
  escape: { valides: {} }
};
var PARIS_DEFAUTS = [
  ['cartons', 'Combien de cartons au total pour le déménagement ?', 'nombre', 'cartons'],
  ['premier', 'Jour et heure d\'arrivée du premier patient dans le nouveau service ?', 'dateheure', ''],
  ['dernier', 'Jour et heure d\'arrivée du dernier patient ?', 'dateheure', ''],
  ['duree', 'Durée totale du transfert des patients (en heures) ?', 'nombre', 'heures'],
  ['ambulances', 'Nombre de trajets d\'ambulance ?', 'nombre', 'trajets']
];
var MOTS_INTERDITS = ['con', 'conne', 'connard', 'connasse', 'merde', 'putain', 'pute', 'salope', 'salaud', 'enculé', 'encule', 'nique', 'niquer', 'bite', 'couille', 'couilles', 'chier', 'bordel', 'pd', 'batard', 'bâtard', 'abruti', 'débile', 'debile', 'crétin', 'cretin', 'imbécile', 'imbecile', 'kouni', 'manman', 'makoumè', 'makoume', 'bouzin'];

function jeuxConfig_(ss) { // { id: { actif (dates comprises), actifBrut, ouverture, fermeture, reglages } }
  var sh = ss.getSheetByName(ONGLETS.jeux), r = {}, maintenant = new Date();
  JEUX.liste.forEach(function (id) { r[id] = { id: id, nom: JEUX.noms[id], actifBrut: false, ouverture: '', fermeture: '', reglages: JSON.parse(JSON.stringify(JEUX_DEFAUTS[id] || {})) }; });
  if (sh) {
    var v = sh.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      var id = String(v[i][0] || '').trim(); if (!r[id]) continue;
      r[id].ligne = i + 1;
      r[id].actifBrut = v[i][2] === true || String(v[i][2]).toLowerCase() === 'oui' || String(v[i][2]).toUpperCase() === 'TRUE';
      r[id].ouvertureD = v[i][3] instanceof Date ? v[i][3] : null; r[id].fermetureD = v[i][4] instanceof Date ? v[i][4] : null;
      r[id].ouverture = r[id].ouvertureD ? formaterDate_(r[id].ouvertureD) : ''; r[id].fermeture = r[id].fermetureD ? formaterDate_(r[id].fermetureD) : '';
      if (v[i][5]) { try { var g = JSON.parse(v[i][5]); for (var k in g) r[id].reglages[k] = g[k]; } catch (e) { /* réglages illisibles : valeurs par défaut */ } }
    }
  }
  JEUX.liste.forEach(function (id) {
    var c = r[id], fin = c.fermetureD ? new Date(c.fermetureD.getTime() + 864e5) : null; // fermeture : jusqu'au soir inclus
    c.actif = c.actifBrut && (!c.ouvertureD || maintenant >= c.ouvertureD) && (!fin || maintenant < fin);
    c.termine = !!(fin && maintenant >= fin);
  });
  return r;
}
function exigerJeu_(ss, id) { var c = jeuxConfig_(ss)[id]; if (!c || !c.actif) throw erreurApp_('jeu_inactif'); return c; }
function jeuxEtat_(session) {
  var ss = classeur_(), cfg = jeuxConfig_(ss), admin = session.r === 'admin', ref = admin || session.r === 'referent', r = {};
  JEUX.liste.forEach(function (id) {
    var c = cfg[id];
    if (!c.actif && !admin && !(id === 'escape' && ref && c.actifBrut)) { r[id] = { actif: false, termine: c.termine }; return; }
    r[id] = { actif: c.actif, actifBrut: c.actifBrut, termine: c.termine, ouverture: c.ouverture, fermeture: c.fermeture, reglages: c.reglages };
  });
  return { ok: true, jeux: r, admin: admin, referent: ref, elan: calculerElan_(ss, cfg) };
}
function jeuxReglage_(id, d) {
  if (JEUX.liste.indexOf(id) < 0) throw erreurApp_('requete_invalide');
  d = d || {};
  var ss = classeur_(), sh = ss.getSheetByName(ONGLETS.jeux), c = jeuxConfig_(ss)[id];
  if (!sh || !c.ligne) throw erreurApp_('non_installe');
  function date(x) { if (!x) return ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) throw erreurApp_('requete_invalide'); return new Date(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)); }
  if ('actif' in d) sh.getRange(c.ligne, 3).setValue(!!d.actif);
  if ('ouverture' in d) sh.getRange(c.ligne, 4).setValue(date(d.ouverture));
  if ('fermeture' in d) sh.getRange(c.ligne, 5).setValue(date(d.fermeture));
  if ('reglages' in d) {
    var g = d.reglages || {}, propre = {};
    if (id === 'jauge') {
      var obj = Math.floor(Number(g.objectif)); if (!(obj >= 10 && obj <= 1000000)) throw erreurApp_('requete_invalide');
      propre.objectif = obj;
      if (Array.isArray(g.paliers)) propre.paliers = g.paliers.slice(0, 10).map(function (p) {
        var pc = Math.round(Number(p.pc)); if (!(pc >= 1 && pc <= 100)) throw erreurApp_('requete_invalide');
        return { pc: pc, titre: nettoyerTexte_(p.titre, 60), texte: nettoyerTexte_(p.texte, 200) };
      }).sort(function (a, b) { return a.pc - b.pc; });
    } else if (id === 'nuage') {
      var q = (Array.isArray(g.questions) ? g.questions : []).map(function (x) { return nettoyerTexte_(x, 60); }).filter(Boolean);
      if (!q.length || q.length > 8) throw erreurApp_('requete_invalide');
      propre.questions = q;
    } else if (id === 'bingo') {
      var autos = ['visite', 'quizjour', 'qr', 'plan', 'newsletter', 'souvenir', 'nuage', 'pari', 'escape'];
      var cs = (Array.isArray(g.cases) ? g.cases : []).map(function (x) {
        var t = nettoyerTexte_(x && x.texte, 90); if (!t) return null;
        var o = { texte: t }; if (x.auto && autos.indexOf(x.auto) >= 0) o.auto = x.auto; return o;
      }).filter(Boolean);
      if (cs.length < 16 || cs.length > 60) throw erreurApp_('bingo_cases');
      propre.cases = cs;
    } else if (id === 'escape') {
      propre.valides = c.reglages.valides || {};
    } else throw erreurApp_('requete_invalide');
    sh.getRange(c.ligne, 6).setValue(JSON.stringify(propre));
  }
  return { ok: true };
}

/* ----- Jauge du déménagement (« élan ») ----- */
function calculerElan_(ss, cfg) {
  cfg = cfg || jeuxConfig_(ss);
  var c = cfg.jauge; if (!c.actif) return null;
  var pts = quizCompteur_() + Number(props_().getProperty('jeux_points') || 0);
  var obj = Number(c.reglages.objectif) || 4000;
  return { points: pts, objectif: obj, pourcent: Math.min(100, Math.floor(100 * pts / obj)), paliers: c.reglages.paliers || [] };
}
function ajouterPointsJeux_(n, dejaVerrouille) { // dejaVerrouille : appelé alors que le verrou du script est déjà pris
  if (!(n > 0)) return;
  function ajouter() { var p = props_(); p.setProperty('jeux_points', String(Number(p.lireFrais('jeux_points') || 0) + n)); }
  if (dejaVerrouille) return ajouter();
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try { ajouter(); } finally { verrou.releaseLock(); }
}
function jeuxPoints_(type, n) { // événements venus de l'appli (sans identité)
  var unit = JEUX.points[type]; n = Math.floor(Number(n) || 1);
  if (!unit || ['newsletter', 'qr', 'bingo_ligne', 'bingo_plein', 'escape', 'ultime'].indexOf(type) < 0 || !(n >= 1 && n <= 10)) throw erreurApp_('requete_invalide');
  ajouterPointsJeux_(unit * n);
  return { ok: true };
}

/* ----- Souvenirs et concours photo ----- */
function dossierJeux_(ss) {
  var nom = 'Dossier des photos (ID Drive)', id = String(lireParametres_(ss)[nom] || '').trim();
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recréé */ } }
  var parents = DriveApp.getFileById(ss.getId()).getParents(), parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var d = parent.createFolder('Réa – Souvenirs et concours');
  ajouterParametre_(ss, nom, 'Créé automatiquement : photos des souvenirs et du concours. Dossier privé : ne pas le partager.');
  var sh = ss.getSheetByName(ONGLETS.parametres), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === nom) sh.getRange(i + 1, 2).setValue(d.getId());
  return d;
}
function jpegValide_(b64, max) {
  var o; try { o = Utilities.base64Decode(String(b64 || '')); } catch (e) { throw erreurApp_('requete_invalide'); }
  if (o.length < 500 || o.length > max || (o[0] & 255) !== 0xFF || (o[1] & 255) !== 0xD8 || (o[2] & 255) !== 0xFF) throw erreurApp_('requete_invalide');
  return o;
}
function lireSouvenirs_(ss) {
  var sh = ss.getSheetByName(ONGLETS.souvenirs); if (!sh) return [];
  var v = sh.getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) {
    if (!v[i][0]) continue;
    l.push({ ligne: i + 1, id: String(v[i][0]), type: String(v[i][1]), titre: String(v[i][2] || ''), texte: String(v[i][3] || ''), annee: String(v[i][4] || ''),
      lieu: String(v[i][5] || ''), signature: String(v[i][6] || ''), photo: String(v[i][7] || ''), mini: String(v[i][8] || ''), statut: String(v[i][9] || ''),
      coeurs: Number(v[i][10]) || 0, depose: v[i][11] instanceof Date ? formaterDate_(v[i][11]) : '', ratio: Number(v[i][12]) || 1 });
  }
  return l;
}
function souvenirsListe_(session, type) {
  type = type === 'concours' ? 'concours' : 'souvenir';
  var ss = classeur_(), cfg = jeuxConfig_(ss), c = cfg[type === 'concours' ? 'concours' : 'souvenirs'], ref = session.r !== 'agent';
  if (!c.actif && !(c.termine && type === 'concours') && session.r !== 'admin') throw erreurApp_('jeu_inactif');
  var montrerCoeurs = type !== 'concours' || c.termine;
  var l = lireSouvenirs_(ss).filter(function (s) { return s.type === type && (s.statut === 'publié' || (ref && s.statut === 'attente')); })
    .map(function (s) { return { id: s.id, titre: s.titre, texte: s.texte, annee: s.annee, lieu: s.lieu, signature: s.signature, photo: !!s.photo, ratio: s.ratio,
      statut: ref ? s.statut : undefined, coeurs: montrerCoeurs ? s.coeurs : null, depose: s.depose }; }).reverse();
  var podium = null;
  if (type === 'concours' && c.termine) podium = l.filter(function (s) { return s.statut !== 'attente'; }).slice().sort(function (a, b) { return b.coeurs - a.coeurs; }).slice(0, 3).map(function (s) { return s.id; });
  return { ok: true, souvenirs: l, peutModerer: ref, coeursVisibles: montrerCoeurs, podium: podium, ouvert: c.actif, fermeture: c.fermeture };
}
function souvenirAjouter_(session, d) {
  d = d || {};
  var type = d.type === 'concours' ? 'concours' : 'souvenir', ss = classeur_();
  exigerJeu_(ss, type === 'concours' ? 'concours' : 'souvenirs');
  var titre = nettoyerTexte_(d.titre, 80), texte = nettoyerTexte_(d.texte, 1200), annee = nettoyerTexte_(d.annee, 20), lieu = nettoyerTexte_(d.lieu, 60), sign = nettoyerTexte_(d.signature, 60);
  if (type === 'concours' && !d.photo) throw erreurApp_('requete_invalide');
  if (!d.photo && texte.length < 3) throw erreurApp_('requete_invalide');
  if (d.photo && d.consentement !== true) throw erreurApp_('consentement');
  var photo = '', mini = '';
  if (d.photo) {
    var o1 = jpegValide_(d.photo, JEUX.maxPhoto), o2 = jpegValide_(d.mini, JEUX.maxMini), dossier = dossierJeux_(ss);
    var base = (type === 'concours' ? 'concours-' : 'souvenir-') + Utilities.getUuid().slice(0, 8);
    photo = dossier.createFile(Utilities.newBlob(o1, 'image/jpeg', base + '.jpg')).getId();
    mini = dossier.createFile(Utilities.newBlob(o2, 'image/jpeg', base + '-mini.jpg')).getId();
  }
  var ratio = Number(d.ratio); if (!(ratio > 0.2 && ratio < 5)) ratio = 1;
  var id = 'S' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toLowerCase();
  ss.getSheetByName(ONGLETS.souvenirs).appendRow([id, type, titre, texte, annee, lieu, sign, photo, mini, 'attente', 0, new Date(), Math.round(ratio * 1000) / 1000, '']);
  return { ok: true, id: id };
}
function souvenirPhoto_(session, id, taille) {
  var s = lireSouvenirs_(classeur_()).filter(function (x) { return x.id === String(id); })[0];
  if (!s || !s.photo || (s.statut !== 'publié' && session.r === 'agent')) throw erreurApp_('introuvable');
  var fid = taille === 'mini' && s.mini ? s.mini : s.photo;
  return { ok: true, type: 'image/jpeg', data: Utilities.base64Encode(DriveApp.getFileById(fid).getBlob().getBytes()) };
}
function souvenirModerer_(session, id, action) {
  if (['publier', 'refuser', 'retirer'].indexOf(action) < 0) throw erreurApp_('requete_invalide');
  var ss = classeur_(), s = lireSouvenirs_(ss).filter(function (x) { return x.id === String(id); })[0];
  if (!s) throw erreurApp_('introuvable');
  var sh = ss.getSheetByName(ONGLETS.souvenirs);
  if (action === 'publier') {
    if (s.statut !== 'publié') ajouterPointsJeux_(s.type === 'concours' ? JEUX.points.concours : JEUX.points.souvenir);
    sh.getRange(s.ligne, 10).setValue('publié'); sh.getRange(s.ligne, 14).setValue(session.n || 'Référent');
  } else {
    sh.getRange(s.ligne, 10).setValue(action === 'refuser' ? 'refusé' : 'retiré');
    [s.photo, s.mini].forEach(function (f) { if (f) { try { DriveApp.getFileById(f).setTrashed(true); } catch (e) { /* déjà absent */ } } });
  }
  return { ok: true };
}
function souvenirCoeur_(id, plus) {
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var ss = classeur_(), s = lireSouvenirs_(ss).filter(function (x) { return x.id === String(id); })[0];
    if (!s || s.statut !== 'publié') throw erreurApp_('introuvable');
    if (s.type === 'concours') { var c = jeuxConfig_(ss).concours; if (!c.actif) throw erreurApp_('jeu_inactif'); }
    var n = Math.max(0, s.coeurs + (plus === false ? -1 : 1));
    ss.getSheetByName(ONGLETS.souvenirs).getRange(s.ligne, 11).setValue(n);
    return { ok: true, coeurs: s.type === 'concours' ? null : n };
  } finally { verrou.releaseLock(); }
}

/* ----- Nuage de mots ----- */
function motInterdit_(t) {
  var mots = sansAccents_(t).split(/[^a-z0-9]+/);
  return MOTS_INTERDITS.some(function (m) { return mots.indexOf(sansAccents_(m)) >= 0; });
}
function sansAccents_(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function nuageListe_(session) {
  var ss = classeur_(), c = jeuxConfig_(ss).nuage;
  if (!c.actif && session.r !== 'admin') throw erreurApp_('jeu_inactif');
  var sh = ss.getSheetByName(ONGLETS.nuage), v = sh ? sh.getDataRange().getValues() : [], comptes = {}, ref = session.r !== 'agent';
  for (var i = 1; i < v.length; i++) {
    if (!v[i][0] || String(v[i][3]) !== 'affiché') continue;
    var q = Number(v[i][1]), mot = String(v[i][2]), cle = q + '|' + sansAccents_(mot);
    if (!comptes[cle]) comptes[cle] = { q: q, mot: mot, n: 0, ids: [] };
    comptes[cle].n++; if (ref) comptes[cle].ids.push(String(v[i][0]));
  }
  return { ok: true, questions: c.reglages.questions, mots: Object.keys(comptes).map(function (k) { var x = comptes[k]; return { q: x.q, mot: x.mot, n: x.n, ids: ref ? x.ids : undefined }; }), peutModerer: ref };
}
function nuageAjouter_(q, mot) {
  var ss = classeur_(), c = exigerJeu_(ss, 'nuage');
  q = Number(q); mot = nettoyerTexte_(mot, 40).replace(/\s+/g, ' ');
  if (!(q >= 0 && q < c.reglages.questions.length) || mot.length < 2 || mot.split(' ').length > 3) throw erreurApp_('requete_invalide');
  if (motInterdit_(mot)) throw erreurApp_('mot_refuse');
  ss.getSheetByName(ONGLETS.nuage).appendRow(['M' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), q, mot, 'affiché', new Date()]);
  ajouterPointsJeux_(JEUX.points.nuage);
  return { ok: true };
}
function nuageRetirer_(ids) {
  ids = (Array.isArray(ids) ? ids : []).map(String);
  var sh = classeur_().getSheetByName(ONGLETS.nuage), v = sh.getDataRange().getValues(), n = 0;
  for (var i = 1; i < v.length; i++) if (ids.indexOf(String(v[i][0])) >= 0) { sh.getRange(i + 1, 4).setValue('retiré'); n++; }
  return { ok: true, n: n };
}

/* ----- QR codes cachés ----- */
function lireQr_(ss) {
  var sh = ss.getSheetByName(ONGLETS.qr); if (!sh) return [];
  var v = sh.getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) if (v[i][0]) l.push({ ligne: i + 1, code: String(v[i][0]), nom: String(v[i][1] || ''), cible: String(v[i][2] || ''), message: String(v[i][3] || ''), actif: v[i][4] !== false && String(v[i][4]).toLowerCase() !== 'non' });
  return l;
}
function qrListe_(session) {
  var ss = classeur_(), c = jeuxConfig_(ss).qr, admin = session.r === 'admin';
  if (!c.actif && !admin) throw erreurApp_('jeu_inactif');
  var l = lireQr_(ss).filter(function (q) { return q.actif || admin; });
  return { ok: true, total: l.filter(function (q) { return q.actif; }).length,
    qr: admin ? l.map(function (q) { return { code: q.code, nom: q.nom, cible: q.cible, message: q.message, actif: q.actif }; }) : undefined };
}
function qrTrouver_(code) {
  var ss = classeur_(); exigerJeu_(ss, 'qr');
  var q = lireQr_(ss).filter(function (x) { return x.code === String(code || '').toUpperCase() && x.actif; })[0];
  if (!q) throw erreurApp_('qr_inconnu');
  ajouterPointsJeux_(JEUX.points.qr);
  return { ok: true, code: q.code, nom: q.nom, cible: q.cible, message: q.message };
}
function qrEnregistrer_(code, d) {
  d = d || {};
  var ss = classeur_(), sh = ss.getSheetByName(ONGLETS.qr), l = lireQr_(ss), nom = nettoyerTexte_(d.nom, 60), msg = nettoyerTexte_(d.message, 300);
  var cible = String(d.cible || ''); if (cible && !/^(P\d{3}|N[a-z0-9]{6,12}|Q[a-z0-9]{6,12})$/.test(cible)) throw erreurApp_('requete_invalide');
  if (d.supprimer) { var x = l.filter(function (q) { return q.code === code; })[0]; if (x) sh.deleteRow(x.ligne); return { ok: true }; }
  if (!nom) throw erreurApp_('requete_invalide');
  if (code) {
    var y = l.filter(function (q) { return q.code === code; })[0]; if (!y) throw erreurApp_('introuvable');
    sh.getRange(y.ligne, 2, 1, 4).setValues([[nom, cible, msg, d.actif !== false]]);
    return { ok: true, code: code };
  }
  var alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', nouveau = '';
  for (var k = 0; k < 8; k++) nouveau += alpha.charAt(Math.floor(Math.random() * alpha.length));
  sh.appendRow([nouveau, nom, cible, msg, true]);
  return { ok: true, code: nouveau };
}

/* ----- Paris ----- */
function fermeturePari_(ss, cfg) {
  var c = cfg.paris;
  if (c.fermetureD) return new Date(c.fermetureD.getTime() + 864e5);
  var j = lireParametres_(ss)['Date J'];
  return (j instanceof Date && !isNaN(j)) ? j : null; // par défaut : fermés à minuit la veille du jour J
}
function lireParis_(ss) {
  var sh = ss.getSheetByName(ONGLETS.paris), l = [];
  if (!sh) return l;
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (v[i][0]) l.push({ ligne: i + 1, id: String(v[i][0]), question: String(v[i][1]), type: String(v[i][2]), unite: String(v[i][3] || ''),
    resultat: v[i][4] === '' || v[i][4] == null ? null : String(v[i][4]).replace(/^'/, ''), actif: v[i][5] !== false });
  return l;
}
function valeurPari_(type, x) {
  if (type === 'nombre') { var n = Number(String(x).replace(',', '.')); if (!isFinite(n) || n < 0 || n > 1e7) throw erreurApp_('requete_invalide'); return n; }
  var s = String(x || ''); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw erreurApp_('requete_invalide'); return s;
}
function ecartPari_(type, a, b) {
  if (type === 'nombre') return Math.abs(Number(a) - Number(b));
  function m(s) { s = String(s); return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16)) / 6e4; }
  return Math.abs(m(a) - m(b));
}
function parisListe_(session, appareil) {
  var ss = classeur_(), cfg = jeuxConfig_(ss), c = cfg.paris;
  if (!c.actif && !c.termine && session.r !== 'admin') throw erreurApp_('jeu_inactif');
  var fin = fermeturePari_(ss, cfg), ouvert = c.actif && (!fin || new Date() < fin), hash = appareil ? empreinteAppareil_(appareil) : '';
  var sh = ss.getSheetByName(ONGLETS.pronostics), v = sh ? sh.getDataRange().getValues() : [], parPari = {};
  for (var i = 1; i < v.length; i++) if (v[i][0]) (parPari[String(v[i][0])] = parPari[String(v[i][0])] || []).push({ pseudo: String(v[i][1]), valeur: String(v[i][2]).replace(/^'/, ''), app: String(v[i][3]) });
  var l = lireParis_(ss).filter(function (p) { return p.actif; }).map(function (p) {
    var pr = parPari[p.id] || [], mien = pr.filter(function (x) { return hash && x.app === hash; })[0];
    var o = { id: p.id, question: p.question, type: p.type, unite: p.unite, resultat: p.resultat, participants: pr.length, monPari: mien ? { pseudo: mien.pseudo, valeur: mien.valeur } : null };
    if (p.resultat != null) o.podium = pr.map(function (x) { return { pseudo: x.pseudo, valeur: x.valeur, ecart: ecartPari_(p.type, x.valeur, p.resultat) }; })
      .sort(function (a, b) { return a.ecart - b.ecart; }).slice(0, 3);
    return o;
  });
  return { ok: true, paris: l, ouvert: ouvert, fermeture: fin ? formaterDate_(new Date(fin.getTime() - 1)) : null, admin: session.r === 'admin' };
}
function empreinteAppareil_(a) {
  a = String(a || ''); if (!/^[a-z0-9]{16,40}$/.test(a)) throw erreurApp_('requete_invalide');
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'appareil|' + a, Utilities.Charset.UTF_8)).slice(0, 22);
}
function pronostic_(id, d) {
  d = d || {};
  var ss = classeur_(), cfg = jeuxConfig_(ss); exigerJeu_(ss, 'paris');
  var fin = fermeturePari_(ss, cfg); if (fin && new Date() >= fin) throw erreurApp_('paris_fermes');
  var p = lireParis_(ss).filter(function (x) { return x.id === String(id) && x.actif; })[0]; if (!p) throw erreurApp_('introuvable');
  var pseudo = nettoyerTexte_(d.pseudo, 30), valeur = valeurPari_(p.type, d.valeur), hash = empreinteAppareil_(d.appareil);
  if (pseudo.length < 2 || motInterdit_(pseudo)) throw erreurApp_('pseudo_invalide');
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var sh = ss.getSheetByName(ONGLETS.pronostics), v = sh.getDataRange().getValues(), ligne = -1;
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][0]) !== p.id) continue;
      if (String(v[i][3]) === hash) ligne = i + 1;
      else if (sansAccents_(v[i][1]) === sansAccents_(pseudo)) throw erreurApp_('pseudo_pris');
    }
    var stocke = p.type === 'dateheure' ? '\'' + valeur : valeur; // texte : pas de conversion automatique en date
    if (ligne > 0) sh.getRange(ligne, 2, 1, 4).setValues([[pseudo, stocke, hash, new Date()]]);
    else { sh.appendRow([p.id, pseudo, stocke, hash, new Date()]); ajouterPointsJeux_(JEUX.points.pari, true); }
    return { ok: true };
  } finally { verrou.releaseLock(); }
}
function pariAdmin_(id, d) {
  d = d || {};
  var ss = classeur_(), sh = ss.getSheetByName(ONGLETS.paris), l = lireParis_(ss);
  if (!id) {
    var q = nettoyerTexte_(d.question, 160), type = d.type === 'dateheure' ? 'dateheure' : 'nombre';
    if (q.length < 5) throw erreurApp_('requete_invalide');
    var nid = 'X' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    sh.appendRow([nid, q, type, nettoyerTexte_(d.unite, 20), '', true]);
    return { ok: true, id: nid };
  }
  var p = l.filter(function (x) { return x.id === String(id); })[0]; if (!p) throw erreurApp_('introuvable');
  if ('resultat' in d) sh.getRange(p.ligne, 5).setValue(d.resultat === '' || d.resultat == null ? '' : (p.type === 'dateheure' ? '\'' : '') + String(valeurPari_(p.type, d.resultat)));
  if ('actif' in d) sh.getRange(p.ligne, 6).setValue(!!d.actif);
  return { ok: true };
}

/* ----- Escape game : validation des scénarios par les référents ----- */
function escapeValider_(session, scenario, valide, remarque) {
  scenario = String(scenario || ''); if (!/^[a-z0-9-]{3,30}$/.test(scenario)) throw erreurApp_('requete_invalide');
  var ss = classeur_(), sh = ss.getSheetByName(ONGLETS.jeux), c = jeuxConfig_(ss).escape;
  var g = c.reglages; g.valides = g.valides || {};
  if (valide === true) g.valides[scenario] = { par: session.n || 'Référent', le: formaterDate_(new Date()) }; else if (valide === false) delete g.valides[scenario];
  sh.getRange(c.ligne, 6).setValue(JSON.stringify({ valides: g.valides }));
  var rq = nettoyerTexte_(remarque, 600);
  if (rq) ss.getSheetByName(ONGLETS.retours).appendRow([new Date(), 'escape:' + scenario, rq, session.n || '']);
  return { ok: true, valides: g.valides };
}

function installerJeux_(ss) {
  creerOnglet_(ss, ONGLETS.jeux, ['Jeu', 'Nom', 'Activé', 'Ouverture', 'Fermeture', 'Réglages (JSON)'], []);
  var sh = ss.getSheetByName(ONGLETS.jeux), v = sh.getDataRange().getValues(), deja = {};
  for (var i = 1; i < v.length; i++) deja[String(v[i][0])] = 1;
  JEUX.liste.forEach(function (id) { if (!deja[id]) sh.appendRow([id, JEUX.noms[id], false, '', '', '']); });
  creerOnglet_(ss, ONGLETS.souvenirs, ['ID', 'Type', 'Titre', 'Texte', 'Année', 'Lieu', 'Signature', 'Photo (Drive)', 'Miniature (Drive)', 'Statut', 'Cœurs', 'Déposé le', 'Format', 'Validé par'], []);
  creerOnglet_(ss, ONGLETS.nuage, ['ID', 'Question (n°)', 'Mot', 'Statut', 'Déposé le'], []);
  creerOnglet_(ss, ONGLETS.qr, ['Code', 'Lieu', 'Pièce ou équipement (ID)', 'Message', 'Actif'], []);
  creerOnglet_(ss, ONGLETS.paris, ['ID', 'Question', 'Type', 'Unité', 'Résultat', 'Actif'], []);
  var sp = ss.getSheetByName(ONGLETS.paris);
  if (sp.getLastRow() <= 1) PARIS_DEFAUTS.forEach(function (p) { sp.appendRow([p[0], p[1], p[2], p[3], '', true]); });
  creerOnglet_(ss, ONGLETS.pronostics, ['Pari', 'Pseudo', 'Valeur', 'Appareil (empreinte anonyme)', 'Déposé le'], []);
  creerOnglet_(ss, ONGLETS.retours, ['Date', 'Sujet', 'Remarque', 'Par'], []);
}

// ============================================================================
// Jetons signés (HMAC-SHA256)
// ============================================================================
function signerJeton_(charge) {
  var corps = b64url_(Utilities.newBlob(JSON.stringify(charge)).getBytes());
  return corps + '.' + b64url_(Utilities.computeHmacSha256Signature(corps, secret_()));
}

function verifierJeton_(jeton) {
  var charge = lireJeton_(jeton);
  if (charge.s === '_') throw erreurApp_('session_invalide'); // jeton de l'annuaire
  if ((charge.s || null) !== (CTX_SERVICE ? CTX_SERVICE.id : null)) throw erreurApp_('session_invalide'); // jeton d'un autre service
  if (charge.r === 'referent' && !referentActif_(charge.n)) throw erreurApp_('session_expiree');
  if (charge.r === 'visiteur') { // Infos générales : lecture des contenus communs seulement, tant que le code commun n'a pas changé
    if (!CTX_SERVICE || CTX_SERVICE.id !== COMMUN.id || charge.ci !== infosEmpreinte_()) throw erreurApp_('session_expiree');
    if (!INFOS_ACTIONS[ACTION_COURANTE_]) throw erreurApp_('non_autorise');
  }
  return charge;
}
function lireJeton_(jeton) {
  if (!jeton || typeof jeton !== 'string' || jeton.indexOf('.') < 0) throw erreurApp_('session_absente');
  var parts = jeton.split('.');
  var attendu = b64url_(Utilities.computeHmacSha256Signature(parts[0], secret_()));
  if (!egaliteConstante_(attendu, parts[1])) throw erreurApp_('session_invalide');
  var corps = parts[0] + '==='.slice((parts[0].length + 3) % 4);
  var charge = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(corps)).getDataAsString());
  if (charge.v !== versionJetons_()) throw erreurApp_('session_expiree');
  if (!charge.exp || Date.now() > charge.exp) throw erreurApp_('session_expiree');
  return charge;
}

function egaliteConstante_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ============================================================================
// Codes et référents
// ============================================================================
function normaliserCode_(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function empreinte_(code) {
  var sel = (CTX_SERVICE && props_().getProperty('SEL_SERVICE')) || props_().getProperty('SEL'); // service rattaché : il garde son sel, donc ses codes
  var octets = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sel + '|' + code, Utilities.Charset.UTF_8);
  return b64url_(octets);
}

function lireReferents_() {
  return JSON.parse(props_().getProperty('REFERENTS') || '[]');
}

function ecrireReferents_(liste) {
  props_().setProperty('REFERENTS', JSON.stringify(liste));
  // Liste visible dans le classeur (noms et statut uniquement, jamais les codes)
  var sh = classeur_().getSheetByName(ONGLETS.referents);
  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 3).clearContent();
  if (liste.length) {
    sh.getRange(2, 1, liste.length, 3).setValues(liste.map(function (r) {
      return [r.nom, r.actif ? 'Actif' : 'Désactivé', r.modifie || ''];
    }));
  }
}

function referentActif_(nom) {
  return lireReferents_().some(function (r) { return r.nom === nom && r.actif; });
}

function verifierFormatCode_(code) {
  if (code.length < APP.longueurMinCode) {
    throw new Error('Le code doit contenir au moins ' + APP.longueurMinCode + ' caractères (lettres et chiffres).');
  }
  if (!/^[A-Z0-9]+$/.test(code)) throw new Error('Le code ne doit contenir que des lettres et des chiffres.');
}

function codeDejaUtilise_(empr) {
  var p = props_();
  if (empr === p.getProperty('CODE_ADMIN') || empr === p.getProperty('CODE_SERVICE')) return true;
  return lireReferents_().some(function (r) { return r.empreinte === empr; });
}

function versionJetons_() {
  return Number(props_().getProperty('VERSION_JETONS') || 1);
}

// ============================================================================
// Menu d'administration dans le Google Sheets
// ============================================================================
function onOpen() {
  if (modeAnnuaire_()) {
    return SpreadsheetApp.getUi().createMenu('Cap NCHUG – Administration')
      .addItem('Vérifier / réparer l\'annuaire', 'installerAnnuaire')
      .addItem('Définir le code SUPER-ADMINISTRATEUR', 'menuCodeSuper')
      .addItem('Déconnecter le super-admin et les créateurs', 'menuInvaliderAnnuaire')
      .addItem('Effacer les inscriptions aux visites (tous les services)', 'menuPurgerVisites')
      .addToUi();
  }
  var actif = SpreadsheetApp.getActiveSpreadsheet();
  if (actif && !actif.getSheetByName(ONGLETS.parametres)) { // Google Sheets encore vide : on propose les deux installations
    return SpreadsheetApp.getUi().createMenu('Cap NCHUG – Installation')
      .addItem('Installer l\'annuaire Cap NCHUG (moteur commun)', 'installerAnnuaire')
      .addItem('Installer la base d\'un service seul (comme la réa)', 'installer')
      .addToUi();
  }
  SpreadsheetApp.getUi().createMenu('Réa – Administration')
    .addItem('1. Installer / réparer la base', 'installer')
    .addSeparator()
    .addItem('Définir le code SERVICE (agents)', 'menuCodeService')
    .addItem('Définir le code ADMINISTRATEUR', 'menuCodeAdmin')
    .addItem('Ajouter ou modifier un référent', 'menuReferent')
    .addItem('Désactiver un référent', 'menuDesactiverReferent')
    .addSeparator()
    .addItem('Déconnecter tout le monde', 'menuInvaliderSessions')
    .addItem('Générer un code aléatoire (aide)', 'menuGenererCode')
    .addSeparator()
    .addItem('Relire le plan depuis le Drive', 'viderCachePlan')
    .addItem('Effacer les inscriptions aux visites (après J+30)', 'menuPurgerVisites')
    .addSeparator()
    .addItem('Préparer le rattachement à Cap NCHUG', 'menuPreparerRattachement')
    .addItem('Annuler le rattachement à Cap NCHUG', 'menuAnnulerRattachement')
    .addToUi();
}

/** Crée les onglets, le sel et le secret. Sans danger si relancé : rien n'est effacé. */
function installer() {
  var props = props_();
  if (!props.getProperty('SEL')) props.setProperty('SEL', Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty('VERSION_JETONS')) props.setProperty('VERSION_JETONS', '1');

  var ss = classeur_();
  installerBase_(ss);
  defiOnglets_(ss); // Défi CHU : le service seul garde ses questions dans sa base (rejoindra l'annuaire plus tard)
  installerPurgeQuotidienne_();
  if (!props.getProperty('CODE_SERVICE') || !props.getProperty('CODE_ADMIN')) {
    alerte_('Installation terminée.\n\nÉtape suivante : définissez le code SERVICE puis le code ADMINISTRATEUR (menu Réa – Administration).');
  } else {
    alerte_('Base vérifiée : tout est en place.');
  }
}

/** Onglets d'un service (sans interface) : utilisé par « Installer » et par la création d'un service Cap NCHUG. */
function installerBase_(ss, nomService) {
  creerOnglet_(ss, ONGLETS.parametres, ['Paramètre', 'Valeur', 'Aide'], [
    ['Date J', '', 'Date du 1er jour de transfert (format date). Laisser vide tant qu\'elle n\'est pas fixée.'],
    ['Nom du service', nomService || 'Réanimation – USC', 'Affiché sur l\'accueil.'],
    ["Message d'accueil", 'Bienvenue ! Préparons ensemble notre installation dans le nouveau CHU.', 'Court message affiché sous le compte à rebours.'],
    ['Fichier du plan (ID Drive)', '', 'Identifiant du fichier plan-donnees.json déposé dans le Drive (voir le guide).']
  ]);
  ajouterParametre_(ss, 'Fichier du plan (ID Drive)', 'Identifiant du fichier plan-donnees.json déposé dans le Drive (voir le guide).');
  creerOnglet_(ss, ONGLETS.effectifs, ['Fonction', 'Effectif', 'Aide'],
    FONCTIONS_DEFAUT.map(function (f, i) { return [f[0], f[1], i === 0 ? 'Sert au calcul de la jauge « Service prêt ». Effectif 0 = fonction masquée.' : '']; }));
  creerOnglet_(ss, ONGLETS.actualites, ['Date', 'Titre', 'Texte', 'Publiée', 'Épinglée'], [
    [new Date(), 'Bienvenue dans l\'application', 'Retrouvez ici toutes les informations pour préparer le déménagement.', true, true]
  ]);
  creerOnglet_(ss, ONGLETS.prets, ['Horodatage', 'Fonction'], []);
  creerOnglet_(ss, ONGLETS.referents, ['Référent', 'Statut', 'Dernière modification'], []);
  creerOnglet_(ss, ONGLETS.pieces, ['ID pièce', 'Nom', 'Précision', 'Catégorie', 'Icône', 'Couleur', 'Modifié le', 'Par', 'Forme (x0,y0,x1,y1)', 'Supprimée', 'Ajoutée'], []);
  completerEntetes_(ss.getSheetByName(ONGLETS.pieces), ['ID pièce', 'Nom', 'Précision', 'Catégorie', 'Icône', 'Couleur', 'Modifié le', 'Par', 'Forme (x0,y0,x1,y1)', 'Supprimée', 'Ajoutée']);
  creerOnglet_(ss, ONGLETS.categories, ['Catégorie', 'Couleur', 'Modifié le', 'Par'], []);
  creerOnglet_(ss, ONGLETS.points, ['ID équipement', 'Type', 'X', 'Y', 'Précision', 'Modifié le', 'Par'], []);
  creerOnglet_(ss, ONGLETS.quiz, QUIZ.entetes, []);
  installerJeux_(ss);
  installerBanqueQuiz_(ss, !!nomService);
  creerOnglet_(ss, ONGLETS.escape, ESCAPE.entetes, []);
  creerOnglet_(ss, ONGLETS.documents, DOCS.entetes, []);
  ajouterParametre_(ss, 'Objectif quiz équipe', 'Nombre total de réponses visé par l\'équipe (compteur anonyme). Par défaut : 3000.');
  creerOnglet_(ss, ONGLETS.streetPoints, STREET.entetesPoints, []);
  creerOnglet_(ss, ONGLETS.streetLiens, STREET.entetesLiens, []);
  ajouterParametre_(ss, 'Visite virtuelle (activée)', 'VRAI pour afficher la tuile « Visite virtuelle » dans Plan du service (réglable aussi dans Personnaliser le service).');
  creerOnglet_(ss, ONGLETS.creneaux, ['ID', 'Date', 'Heure', 'Durée (min)', 'Lieu de rendez-vous', 'Guide', 'Places', 'Statut', 'Créé par', 'Modifié le'], []);
  creerOnglet_(ss, ONGLETS.newsletters, NL.entetes, []);
  ajouterParametre_(ss, 'Dossier des newsletters (ID Drive)', 'Créé automatiquement au premier envoi. Dossier privé : ne pas le partager.');
  creerOnglet_(ss, ONGLETS.inscriptions, ['ID', 'ID créneau', 'Prénom', 'Initiale', 'Fonction', 'Code (chiffré)', 'Inscrit le', 'Présent'], []);
  ss.getSheetByName(ONGLETS.inscriptions).getRange('H2:H1000').insertCheckboxes();
  ss.getSheetByName(ONGLETS.creneaux).getRange('B2:B1000').setNumberFormat('@'); // dates gardées en texte AAAA-MM-JJ
  ss.getSheetByName(ONGLETS.creneaux).getRange('C2:C1000').setNumberFormat('@');

  // Mise en forme utile
  var act = ss.getSheetByName(ONGLETS.actualites);
  act.getRange('D2:E200').insertCheckboxes();
  act.getRange('A2:A200').setNumberFormat('dd/mm/yyyy');
  ss.getSheetByName(ONGLETS.parametres).getRange('B2').setNumberFormat('dd/mm/yyyy');
  ss.getSheetByName(ONGLETS.prets).protect().setDescription('Rempli automatiquement par l\'application').setWarningOnly(true);
  ss.getSheetByName(ONGLETS.referents).protect().setDescription('Géré par le menu Réa – Administration').setWarningOnly(true);

  var feuilleDefaut = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (feuilleDefaut && ss.getSheets().length > 1) ss.deleteSheet(feuilleDefaut);
}

function menuCodeService() {
  var code = demanderCode_('Code SERVICE', 'Code commun à tout le service (au moins ' + APP.longueurMinCode + ' lettres/chiffres).\nLes agents déjà connectés le restent.');
  if (!code) return;
  props_().setProperty('CODE_SERVICE', empreinte_(code));
  alerte_('Code SERVICE enregistré.\nNotez-le : il n\'est conservé que sous forme chiffrée et ne pourra pas être relu.');
}

function menuCodeAdmin() {
  var code = demanderCode_('Code ADMINISTRATEUR', 'Code personnel, à ne jamais partager (au moins ' + APP.longueurMinCode + ' lettres/chiffres).');
  if (!code) return;
  props_().setProperty('CODE_ADMIN', empreinte_(code));
  alerte_('Code ADMINISTRATEUR enregistré.\nNotez-le : il ne pourra pas être relu.');
}

function menuReferent() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt('Référent', 'Nom affiché du référent (ex. « Marie D. – IDE »)', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var nom = String(r1.getResponseText()).trim().slice(0, 60);
  if (!nom) return alerte_('Nom vide : rien n\'a été modifié.');
  var code = demanderCode_('Code du référent', 'Code personnel de ' + nom + ' (au moins ' + APP.longueurMinCode + ' lettres/chiffres).');
  if (!code) return;
  var liste = lireReferents_().filter(function (r) { return r.nom !== nom; });
  liste.push({ nom: nom, empreinte: empreinte_(code), actif: true, modifie: formaterDate_(new Date()) });
  ecrireReferents_(liste);
  alerte_('Référent « ' + nom + ' » enregistré (' + liste.filter(function (r) { return r.actif; }).length + ' actif(s)).');
}

function menuDesactiverReferent() {
  var ui = SpreadsheetApp.getUi();
  var liste = lireReferents_();
  if (!liste.length) return alerte_('Aucun référent enregistré.');
  var r = ui.prompt('Désactiver un référent', 'Nom exact du référent :\n' + liste.map(function (x) { return '• ' + x.nom; }).join('\n'), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var nom = String(r.getResponseText()).trim();
  var trouve = false;
  liste.forEach(function (x) { if (x.nom === nom) { x.actif = false; x.modifie = formaterDate_(new Date()); trouve = true; } });
  if (!trouve) return alerte_('Référent introuvable : « ' + nom + ' ».');
  ecrireReferents_(liste);
  alerte_('« ' + nom + ' » est désactivé. Sa session est coupée immédiatement.');
}

function menuInvaliderSessions() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert('Déconnecter tout le monde ?', 'Tous les utilisateurs devront ressaisir leur code. À utiliser si un code a fuité (changez-le avant).', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  var p = props_();
  p.setProperty('VERSION_JETONS', String(versionJetons_() + 1));
  alerte_('Toutes les sessions sont fermées.');
}

function menuGenererCode() {
  alerte_('Proposition de code : ' + genererCode_(8) + '\n\n(Rien n\'est enregistré : copiez-le puis utilisez le menu correspondant.)');
}

function demanderCode_(titre, message) {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt(titre, message, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  var code = normaliserCode_(r.getResponseText());
  try {
    verifierFormatCode_(code);
  } catch (e) {
    alerte_(e.message); return null;
  }
  if (codeDejaUtilise_(empreinte_(code))) {
    alerte_('Ce code est déjà utilisé par un autre rôle. Choisissez-en un autre.'); return null;
  }
  return code;
}

function genererCode_(n) {
  var alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O, 1/I/L
  var s = '';
  for (var i = 0; i < n; i++) s += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return s;
}

// ============================================================================
// Services (Cap NCHUG) : un seul moteur, un Google Sheets par service
// ============================================================================
/* Mode « autonome » (la réa aujourd'hui) : le moteur sert un seul service, lié à son Google Sheets.
   Mode « annuaire » (Cap NCHUG) : le Google Sheets lié est l'annuaire des services ; chaque appel indique son
   service, et le moteur travaille alors dans le Google Sheets de ce service, avec ses propres réglages. */
var CTX_SERVICE = null, CLASSEUR_MEMO = null, MEMO_PROPS = {};
var CLES_GLOBALES = { SEL: 1, SECRET: 1, MODE: 1, CODE_SUPER: 1, CREATEURS: 1, CLASSEUR_ID: 1, DOSSIER_SERVICES: 1, DEFI_MODE: 1, DEFI_DEBUT: 1, DEFI_PARCOURS: 1, INFOS_CODE: 1 };
var ACTION_COURANTE_ = '';
function cleProp_(k) { return CTX_SERVICE && !CLES_GLOBALES[k] ? 's:' + CTX_SERVICE.id + ':' + k : k; }
/* Réglages du script, rangés par service, gardés en mémoire (cache) pour ménager le quota quotidien de lectures */
var PROPS_ = {
  getProperty: function (k) {
    var c = cleProp_(k); if (Object.prototype.hasOwnProperty.call(MEMO_PROPS, c)) return MEMO_PROPS[c];
    var cache = CacheService.getScriptCache(), v = cache.get('p|' + c);
    if (v === null || v === undefined) { v = PropertiesService.getScriptProperties().getProperty(c); try { cache.put('p|' + c, v === null ? '\u0000' : v, 21600); } catch (e) { /* trop gros : pas de cache */ } }
    else if (v === '\u0000') v = null;
    MEMO_PROPS[c] = v; return v;
  },
  lireFrais: function (k) { var c = cleProp_(k), v = PropertiesService.getScriptProperties().getProperty(c); MEMO_PROPS[c] = v; return v; }, // pour les compteurs, sous verrou
  setProperty: function (k, v) {
    var c = cleProp_(k); v = String(v); PropertiesService.getScriptProperties().setProperty(c, v); MEMO_PROPS[c] = v;
    var cache = CacheService.getScriptCache(); try { cache.put('p|' + c, v, 21600); } catch (e) { cache.remove('p|' + c); }
    return PROPS_;
  }
};
function props_() { return PROPS_; }
function prefixeCache_() { return CTX_SERVICE ? CTX_SERVICE.id + '|' : ''; }
function cache_() { // cache du script, rangé par service
  var c = CacheService.getScriptCache(), p = prefixeCache_();
  function k(x) { return p + x; }
  return {
    get: function (x) { return c.get(k(x)); }, put: function (x, v, t) { return c.put(k(x), v, t); }, remove: function (x) { return c.remove(k(x)); },
    getAll: function (xs) { var r = c.getAll(xs.map(k)), o = {}; xs.forEach(function (x) { if (r[k(x)] != null) o[x] = r[k(x)]; }); return o; },
    putAll: function (o, t) { var r = {}; Object.keys(o).forEach(function (x) { r[k(x)] = o[x]; }); return c.putAll(r, t); },
    removeAll: function (xs) { return c.removeAll(xs.map(k)); }
  };
}
function modeAnnuaire_() { return PROPS_.getProperty('MODE') === 'annuaire'; }
function lireServices_() { // annuaire : [{ id, nom, ss, actif, cree, par }]
  var c = CacheService.getScriptCache(), t = c.get('annuaire_services');
  if (t) return JSON.parse(t);
  var sh = annuaireClasseur_().getSheetByName(ANNUAIRE.onglet), l = [];
  if (sh) { var v = sh.getDataRange().getValues(); for (var i = 1; i < v.length; i++) if (v[i][0]) l.push({ id: String(v[i][0]), nom: String(v[i][1] || ''), ss: String(v[i][2] || ''), actif: v[i][3] === true, cree: v[i][4] instanceof Date ? formaterDate_(v[i][4]) : '', par: String(v[i][5] || ''), ligne: i + 1 }); }
  try { c.put('annuaire_services', JSON.stringify(l), 300); } catch (e) { /* ignoré */ }
  return l;
}
function entrerService_(id) {
  var s = lireServices_().filter(function (x) { return x.id === String(id || ''); })[0];
  if (!s || !s.actif || !s.ss) throw erreurApp_('service_inconnu');
  CTX_SERVICE = { id: s.id, ssId: s.ss, nom: s.nom }; CLASSEUR_MEMO = null;
  return s;
}
function sortirService_() { CTX_SERVICE = null; CLASSEUR_MEMO = null; }
function annuaireClasseur_() { var ctx = CTX_SERVICE; CTX_SERVICE = null; try { return classeurLie_(); } finally { CTX_SERVICE = ctx; } }

// ============================================================================
// Utilitaires
// ============================================================================
function classeur_() {
  if (CTX_SERVICE) return CLASSEUR_MEMO || (CLASSEUR_MEMO = SpreadsheetApp.openById(CTX_SERVICE.ssId));
  return classeurLie_();
}
function classeurLie_() {
  var id = props_().getProperty('CLASSEUR_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Ouvrez ce script depuis le Google Sheets « Base » (Extensions > Apps Script).');
  props_().setProperty('CLASSEUR_ID', ss.getId());
  return ss;
}

function completerEntetes_(sh, entetes) { // ajoute les colonnes apparues dans une nouvelle version
  var actuels = sh.getRange(1, 1, 1, entetes.length).getValues()[0];
  if (actuels.join('|') === entetes.join('|')) return;
  sh.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold').setBackground('#223b80').setFontColor('#ffffff');
}

function ajouterParametre_(ss, nom, aide) { // pour les bases installées avant l'ajout d'un paramètre
  var sh = ss.getSheetByName(ONGLETS.parametres), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === nom) return;
  sh.appendRow([nom, '', aide]);
}

function creerOnglet_(ss, nom, entetes, lignes) {
  var sh = ss.getSheetByName(nom);
  if (sh) return sh; // ne jamais écraser des données existantes
  sh = ss.insertSheet(nom);
  sh.getRange(1, 1, 1, entetes.length).setValues([entetes])
    .setFontWeight('bold').setBackground('#223b80').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  if (lignes.length) sh.getRange(2, 1, lignes.length, lignes[0].length).setValues(lignes);
  sh.autoResizeColumns(1, entetes.length);
  return sh;
}

function secret_() {
  var s = props_().getProperty('SECRET');
  if (!s) throw erreurApp_('non_installe');
  return s;
}

function formaterDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function b64url_(octets) {
  return Utilities.base64EncodeWebSafe(octets).replace(/=+$/, '');
}

function erreurApp_(code) {
  var e = new Error(code); e.codeApp = code; return e;
}

function alerte_(msg) {
  SpreadsheetApp.getUi().alert(msg);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// Codes d'accès gérés dans l'appli (administrateur du service) : indispensable pour les services de
// Cap NCHUG, dont les administrateurs n'ont pas accès au Google Sheets. Chaque nouveau code n'est montré
// qu'une fois : il n'est conservé que chiffré.
// ============================================================================
function codeNeuf_() { var c; do { c = genererCode_(8); } while (codeDejaUtilise_(empreinte_(c))); return c; }
/* Code choisi par l'administrateur (ou un créateur) : 6 à 32 lettres ou chiffres, différent des autres codes du service.
   garder : empreinte actuelle du même rôle (on peut redonner le même code). */
function codeChoisi_(code, garder) {
  code = normaliserCode_(code);
  if (code.length < APP.longueurMinCode || code.length > 32) throw erreurApp_('code_longueur');
  if (!/^[A-Z0-9]+$/.test(code)) throw erreurApp_('code_caracteres');
  var e = empreinte_(code);
  if (e !== garder && codeDejaUtilise_(e)) throw erreurApp_('code_deja_utilise');
  return code;
}
function codesEtat_() {
  return { ok: true, referents: lireReferents_().map(function (r) { return { nom: r.nom, actif: !!r.actif, modifie: r.modifie || '' }; }),
    codeAgents: !!props_().getProperty('CODE_SERVICE'), compteurs: { quiz: quizCompteur_(), jeux: Number(props_().getProperty('jeux_points') || 0) } };
}
function codesChanger_(session, quoi, nom, choisi) { // les codes sont choisis par l'administrateur (plus de tirage au hasard)
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var p = props_(), code = null;
    if (quoi === 'agents') { code = codeChoisi_(choisi, p.getProperty('CODE_SERVICE')); p.setProperty('CODE_SERVICE', empreinte_(code)); }
    else if (quoi === 'admin') { code = codeChoisi_(choisi, p.getProperty('CODE_ADMIN')); p.setProperty('CODE_ADMIN', empreinte_(code)); }
    else if (quoi === 'referent' || quoi === 'referent_off') {
      nom = nettoyerTexte_(nom, 60); if (!nom) throw erreurApp_('requete_invalide');
      var ancien = lireReferents_().filter(function (r) { return r.nom === nom; })[0];
      var liste = lireReferents_().filter(function (r) { return r.nom !== nom || quoi === 'referent_off'; });
      if (quoi === 'referent') { code = codeChoisi_(choisi, ancien && ancien.empreinte); liste.push({ nom: nom, empreinte: empreinte_(code), actif: true, modifie: formaterDate_(new Date()) }); }
      else { var t = false; liste.forEach(function (r) { if (r.nom === nom) { r.actif = false; r.modifie = formaterDate_(new Date()); t = true; } }); if (!t) throw erreurApp_('introuvable'); }
      ecrireReferents_(liste);
    } else if (quoi === 'deconnecter') { p.setProperty('VERSION_JETONS', String(versionJetons_() + 1)); }
    else if (quoi === 'raz_quiz') p.setProperty('quiz_total', '0'); // compteur « Défi d'équipe » du quiz
    else if (quoi === 'raz_jeux') p.setProperty('jeux_points', '0'); // points des jeux (jauge d'élan)
    else throw erreurApp_('requete_invalide');
    return { ok: true, enregistre: !!code, etat: codesEtat_() }; // le code choisi n'est jamais renvoyé
  } finally { verrou.releaseLock(); }
}

// ============================================================================
// Cap NCHUG : annuaire des services, super-administrateur et créateurs
// ============================================================================
var ANNUAIRE = { onglet: 'Services', entetes: ['ID', 'Nom', 'Google Sheets (ID)', 'Actif', 'Créé le', 'Créé par'] };
var ROUTES_ANNUAIRE = {
  services: function () { return { ok: true, services: lireServices_().filter(function (s) { return s.actif && s.id.charAt(0) !== '_'; }).map(function (s) { return { id: s.id, nom: s.nom }; }), infos: infosOuvertes_() }; },
  infos_login: function (req) { return infosLogin_(req.code); },
  infos_code: function (req) { return infosCode_(verifierJetonAnnuaire_(req.jeton), req.code); },
  annuaire_login: function (req) { return annuaireLogin_(req.code); },
  annuaire_etat: function (req) { return annuaireEtat_(verifierJetonAnnuaire_(req.jeton)); },
  service_creer: function (req) { return serviceCreer_(verifierJetonAnnuaire_(req.jeton), req.donnees || {}); },
  service_modifier: function (req) { return serviceModifier_(verifierJetonAnnuaire_(req.jeton), req.id, req.donnees || {}); },
  service_code: function (req) { return serviceCode_(verifierJetonAnnuaire_(req.jeton), req.id, req.quoi, req.code); },
  createur: function (req) { return createurGerer_(exigerSuper_(verifierJetonAnnuaire_(req.jeton)), req.nom, req.actif); },
  commun_jeton: function (req) { return communJeton_(verifierJetonAnnuaire_(req.jeton)); },
  tableau_bord: function (req) { return tableauBord_(verifierJetonAnnuaire_(req.jeton)); },
  service_rattacher: function (req) { return serviceRattacher_(verifierJetonAnnuaire_(req.jeton), req.donnees); }
};
function lireCreateurs_() { try { return JSON.parse(props_().getProperty('CREATEURS') || '[]'); } catch (e) { return []; } }
function annuaireLogin_(code) {
  sortirService_(); code = normaliserCode_(code);
  if (!code) throw erreurApp_('code_manquant');
  var cache = cache_(); if (cache.get('blocage')) throw erreurApp_('trop_de_tentatives');
  var e = empreinte_(code), role = null, nom = '';
  if (e === props_().getProperty('CODE_SUPER')) { role = 'super'; nom = 'Super-administrateur'; }
  else lireCreateurs_().forEach(function (c) { if (!role && c.actif && c.empreinte === e) { role = 'createur'; nom = c.nom; } });
  if (!role) { enregistrerEchec_(cache); Utilities.sleep(600); throw erreurApp_('code_incorrect'); }
  var exp = Date.now() + 86400000;
  return { ok: true, jeton: signerJeton_({ r: role, n: nom, v: versionJetons_(), exp: exp, s: '_' }), role: role, libelle: nom, expiration: new Date(exp).toISOString() };
}
function verifierJetonAnnuaire_(jeton) {
  sortirService_();
  var c = lireJeton_(jeton);
  if (c.s !== '_' || (c.r !== 'super' && c.r !== 'createur')) throw erreurApp_('session_invalide');
  if (c.r === 'createur' && !lireCreateurs_().some(function (x) { return x.actif && x.nom === c.n; })) throw erreurApp_('session_expiree');
  return c;
}
function exigerSuper_(session) { if (session.r !== 'super') throw erreurApp_('non_autorise'); return session; }
function annuaireEtat_(session) {
  return { ok: true, role: session.r, libelle: session.n, infos: { code: PROPS_.getProperty('INFOS_CODE') || '', commun: !!communService_() },
    services: lireServices_().filter(function (s) { return s.id.charAt(0) !== '_'; }).map(function (s) { return { id: s.id, nom: s.nom, actif: s.actif, cree: s.cree, par: s.par, lienSheets: session.r === 'super' && s.ss ? 'https://docs.google.com/spreadsheets/d/' + s.ss : '' }; }),
    createurs: session.r === 'super' ? lireCreateurs_().map(function (c) { return { nom: c.nom, actif: !!c.actif, modifie: c.modifie || '' }; }) : null };
}
function idService_(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}
function dossierServices_() {
  var id = props_().getProperty('DOSSIER_SERVICES');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* supprimé : on le recrée */ } }
  var d = DriveApp.createFolder('Cap NCHUG – Services (privé)');
  props_().setProperty('DOSSIER_SERVICES', d.getId());
  return d;
}
function viderCacheServices_() { CacheService.getScriptCache().remove('annuaire_services'); }
function serviceCreer_(session, d) {
  var nom = nettoyerTexte_(d.nom, 60), id = idService_(d.id || nom);
  if (nom.length < 2 || !/^[a-z][a-z0-9-]{1,23}$/.test(id)) throw erreurApp_('requete_invalide');
  if (d.codeAdmin || d.codeAgents) { // codes choisis : vérifiés avant de créer le Google Sheets du service
    var ca = normaliserCode_(d.codeAdmin), cg = normaliserCode_(d.codeAgents);
    [ca, cg].forEach(function (c) {
      if (c.length < APP.longueurMinCode || c.length > 32) throw erreurApp_('code_longueur');
      if (!/^[A-Z0-9]+$/.test(c)) throw erreurApp_('code_caracteres');
    });
    if (ca === cg) throw erreurApp_('code_deja_utilise');
  }
  var verrou = LockService.getScriptLock(); verrou.waitLock(20000);
  try {
    viderCacheServices_();
    if (lireServices_().some(function (s) { return s.id === id; })) throw erreurApp_('service_existe');
    var ss = SpreadsheetApp.create('Cap NCHUG – ' + nom);
    try { DriveApp.getFileById(ss.getId()).moveTo(dossierServices_()); } catch (e) { console.error('déplacement : ' + e); }
    CTX_SERVICE = { id: id, ssId: ss.getId(), nom: nom }; CLASSEUR_MEMO = ss;
    installerBase_(ss, nom);
    var p = props_(); p.setProperty('VERSION_JETONS', '1');
    // Codes choisis par le créateur (ou tirés au hasard s'il ne les a pas tapés)
    var admin = d.codeAdmin ? codeChoisi_(d.codeAdmin) : codeNeuf_(); p.setProperty('CODE_ADMIN', empreinte_(admin));
    var agents = d.codeAgents ? codeChoisi_(d.codeAgents) : codeNeuf_(); p.setProperty('CODE_SERVICE', empreinte_(agents));
    sortirService_();
    annuaireClasseur_().getSheetByName(ANNUAIRE.onglet).appendRow([id, nom, ss.getId(), true, new Date(), session.n]);
    viderCacheServices_();
    return { ok: true, service: { id: id, nom: nom }, codes: { admin: admin, agents: agents } };
  } finally { sortirService_(); verrou.releaseLock(); }
}
function serviceModifier_(session, id, d) {
  var sv = lireServices_().filter(function (x) { return x.id === String(id || ''); })[0]; if (!sv) throw erreurApp_('introuvable');
  var sh = annuaireClasseur_().getSheetByName(ANNUAIRE.onglet);
  if (d.nom != null) { var nom = nettoyerTexte_(d.nom, 60); if (nom.length < 2) throw erreurApp_('requete_invalide'); sh.getRange(sv.ligne, 2).setValue(nom); }
  if (d.actif != null) { if (session.r !== 'super' && d.actif === false) throw erreurApp_('non_autorise'); sh.getRange(sv.ligne, 4).setValue(d.actif === true); }
  viderCacheServices_();
  return annuaireEtat_(session);
}
function serviceCode_(session, id, quoi, choisi) { // nouveau code admin ou agents d'un service (code perdu) : choisi par le créateur ou au hasard
  if (quoi !== 'admin' && quoi !== 'agents') throw erreurApp_('requete_invalide');
  var sv = lireServices_().filter(function (x) { return x.id === String(id || ''); })[0]; if (!sv || !sv.ss) throw erreurApp_('introuvable');
  CTX_SERVICE = { id: sv.id, ssId: sv.ss, nom: sv.nom }; CLASSEUR_MEMO = null;
  try {
    var cle = quoi === 'admin' ? 'CODE_ADMIN' : 'CODE_SERVICE', code = choisi ? codeChoisi_(choisi, props_().getProperty(cle)) : codeNeuf_();
    props_().setProperty(cle, empreinte_(code)); return { ok: true, code: code };
  }
  finally { sortirService_(); }
}
function createurGerer_(session, nom, actif) {
  nom = nettoyerTexte_(nom, 60); if (!nom) throw erreurApp_('requete_invalide');
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var l = lireCreateurs_(), x = l.filter(function (c) { return c.nom === nom; })[0], code = null;
    if (actif === false) { if (!x) throw erreurApp_('introuvable'); x.actif = false; }
    else { code = genererCode_(10); var e = empreinte_(code); if (!x) { x = { nom: nom }; l.push(x); } x.empreinte = e; x.actif = true; }
    x.modifie = formaterDate_(new Date());
    props_().setProperty('CREATEURS', JSON.stringify(l));
    return { ok: true, code: code, etat: annuaireEtat_(session) };
  } finally { verrou.releaseLock(); }
}
/** Cap NCHUG : à lancer une fois dans un Google Sheets vide (Extensions › Apps Script › exécuter installerAnnuaire). */
function installerAnnuaire() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || classeurLie_();
  if (ss.getSheetByName(ONGLETS.parametres)) return alerte_('Ce Google Sheets est la base d\'un service : créez un Google Sheets vide pour l\'annuaire Cap NCHUG.');
  var p = props_();
  if (!p.getProperty('SEL')) p.setProperty('SEL', Utilities.getUuid() + Utilities.getUuid());
  if (!p.getProperty('SECRET')) p.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
  if (!p.getProperty('VERSION_JETONS')) p.setProperty('VERSION_JETONS', '1');
  p.setProperty('CLASSEUR_ID', ss.getId()); p.setProperty('MODE', 'annuaire');
  creerOnglet_(ss, ANNUAIRE.onglet, ANNUAIRE.entetes, []);
  defiOnglets_(ss);
  ss.getSheetByName(ANNUAIRE.onglet).protect().setDescription('Géré par l\'appli Cap NCHUG').setWarningOnly(true);
  var f = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1'); if (f && ss.getSheets().length > 1) ss.deleteSheet(f);
  installerPurgeQuotidienne_();
  if (!p.getProperty('CODE_SUPER')) alerte_('Annuaire Cap NCHUG installé.\\n\\nÉtape suivante : menu « Cap NCHUG – Administration › Définir le code SUPER-ADMINISTRATEUR ».');
  else alerte_('Annuaire vérifié : tout est en place.');
}
function menuCodeSuper() {
  var code = demanderCode_('Code SUPER-ADMINISTRATEUR', 'Votre code personnel pour Cap NCHUG (au moins ' + APP.longueurMinCode + ' lettres/chiffres). Il permet de créer les services et de nommer les admins créateurs.');
  if (!code) return;
  props_().setProperty('CODE_SUPER', empreinte_(code));
  alerte_('Code SUPER-ADMINISTRATEUR enregistré. Notez-le : il ne pourra pas être relu.');
}
function menuInvaliderAnnuaire() { props_().setProperty('VERSION_JETONS', String(versionJetons_() + 1)); alerte_('Le super-admin et les créateurs devront ressaisir leur code.'); }

// ============================================================================
// Défi CHU (moteur 2.1) : questions communes à tous les services, défi du jour, classement en % de bonnes
// réponses par service, jeu « Parcours » (vue du ciel, rue Caraïbes, ascenseur, arrivée).
// Tout est rangé dans le Google Sheets de l'annuaire (ou dans la base du service quand il est seul) :
// rien sur GitHub. Aucun suivi individuel : seuls des totaux par service et par semaine sont gardés.
// ============================================================================
var DEFI = {
  ongletQ: 'Défi – Questions', ongletSite: 'Défi – Site', ongletScores: 'Défi – Scores', ongletPlan: 'Plan – Services',
  entetesPlan: ['Bâtiment', 'Niveau', 'Services (un par ligne)'],
  entetesQ: ['ID', 'Thème', 'Type', 'Question', 'Réponses (une par ligne)', 'Bonne réponse', 'Explication', 'Entrée ou bâtiment', 'Niveau', 'Source', 'Statut', 'Par', 'Modifiée le'],
  entetesSite: ['Type', 'Code', 'Nom', 'Couleur', 'Bâtiment', 'X', 'Y', 'Largeur', 'Hauteur'],
  entetesScores: ['Semaine (lundi)', 'Service', 'Nom du service', 'Réponses', 'Bonnes réponses', '% de bonnes réponses', 'Mode'],
  parJour: 6, missionsParJour: 2, seuil: 30, semainesGardees: 8, niveaux: ['-1', '0', '1', '2', '3', '4'],
  statuts: { 'à valider': 1, 'validée': 1, 'retirée': 1 }, types: { qcm: 1, vf: 1, ascenseur: 1 }, typesSite: { 'bâtiment': 1, 'entrée': 1, 'parking': 1 }
};
var ROUTES_DEFI_GESTION = {
  defi_gestion: function (req) { gestionDefi_(req); return defiGestionEtat_(); },
  defi_mode: function (req) { gestionDefi_(req); return defiMode_(req.mode); },
  defi_question: function (req) { return defiQuestion_(gestionDefi_(req), req.id, req.donnees || {}); },
  defi_statut: function (req) { gestionDefi_(req); return defiStatut_(req.ids, req.statut); },
  defi_site: function (req) { gestionDefi_(req); return defiSiteEnregistrer_(req.site); },
  defi_importer: function (req) { return defiImporter_(gestionDefi_(req), req.donnees || {}); },
  defi_raz: function (req) { gestionDefi_(req); return defiRaz_(); },
  defi_parcours_actif: function (req) { gestionDefi_(req); return defiParcoursActiver_(req.actif); },
  defi_plan_services: function (req) { gestionDefi_(req); return defiPlanEnregistrer_(req.batiment, req.niveau, req.services); }
};
/* Qui gère le Défi : le super-admin et les créateurs (Cap NCHUG) ; l'administrateur quand le service est seul. */
function gestionDefi_(req) {
  if (modeAnnuaire_()) return verifierJetonAnnuaire_(req.jeton);
  return exigerAdmin_(verifierJeton_(req.jeton));
}
function defiClasseur_() { return annuaireClasseur_(); }
function defiOnglets_(ss) {
  creerOnglet_(ss, DEFI.ongletQ, DEFI.entetesQ, []);
  creerOnglet_(ss, DEFI.ongletSite, DEFI.entetesSite, []);
  creerOnglet_(ss, DEFI.ongletScores, DEFI.entetesScores, []);
  creerOnglet_(ss, DEFI.ongletPlan, DEFI.entetesPlan, []);
}
function defiOnglet_(nom) {
  var ss = defiClasseur_(), sh = ss.getSheetByName(nom);
  if (!sh) { defiOnglets_(ss); sh = ss.getSheetByName(nom); }
  return sh;
}
function defiModeActuel_() { return PROPS_.getProperty('DEFI_MODE') === 'officiel' ? 'officiel' : 'test'; }
// Jeu « Parcours » séparé : désactivé tant qu'un gestionnaire du Défi ne l'a pas activé (les 2 missions du Défi du jour restent jouées)
function defiParcoursActif_() { return PROPS_.getProperty('DEFI_PARCOURS') === 'actif'; }
function fnv_(s) { var x = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = (x * 16777619) >>> 0; } return x; }
function aujourdhuiDefi_() { return formaterDate_(new Date()); }
function lundi_(iso) { var d = new Date(iso + 'T12:00:00Z'), j = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - j); return d.toISOString().slice(0, 10); }
function libelleEntree_(e) { e = String(e || ''); return /^B/i.test(e) ? e.toUpperCase() : 'N° ' + e; }

/* ---------- Lecture des questions et du site (gardés en cache 5 min) ---------- */
function defiViderCache_() { CacheService.getScriptCache().removeAll(['defi|q', 'defi|site', 'defi|plan']); }
function lireDefiQuestions_() {
  var c = CacheService.getScriptCache(), t = c.get('defi|q');
  if (t) return JSON.parse(t);
  var v = defiOnglet_(DEFI.ongletQ).getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i], id = String(r[0] || '').trim(); if (!id) continue;
    var type = String(r[2] || '').trim().toLowerCase().replace('vrai/faux', 'vf');
    var q = { id: id, theme: String(r[1] || '').trim(), type: type, texte: String(r[3] || '').trim(), explication: String(r[6] || '').trim(),
      source: String(r[9] || '').trim(), statut: String(r[10] || '').trim().toLowerCase() || 'à valider', par: String(r[11] || ''), modifie: r[12] instanceof Date ? formaterDate_(r[12]) : String(r[12] || ''), ligne: i + 1 };
    if (q.statut === 'validee') q.statut = 'validée'; if (q.statut === 'retiree') q.statut = 'retirée'; if (!DEFI.statuts[q.statut]) q.statut = 'à valider';
    if (type === 'qcm') { q.choix = String(r[4] || '').split(/\n/).map(function (x) { return x.trim(); }).filter(String); q.bonne = Number(r[5]) - 1; }
    else if (type === 'vf') q.bonne = /^v/i.test(String(r[5]).trim()) || r[5] === true ? 'vrai' : 'faux';
    else if (type === 'ascenseur') q.bonne = { entree: String(r[7] || '').trim().replace(/^N°\s*/i, ''), niveau: String(r[8]).trim().replace(/^'/, '') };
    q.valide = defiQuestionValide_(q);
    l.push(q);
  }
  try { c.put('defi|q', JSON.stringify(l), 300); } catch (e) { /* trop gros : pas de cache */ }
  return l;
}
function defiQuestionValide_(q) {
  if (!q.texte || !DEFI.types[q.type]) return false;
  if (q.type === 'qcm') return q.choix.length >= 2 && q.choix.length <= 6 && q.bonne >= 0 && q.bonne < q.choix.length;
  if (q.type === 'ascenseur') return !!q.bonne.entree && DEFI.niveaux.indexOf(q.bonne.niveau) >= 0;
  return true;
}
function lireDefiSite_() {
  var c = CacheService.getScriptCache(), t = c.get('defi|site');
  if (t) return JSON.parse(t);
  var v = defiOnglet_(DEFI.ongletSite).getDataRange().getValues(), s = { batiments: [], entrees: [], parkings: [] };
  for (var i = 1; i < v.length; i++) {
    var r = v[i], type = String(r[0] || '').trim().toLowerCase(), code = String(r[1] || '').trim().replace(/^N°\s*/i, '');
    if (!code && type !== 'parking') continue;
    var x = { code: code, nom: String(r[2] || '').trim(), couleur: couleurValide_(String(r[3] || '').trim()) || '', x: Number(r[5]) || 0, y: Number(r[6]) || 0 };
    if (type === 'bâtiment' || type === 'batiment') { x.l = Number(r[7]) || 60; x.h = Number(r[8]) || 40; s.batiments.push(x); }
    else if (type === 'entrée' || type === 'entree') { x.batiment = String(r[4] || '').trim().toUpperCase(); s.entrees.push(x); }
    else if (type === 'parking') { x.l = Number(r[7]) || 120; x.h = Number(r[8]) || 40; s.parkings.push(x); }
  }
  try { c.put('defi|site', JSON.stringify(s), 300); } catch (e) { /* ignoré */ }
  return s;
}
function defiPool_(mode) { // questions jouables : validées ; en phase de test, aussi celles à valider
  return lireDefiQuestions_().filter(function (q) { return q.valide && (q.statut === 'validée' || (mode === 'test' && q.statut === 'à valider')); });
}

/* ---------- Défi du jour : les mêmes 6 questions pour tout le CHU (4 questions + 2 missions du Parcours) ---------- */
function defiTirage_(date, mode) {
  var cle = 'defi|jour2|' + date + '|' + mode, c = CacheService.getScriptCache(), t = c.get(cle);
  if (t) return JSON.parse(t);
  var site = lireDefiSite_();
  var pool = defiPool_(mode).slice().sort(function (a, b) { return fnv_(date + '|' + a.id) - fnv_(date + '|' + b.id); });
  // Les questions « ascenseur » ne sont plus posées seules : elles deviennent des missions du Parcours (vue du ciel → rue → ascenseur)
  var missions = pool.filter(function (q) { return q.type === 'ascenseur' && defiMissionJouable_(q, site); }).slice(0, DEFI.missionsParJour);
  var classiques = pool.filter(function (q) { return q.type !== 'ascenseur'; }), nb = DEFI.parJour - missions.length;
  var pris = [], parTheme = {};
  classiques.forEach(function (q) { if (pris.length < nb && (parTheme[q.theme] || 0) < 2) { pris.push(q); parTheme[q.theme] = (parTheme[q.theme] || 0) + 1; } });
  classiques.forEach(function (q) { if (pris.length < nb && pris.indexOf(q) < 0) pris.push(q); });
  // Les missions arrivent en 3e et en 6e position
  missions.forEach(function (q, k) { pris.splice(Math.min(pris.length, k ? DEFI.parJour - 1 : 2), 0, q); });
  var r = pris.map(function (q) {
    var x = { id: q.id, type: q.type, theme: q.theme, texte: q.texte };
    if (q.type === 'qcm') x.choix = q.choix;
    if (q.type === 'ascenseur') x.mission = defiMission_(q); // toujours comptée bonne une fois terminée : la réponse peut voyager
    return x;
  });
  try { c.put(cle, JSON.stringify(r), 21600); } catch (e) { /* ignoré */ }
  return r;
}
/* Une mission est jouable si la vue du ciel connaît son bâtiment (code B) ou son entrée (N°) et le bâtiment de celle-ci */
function defiMissionJouable_(q, site) {
  var cible = String(q.bonne.entree || '').toUpperCase(), bats = {};
  site.batiments.forEach(function (b) { bats[String(b.code).toUpperCase()] = 1; });
  if (/^B/.test(cible)) return !!bats[cible];
  return site.entrees.some(function (e) { return String(e.code).toUpperCase() === cible && bats[String(e.batiment).toUpperCase()]; });
}
function defiMission_(q) {
  return { id: q.id, destination: q.texte.replace(/^Prenez l'ascenseur\s*:\s*/i, '').replace(/\.$/, ''), entree: q.bonne.entree, niveau: q.bonne.niveau, explication: q.explication };
}
function defiJour_(session) {
  var mode = defiModeActuel_(), date = aujourdhuiDefi_(), qs = defiTirage_(date, mode);
  var r = { ok: true, date: date, mode: mode, questions: qs, seuil: DEFI.seuil, parcours: defiParcoursActif_() };
  if (qs.some(function (x) { return x.type === 'ascenseur'; })) { r.site = lireDefiSite_(); r.niveaux = DEFI.niveaux; }
  return r;
}
function defiRepondre_(session, d) {
  d = d || {};
  var mode = defiModeActuel_(), date = aujourdhuiDefi_(), id = String(d.id || '');
  if (!defiTirage_(date, mode).some(function (x) { return x.id === id; })) throw erreurApp_('defi_perime'); // la journée a changé
  var q = lireDefiQuestions_().filter(function (x) { return x.id === id; })[0]; if (!q) throw erreurApp_('introuvable');
  var rep = d.reponse, bon;
  if (q.type === 'qcm') bon = Number(rep) === q.bonne;
  else if (q.type === 'vf') bon = String(rep) === q.bonne;
  else bon = !!rep && rep.termine === true; // mission du Parcours : bonne dès qu'elle est terminée, quelles que soient les erreurs
  // Seule la 1re réponse de ce téléphone à cette question compte (empreinte gardée quelques heures, jamais reliée à une personne)
  var empr = 'defi|vu|' + fnv_(empreinteAppareil_(d.appareil) + '|' + date + '|' + id).toString(36) + fnv_(id + '|' + d.appareil).toString(36);
  var c = CacheService.getScriptCache(), compte = session.r !== 'visiteur' && !c.get(empr); // Infos générales : entraînement, ne compte pour aucun service
  if (compte) {
    c.put(empr, '1', 21600);
    defiCompter_(session, mode, date, bon);
  }
  return { ok: true, bon: bon, compte: compte, entrainement: session.r === 'visiteur', bonne: q.type === 'ascenseur' ? { entree: q.bonne.entree, libelle: libelleEntree_(q.bonne.entree), niveau: q.bonne.niveau } : q.bonne, explication: q.explication };
}
function defiServiceCourant_() {
  if (CTX_SERVICE) return { id: CTX_SERVICE.id, nom: CTX_SERVICE.nom };
  return { id: 'service', nom: String(lireParametres_(classeur_())['Nom du service'] || 'Mon service') };
}
function defiCompter_(session, mode, date, bon) {
  var sv = defiServiceCourant_(), p = PropertiesService.getScriptProperties();
  var kS = 'DEFI_S|' + lundi_(date) + '|' + mode + '|' + sv.id, kC = 'DEFI_C|' + mode + '|' + sv.id;
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    function plus(t) { var a = String(t || '0,0').split(','); return (Number(a[0]) + 1) + ',' + (Number(a[1]) + (bon ? 1 : 0)); }
    var o = {}; o[kS] = plus(p.getProperty(kS)); o[kC] = plus(p.getProperty(kC)); o['DEFI_N|' + sv.id] = sv.nom;
    p.setProperties(o);
  } finally { verrou.releaseLock(); }
  CacheService.getScriptCache().remove('defi|classement|' + mode);
}

/* ---------- Classement : % de bonnes réponses par service, à partir de 30 réponses ---------- */
function defiClassement_(session) {
  var mode = defiModeActuel_(), c = CacheService.getScriptCache(), cle = 'defi|classement|' + mode, t = c.get(cle), base;
  if (t) base = JSON.parse(t);
  else {
    var tout = PropertiesService.getScriptProperties().getProperties(), noms = {}, semaines = {}, general = {};
    Object.keys(tout).forEach(function (k) { if (k.indexOf('DEFI_N|') === 0) noms[k.slice(7)] = tout[k]; });
    Object.keys(tout).forEach(function (k) {
      var a = k.split('|'), v = String(tout[k]).split(',');
      if (a[0] === 'DEFI_S' && a[2] === mode) { (semaines[a[1]] = semaines[a[1]] || {})[a[3]] = [Number(v[0]), Number(v[1])]; }
      if (a[0] === 'DEFI_C' && a[1] === mode) general[a[2]] = [Number(v[0]), Number(v[1])];
    });
    if (modeAnnuaire_()) lireServices_().forEach(function (s) { noms[s.id] = s.nom; });
    base = { noms: noms, semaines: semaines, general: general };
    try { c.put(cle, JSON.stringify(base), 120); } catch (e) { /* ignoré */ }
  }
  var moi = defiServiceCourant_().id, lu = lundi_(aujourdhuiDefi_()), avant = decalerJours_(lu, -7);
  function tableau(o) {
    var l = Object.keys(o || {}).map(function (id) { var r = o[id]; return { nom: base.noms[id] || id, vous: id === moi, reponses: r[0], pourcent: r[0] ? Math.round(1000 * r[1] / r[0]) / 10 : 0, classe: r[0] >= DEFI.seuil }; });
    l.sort(function (a, b) { return (b.classe - a.classe) || (b.pourcent - a.pourcent) || (b.reponses - a.reponses); });
    var rang = 0; l.forEach(function (x) { x.rang = x.classe ? ++rang : null; });
    return l;
  }
  return { ok: true, mode: mode, seuil: DEFI.seuil, semaine: { lundi: lu, lignes: tableau(base.semaines[lu]) },
    precedente: { lundi: avant, lignes: tableau(base.semaines[avant]) }, general: tableau(base.general), debut: PROPS_.getProperty('DEFI_DEBUT') || '', parcours: defiParcoursActif_() };
}

/* ---------- Parcours : missions (questions « ascenseur ») et dessin du site ---------- */
function defiParcours_(session) {
  if (!defiParcoursActif_()) throw erreurApp_('parcours_inactif');
  var mode = defiModeActuel_(), site = lireDefiSite_();
  var missions = defiPool_(mode).filter(function (q) { return q.type === 'ascenseur' && defiMissionJouable_(q, site); }).map(defiMission_);
  return { ok: true, mode: mode, site: site, missions: missions, niveaux: DEFI.niveaux, parcours: true };
}
/* ---------- Plans du CHU : services par bâtiment et par niveau (onglet « Plan – Services », jamais sur GitHub) ---------- */
function lireDefiPlan_() {
  var c = CacheService.getScriptCache(), t = c.get('defi|plan');
  if (t) return JSON.parse(t);
  var v = defiOnglet_(DEFI.ongletPlan).getDataRange().getValues(), parCle = {}, l = [];
  for (var i = 1; i < v.length; i++) {
    var bat = String(v[i][0] || '').trim().toUpperCase(), niv = String(v[i][1]).trim().replace(/^'/, '');
    var sv = String(v[i][2] || '').split(/\n/).map(function (x) { return x.trim(); }).filter(String);
    if (!bat || DEFI.niveaux.indexOf(niv) < 0 || !sv.length) continue;
    var cle = bat + '|' + niv;
    if (!parCle[cle]) { parCle[cle] = { batiment: bat, niveau: niv, services: [] }; l.push(parCle[cle]); }
    parCle[cle].services = parCle[cle].services.concat(sv).slice(0, 40);
  }
  try { c.put('defi|plan', JSON.stringify(l), 300); } catch (e) { /* ignoré */ }
  return l;
}
function defiPlan_(session) { return { ok: true, site: lireDefiSite_(), etages: lireDefiPlan_(), niveaux: DEFI.niveaux }; }
function defiPlanEnregistrer_(bat, niv, services) {
  bat = nettoyerTexte_(bat, 8).toUpperCase(); niv = String(niv == null ? '' : niv).trim();
  if (!/^[A-Z0-9]{1,8}$/.test(bat) || DEFI.niveaux.indexOf(niv) < 0 || !Array.isArray(services) || services.length > 40) throw erreurApp_('requete_invalide');
  var l = services.map(function (x) { return nettoyerTexte_(x, 120); }).filter(String);
  var sh = defiOnglet_(DEFI.ongletPlan), verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var v = sh.getDataRange().getValues(), ligne = 0;
    for (var i = v.length - 1; i >= 1; i--) {
      if (String(v[i][0] || '').trim().toUpperCase() === bat && String(v[i][1]).trim().replace(/^'/, '') === niv) { if (!ligne) ligne = i + 1; else sh.deleteRow(i + 1); }
    }
    if (!l.length) { if (ligne) sh.deleteRow(ligne); }
    else if (ligne) sh.getRange(ligne, 1, 1, 3).setValues([[bat, niv, l.join('\n')]]);
    else sh.appendRow([bat, niv, l.join('\n')]);
  } finally { verrou.releaseLock(); }
  defiViderCache_();
  return defiGestionEtat_();
}

/* ---------- Infos générales : contenus communs en lecture, avec un code commun choisi par le super-admin ou un créateur ---------- */
var INFOS_ACTIONS = { home: 1, logo: 1, nl_liste: 1, nl_page: 1, docs_liste: 1, docs_pdf_page: 1, defi_jour: 1, defi_repondre: 1, defi_classement: 1, defi_parcours: 1, defi_plan: 1 };
function infosEmpreinte_() { var c = PROPS_.getProperty('INFOS_CODE'); return c ? fnv_('infos|' + c).toString(36) : ''; }
function infosOuvertes_() { return !!PROPS_.getProperty('INFOS_CODE') && !!communService_(); }
function infosLogin_(code) {
  sortirService_(); code = normaliserCode_(code);
  if (!code) throw erreurApp_('code_manquant');
  var cache = cache_(); if (cache.get('blocage')) throw erreurApp_('trop_de_tentatives');
  var attendu = PROPS_.getProperty('INFOS_CODE'), c = communService_();
  if (!attendu || !c) throw erreurApp_('infos_fermees');
  if (!egaliteConstante_(code, attendu)) { enregistrerEchec_(cache); Utilities.sleep(600); throw erreurApp_('code_incorrect'); }
  var ci = infosEmpreinte_();
  CTX_SERVICE = { id: c.id, ssId: c.ss, nom: c.nom }; MEMO_PROPS = {};
  try {
    var exp = Date.now() + APP.dureeJetonJours.visiteur * 86400000;
    return { ok: true, service: { id: c.id, nom: 'Infos générales' }, jeton: signerJeton_({ r: 'visiteur', n: '', v: versionJetons_(), exp: exp, s: c.id, ci: ci }),
      role: 'visiteur', libelle: 'Infos générales', expiration: new Date(exp).toISOString() };
  } finally { sortirService_(); }
}
function infosCode_(session, code) {
  if (code === null || code === '' || code === undefined) { PROPS_.setProperty('INFOS_CODE', ''); return { ok: true, code: '' }; } // accès fermé
  code = normaliserCode_(code);
  if (!/^[A-Z0-9-]{6,32}$/.test(code)) throw erreurApp_('code_infos_invalide');
  PROPS_.setProperty('INFOS_CODE', code);
  return { ok: true, code: code };
}
function defiParcoursActiver_(actif) {
  PROPS_.setProperty('DEFI_PARCOURS', actif === true ? 'actif' : 'inactif');
  return defiGestionEtat_();
}

/* ---------- Gestion (super-admin et créateurs) ---------- */
function defiGestionEtat_() {
  return { ok: true, mode: defiModeActuel_(), debut: PROPS_.getProperty('DEFI_DEBUT') || '', parcours: defiParcoursActif_(),
    questions: lireDefiQuestions_().map(function (q) { var x = Object.assign({}, q); delete x.ligne; return x; }),
    site: lireDefiSite_(), niveaux: DEFI.niveaux, plan: lireDefiPlan_(),
    lienSheets: modeAnnuaire_() ? 'https://docs.google.com/spreadsheets/d/' + defiClasseur_().getId() : '' };
}
function defiMode_(mode) {
  if (mode !== 'test' && mode !== 'officiel') throw erreurApp_('requete_invalide');
  var avant = defiModeActuel_();
  PROPS_.setProperty('DEFI_MODE', mode);
  if (mode === 'officiel' && avant !== 'officiel') { // ouverture officielle : le classement repart de zéro
    var p = PropertiesService.getScriptProperties(), tout = p.getProperties();
    Object.keys(tout).forEach(function (k) { if (/^DEFI_[SC]\|/.test(k) && k.indexOf('|officiel|') > 0) p.deleteProperty(k); });
    PROPS_.setProperty('DEFI_DEBUT', aujourdhuiDefi_());
  }
  CacheService.getScriptCache().removeAll(['defi|classement|test', 'defi|classement|officiel']);
  return defiGestionEtat_();
}
/* Remise à zéro des scores du Défi (phase en cours) : classements de la semaine et général repartent de zéro */
function defiRaz_() {
  var mode = defiModeActuel_(), p = PropertiesService.getScriptProperties(), tout = p.getProperties(), n = 0;
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try { Object.keys(tout).forEach(function (k) { if (/^DEFI_[SC]\|/.test(k) && k.split('|').indexOf(mode) > 0) { p.deleteProperty(k); n++; } }); }
  finally { verrou.releaseLock(); }
  if (mode === 'officiel') PROPS_.setProperty('DEFI_DEBUT', aujourdhuiDefi_());
  CacheService.getScriptCache().removeAll(['defi|classement|test', 'defi|classement|officiel']);
  var r = defiGestionEtat_(); r.remisAZero = n; return r;
}
function ligneQuestion_(q, par) {
  return [q.id, q.theme, q.type, q.texte, q.type === 'qcm' ? q.choix.join('\n') : '',
    q.type === 'qcm' ? q.bonne + 1 : q.type === 'vf' ? q.bonne : '', q.explication,
    q.type === 'ascenseur' ? q.bonne.entree : '', q.type === 'ascenseur' ? Number(q.bonne.niveau) : '', q.source || '', q.statut, par || '', new Date()];
}
function nettoyerQuestion_(d) {
  var q = { theme: nettoyerTexte_(d.theme, 30) || 'divers', type: String(d.type || ''), texte: nettoyerTexte_(d.texte, 300), explication: nettoyerTexte_(d.explication, 500),
    source: nettoyerTexte_(d.source, 100), statut: DEFI.statuts[d.statut] ? d.statut : 'à valider' };
  if (q.type === 'qcm') { q.choix = (d.choix || []).map(function (x) { return nettoyerTexte_(x, 120); }).filter(String); q.bonne = Number(d.bonne); }
  else if (q.type === 'vf') q.bonne = d.bonne === 'vrai' || d.bonne === true ? 'vrai' : 'faux';
  else if (q.type === 'ascenseur') q.bonne = { entree: nettoyerTexte_((d.bonne || {}).entree, 10).replace(/^N°\s*/i, '').toUpperCase(), niveau: String((d.bonne || {}).niveau || '') };
  if (!defiQuestionValide_(q)) throw erreurApp_('question_invalide');
  return q;
}
function defiQuestion_(session, id, d) {
  var q = nettoyerQuestion_(d), sh = defiOnglet_(DEFI.ongletQ);
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    defiViderCache_();
    var l = lireDefiQuestions_();
    if (id) { var x = l.filter(function (y) { return y.id === String(id); })[0]; if (!x) throw erreurApp_('introuvable'); q.id = x.id; sh.getRange(x.ligne, 1, 1, DEFI.entetesQ.length).setValues([ligneQuestion_(q, session.n)]); }
    else {
      var max = 0; l.forEach(function (y) { var m = /^D(\d+)$/.exec(y.id); if (m) max = Math.max(max, Number(m[1])); });
      q.id = 'D' + ('00' + (max + 1)).slice(-3); sh.appendRow(ligneQuestion_(q, session.n));
    }
  } finally { defiViderCache_(); verrou.releaseLock(); }
  return defiGestionEtat_();
}
function defiStatut_(ids, statut) {
  if (!DEFI.statuts[statut] || !Array.isArray(ids) || !ids.length || ids.length > 500) throw erreurApp_('requete_invalide');
  var sh = defiOnglet_(DEFI.ongletQ), verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    defiViderCache_();
    var l = lireDefiQuestions_(), vus = {}; ids.forEach(function (i) { vus[String(i)] = 1; });
    l.forEach(function (q) { if (vus[q.id]) { sh.getRange(q.ligne, 11).setValue(statut); sh.getRange(q.ligne, 13).setValue(new Date()); } });
  } finally { defiViderCache_(); verrou.releaseLock(); }
  return defiGestionEtat_();
}
function nettoyerSite_(s) {
  s = s || {}; var lignes = [], codes = {};
  function n(v, a, b) { v = Math.round(Number(v)); return isNaN(v) ? a : Math.max(a, Math.min(b, v)); }
  (s.batiments || []).slice(0, 40).forEach(function (b) {
    var code = nettoyerTexte_(b.code, 10).toUpperCase(); if (!code || codes[code]) return; codes[code] = 1;
    if (couleurValide_(b.couleur) === null) throw erreurApp_('requete_invalide');
    lignes.push(['bâtiment', code, nettoyerTexte_(b.nom, 60), b.couleur || '', '', n(b.x, 0, 358), n(b.y, 0, 470), n(b.l, 20, 300), n(b.h, 20, 300)]);
  });
  (s.entrees || []).slice(0, 80).forEach(function (e) {
    var code = nettoyerTexte_(e.code, 10).replace(/^N°\s*/i, ''); if (!code) return;
    if (couleurValide_(e.couleur) === null) throw erreurApp_('requete_invalide');
    lignes.push(['entrée', code, nettoyerTexte_(e.nom, 60), e.couleur || '', nettoyerTexte_(e.batiment, 10).toUpperCase(), n(e.x, 0, 358), n(e.y, 0, 470), '', '']);
  });
  (s.parkings || []).slice(0, 6).forEach(function (pk) {
    lignes.push(['parking', nettoyerTexte_(pk.code, 10) || 'P', nettoyerTexte_(pk.nom, 40), couleurValide_(pk.couleur) || '', '', n(pk.x, 0, 358), n(pk.y, 0, 470), n(pk.l, 20, 358), n(pk.h, 10, 200)]);
  });
  return lignes;
}
function defiSiteEnregistrer_(site) {
  var lignes = nettoyerSite_(site), sh = defiOnglet_(DEFI.ongletSite);
  var verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, DEFI.entetesSite.length).clearContent();
    if (lignes.length) sh.getRange(2, 1, lignes.length, DEFI.entetesSite.length).setValues(lignes);
  } finally { defiViderCache_(); verrou.releaseLock(); }
  return defiGestionEtat_();
}
/* Import d'un fichier de questions (banque fournie hors GitHub) : les questions déjà présentes (même ID) ne sont pas écrasées. */
function defiImporter_(session, d) {
  var sh = defiOnglet_(DEFI.ongletQ), ajout = 0, ignore = 0, lignes = [];
  var verrou = LockService.getScriptLock(); verrou.waitLock(20000);
  try {
    defiViderCache_();
    var deja = {}; lireDefiQuestions_().forEach(function (q) { deja[q.id] = 1; });
    (Array.isArray(d.questions) ? d.questions : []).slice(0, 1000).forEach(function (x) {
      var id = nettoyerTexte_(x.id, 12);
      if (!/^[A-Za-z0-9_-]{1,12}$/.test(id) || deja[id]) { ignore++; return; }
      try { var q = nettoyerQuestion_(x); q.id = id; deja[id] = 1; lignes.push(ligneQuestion_(q, session.n)); ajout++; } catch (e) { ignore++; }
    });
    if (lignes.length) sh.getRange(sh.getLastRow() + 1, 1, lignes.length, DEFI.entetesQ.length).setValues(lignes);
  } finally { defiViderCache_(); verrou.releaseLock(); }
  var siteRemplace = false;
  if (d.site && (d.site.batiments || []).length) { var vide = !lireDefiSite_().batiments.length; if (vide || d.remplacerSite) { defiSiteEnregistrer_(d.site); siteRemplace = true; } }
  var r = defiGestionEtat_(); r.import = { ajoutees: ajout, ignorees: ignore, site: siteRemplace }; return r;
}

/* ---------- Tâche quotidienne : copie des totaux dans l'onglet « Défi – Scores », ménage des vieilles semaines ---------- */
function defiArchiver_() {
  var p = PropertiesService.getScriptProperties(), tout = p.getProperties(), noms = {}, sh = defiOnglet_(DEFI.ongletScores);
  Object.keys(tout).forEach(function (k) { if (k.indexOf('DEFI_N|') === 0) noms[k.slice(7)] = tout[k]; });
  var v = sh.getDataRange().getValues(), lignes = {}, ordre = [];
  for (var i = 1; i < v.length; i++) { if (!v[i][0]) continue; var cle = texteDate_(v[i][0]) + '|' + v[i][6] + '|' + v[i][1]; lignes[cle] = v[i].slice(0, 7); lignes[cle][0] = texteDate_(v[i][0]); ordre.push(cle); }
  var limite = decalerJours_(lundi_(aujourdhuiDefi_()), -7 * DEFI.semainesGardees), n = 0;
  Object.keys(tout).forEach(function (k) {
    var a = k.split('|'); if (a[0] !== 'DEFI_S') return;
    var r = String(tout[k]).split(','), rep = Number(r[0]), bon = Number(r[1]), cle = a[1] + '|' + a[2] + '|' + a[3];
    if (!lignes[cle]) ordre.push(cle);
    lignes[cle] = [a[1], a[3], noms[a[3]] || a[3], rep, bon, rep ? Math.round(1000 * bon / rep) / 10 : 0, a[2]];
    if (a[1] < limite) { p.deleteProperty(k); n++; }
  });
  var l = ordre.map(function (k) { return lignes[k]; }).sort(function (a, b) { return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : (b[5] - a[5]); });
  if (l.length) { if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 7).clearContent(); sh.getRange(2, 1, l.length, 7).setValues(l); }
  return 'Défi : ' + l.length + ' ligne(s) de scores, ' + n + ' vieille(s) semaine(s) rangée(s).';
}

// ============================================================================
// Rattachement d'un service qui a son propre moteur (la réa) au moteur commun Cap NCHUG (moteur 2.2)
// 1. Dans le moteur du service : menu « Préparer le rattachement à Cap NCHUG » → paquet chiffré rangé dans un onglet
//    de sa base + clé à usage unique montrée une seule fois.
// 2. Le Google Sheets « Base » (et le dossier Drive du service) est partagé avec le compte dédié Cap NCHUG.
// 3. Le super-admin, dans l'Espace créateurs : « Rattacher un service existant » (lien du Sheets + clé).
//    Les codes restent les mêmes (le sel du service le suit) ; chacun ressaisit simplement son code une fois.
// 4. L'ancien moteur le voit et répond alors « service déplacé » : plus aucune écriture en double.
// ============================================================================
var RATTACHEMENT = { onglet: 'Rattachement Cap NCHUG', exclus: { SEL: 1, SECRET: 1, MODE: 1, CLASSEUR_ID: 1, RATTACHEMENT: 1, DEPLACE: 1, CODE_SUPER: 1, CREATEURS: 1, DOSSIER_SERVICES: 1, DEFI_MODE: 1, DEFI_DEBUT: 1 } };
function cleUnique_() { // 20 caractères tirés d'identifiants aléatoires de Google
  var a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', h = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''), s = '';
  for (var i = 0; i < 20; i++) s += a.charAt(parseInt(h.substr(i * 3, 3), 16) % a.length);
  return s.replace(/(.{5})(?=.)/g, '$1-');
}
function fluxOctets_(cle, n) { var o = []; for (var i = 0; o.length < n; i++) o = o.concat(Utilities.computeHmacSha256Signature('flux|' + i, cle)); return o; }
function chiffrer_(texte, cle) {
  var b = Utilities.newBlob(texte).getBytes(), f = fluxOctets_(cle, b.length), c = b.map(function (x, i) { return ((x ^ f[i]) << 24) >> 24; });
  var corps = Utilities.base64Encode(c);
  return 'v1.' + corps + '.' + Utilities.base64Encode(Utilities.computeHmacSha256Signature('mac|' + corps, cle));
}
function dechiffrer_(paquet, cle) {
  var p = String(paquet || '').split('.'); if (p.length !== 3 || p[0] !== 'v1') throw erreurApp_('paquet_absent');
  if (!egaliteConstante_(Utilities.base64Encode(Utilities.computeHmacSha256Signature('mac|' + p[1], cle)), p[2])) throw erreurApp_('cle_incorrecte');
  var c = Utilities.base64Decode(p[1]), f = fluxOctets_(cle, c.length);
  return Utilities.newBlob(c.map(function (x, i) { return ((x ^ f[i]) << 24) >> 24; })).getDataAsString();
}
function normaliserCle_(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{5})(?=.)/g, '$1-'); }

/* ----- Côté service autonome (la réa) ----- */
function menuPreparerRattachement() {
  if (modeAnnuaire_()) return alerte_('Ceci se fait dans le moteur du service à rattacher, pas dans l\'annuaire.');
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Rattacher ce service à Cap NCHUG', 'Un paquet chiffré (codes d\'accès chiffrés, référents, réglages) va être préparé pour le moteur commun Cap NCHUG. Rien ne change tant que le super-administrateur ne l\'a pas importé.\n\nContinuer ?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var p = PropertiesService.getScriptProperties(), tout = p.getProperties(), o = {};
  Object.keys(tout).forEach(function (k) { if (!RATTACHEMENT.exclus[k] && !/^DEFI_[SCN]\|/.test(k) && k.indexOf('s:') !== 0) o[k] = tout[k]; });
  var ss = classeur_(), params = lireParametres_(ss), cle = cleUnique_();
  var paquet = chiffrer_(JSON.stringify({ v: 1, nom: String(params['Nom du service'] || ''), sel: tout.SEL, props: o, prepare: new Date().toISOString() }), cle);
  var sh = ss.getSheetByName(RATTACHEMENT.onglet) || ss.insertSheet(RATTACHEMENT.onglet);
  sh.clear();
  sh.getRange(1, 1, 1, 3).setValues([['Paquet chiffré (ne pas modifier)', 'Importé par Cap NCHUG le', 'Aide']]).setFontWeight('bold');
  sh.getRange(2, 1, 1, 3).setValues([[paquet, '', 'Préparé le ' + formaterDate_(new Date()) + '. Illisible sans la clé à usage unique. Effacé automatiquement après l\'import.']]);
  try { sh.protect().setDescription('Rattachement Cap NCHUG').setWarningOnly(true); } catch (e) { /* ignoré */ }
  p.setProperty('RATTACHEMENT', new Date().toISOString()); p.deleteProperty('DEPLACE'); CacheService.getScriptCache().remove('deplace');
  ui.alert('Paquet prêt', 'Clé à usage unique (notez-la, elle ne sera plus affichée) :\n\n' + cle +
    '\n\nÀ faire maintenant :\n1. Partagez ce Google Sheets, et le dossier Drive qui contient le plan et les dossiers privés, avec le compte dédié Cap NCHUG (rôle : éditeur).\n2. Donnez au super-administrateur le lien de ce Google Sheets et la clé.\n3. Il fait « Rattacher un service existant » dans l\'Espace créateurs.\n\nCe moteur continue de fonctionner jusqu\'à l\'import.', ui.ButtonSet.OK);
}
function menuAnnulerRattachement() {
  var p = PropertiesService.getScriptProperties(); p.deleteProperty('RATTACHEMENT'); p.deleteProperty('DEPLACE'); CacheService.getScriptCache().remove('deplace');
  var sh = classeurLie_().getSheetByName(RATTACHEMENT.onglet); if (sh) sh.getRange(2, 1, 1, 2).clearContent();
  alerte_('Rattachement annulé : ce moteur sert de nouveau le service.\n\nSi le service a déjà été rattaché dans Cap NCHUG, demandez au super-administrateur de le fermer là-bas pour éviter deux moteurs actifs.');
}
/* Appelé à chaque requête du moteur autonome : une fois le paquet importé, ce moteur s'efface. */
function serviceDeplace_() {
  if (modeAnnuaire_()) return false;
  var p = PROPS_; if (p.getProperty('DEPLACE') === '1') return true;
  if (!p.getProperty('RATTACHEMENT')) return false;
  var c = CacheService.getScriptCache(); if (c.get('deplace') === 'non') return false;
  var sh = classeurLie_().getSheetByName(RATTACHEMENT.onglet), fait = !!(sh && String(sh.getRange(2, 2).getValue() || '').trim());
  if (fait) { p.setProperty('DEPLACE', '1'); return true; }
  c.put('deplace', 'non', 120); return false;
}

/* ----- Côté annuaire (moteur commun) ----- */
function idDepuisLien_(t) { var m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(String(t || '')); return m ? m[1] : (/^[A-Za-z0-9_-]{20,}$/.test(String(t || '').trim()) ? String(t).trim() : ''); }
function serviceRattacher_(session, d) {
  exigerSuper_(session); d = d || {};
  var ssId = idDepuisLien_(d.sheets), cle = normaliserCle_(d.cle), nom = nettoyerTexte_(d.nom, 60), id = idService_(d.id || nom);
  if (!ssId || cle.length < 23 || !/^[a-z][a-z0-9-]{1,23}$/.test(id)) throw erreurApp_('requete_invalide');
  var verrou = LockService.getScriptLock(); verrou.waitLock(20000);
  try {
    viderCacheServices_();
    if (lireServices_().some(function (s) { return s.id === id || s.ss === ssId; })) throw erreurApp_('service_existe');
    var ss; try { ss = SpreadsheetApp.openById(ssId); } catch (e) { throw erreurApp_('acces_refuse'); }
    var sh = ss.getSheetByName(RATTACHEMENT.onglet); if (!sh) throw erreurApp_('paquet_absent');
    if (String(sh.getRange(2, 2).getValue() || '').trim()) throw erreurApp_('deja_rattache');
    var x = JSON.parse(dechiffrer_(sh.getRange(2, 1).getValue(), cle));
    if (!x || x.v !== 1 || !x.sel || !x.props) throw erreurApp_('paquet_absent');
    nom = nom || nettoyerTexte_(x.nom, 60) || id;
    // Réglages du service (codes chiffrés, référents, compteurs, GPS, repères du plan) rangés sous son identifiant
    var o = {}; Object.keys(x.props).forEach(function (k) { if (!RATTACHEMENT.exclus[k] && !CLES_GLOBALES[k]) o['s:' + id + ':' + k] = String(x.props[k]); });
    o['s:' + id + ':SEL_SERVICE'] = x.sel; // les codes actuels restent valables
    o['s:' + id + ':VERSION_JETONS'] = String(Number(x.props.VERSION_JETONS || 1) + 1);
    PropertiesService.getScriptProperties().setProperties(o);
    Object.keys(o).forEach(function (k) { CacheService.getScriptCache().remove('p|' + k); });
    // Défi CHU : si l'annuaire n'a pas encore de questions, on reprend celles du service (avec leurs statuts) et sa vue du ciel
    var defi = defiReprendre_(ss);
    // Accès aux fichiers du Drive du service (plan, dossiers privés)
    var params = lireParametres_(ss), avert = [];
    [['Fichier du plan (ID Drive)', 'fichier', 'le plan'], ['Dossier des newsletters (ID Drive)', 'dossier', 'le dossier des newsletters'], ['Dossier des photos (ID Drive)', 'dossier', 'le dossier des photos']].forEach(function (a) {
      var fid = String(params[a[0]] || '').trim(); if (!fid) return;
      try { if (a[1] === 'fichier') DriveApp.getFileById(fid).getName(); else DriveApp.getFolderById(fid).getName(); }
      catch (e) { avert.push('Cap NCHUG ne peut pas ouvrir ' + a[2] + ' : partagez-le avec le compte dédié (éditeur).'); }
    });
    sortirService_();
    annuaireClasseur_().getSheetByName(ANNUAIRE.onglet).appendRow([id, nom, ssId, true, new Date(), session.n + ' (rattaché)']);
    viderCacheServices_();
    // Le paquet est effacé ; la date d'import fait basculer l'ancien moteur en « service déplacé »
    sh.getRange(2, 1, 1, 2).setValues([['(importé, effacé)', new Date()]]);
    return { ok: true, service: { id: id, nom: nom }, avertissements: avert, defi: defi };
  } finally { sortirService_(); verrou.releaseLock(); }
}
function defiReprendre_(ssService) {
  var dest = defiOnglet_(DEFI.ongletQ); if (dest.getLastRow() > 1) return 'L\'annuaire avait déjà ses questions du Défi : celles du service ne sont pas reprises.';
  var r = [];
  [[DEFI.ongletQ, DEFI.entetesQ.length], [DEFI.ongletSite, DEFI.entetesSite.length]].forEach(function (o) {
    var src = ssService.getSheetByName(o[0]); if (!src || src.getLastRow() < 2) return;
    var v = src.getRange(2, 1, src.getLastRow() - 1, o[1]).getValues(), sh = defiOnglet_(o[0]);
    if (o[0] === DEFI.ongletSite && sh.getLastRow() > 1) return;
    sh.getRange(2, 1, v.length, o[1]).setValues(v); r.push(v.length + (o[0] === DEFI.ongletQ ? ' questions' : ' éléments de la vue du ciel'));
  });
  defiViderCache_();
  return r.length ? 'Défi CHU repris : ' + r.join(', ') + '.' : '';
}


// ============================================================================
// Lot 4 : escape game modifiable par chaque service (missions rangées dans l'onglet « Escape game »)
// Tant que l'onglet est vide, l'appli propose ses missions de départ (la réa : les siennes ; les autres : des modèles
// généraux). Dès la première modification, les missions de départ sont recopiées dans l'onglet, puis modifiées.
// Toute mission modifiée doit de nouveau être validée par un référent avant d'être visible des agents.
// ============================================================================
var ESCAPE = { entetes: ['ID', 'Titre', 'Icône', 'Durée', 'Résumé', 'Étapes (JSON)', 'Statut', 'Auteur', 'Modifié le'], types: { recit: 1, choix: 1, multi: 1, ordre: 1, plan: 1 }, max: 30 };
function ongletEscape_(ss) { return ss.getSheetByName(ONGLETS.escape) || creerOnglet_(ss, ONGLETS.escape, ESCAPE.entetes, []); }
function lireEscape_(ss) {
  var sh = ongletEscape_(ss), v = sh.getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0] || '').trim(); if (!id) continue;
    var et = []; try { et = JSON.parse(v[i][5] || '[]'); } catch (e) { et = []; }
    l.push({ id: id, titre: String(v[i][1] || ''), ic: String(v[i][2] || '🔓'), duree: String(v[i][3] || ''), resume: String(v[i][4] || ''), etapes: et,
      statut: String(v[i][6] || 'actif'), auteur: String(v[i][7] || ''), modifie: v[i][8] instanceof Date ? formaterDate_(v[i][8]) : '', ligne: i + 1 });
  }
  return l;
}
function escapeScenarios_(session) {
  var l = lireEscape_(classeur_());
  if (!l.length) return { ok: true, scenarios: null }; // l'appli utilise ses missions de départ
  var ref = session.r === 'admin' || session.r === 'referent';
  return { ok: true, scenarios: l.filter(function (x) { return x.statut !== 'retiré' || ref; }).map(function (x) { var y = Object.assign({}, x); delete y.ligne; return y; }) };
}
function nettoyerScenario_(sc) {
  sc = sc || {};
  var t = function (v, m) { return nettoyerTexte_(v, m); };
  var x = { titre: t(sc.titre, 80), ic: t(sc.ic, 4) || '🔓', duree: t(sc.duree, 20), resume: t(sc.resume, 400), etapes: [] };
  if (x.titre.length < 3 || !Array.isArray(sc.etapes) || !sc.etapes.length || sc.etapes.length > ESCAPE.max) throw erreurApp_('scenario_invalide');
  sc.etapes.forEach(function (e) {
    e = e || {}; if (!ESCAPE.types[e.type]) throw erreurApp_('scenario_invalide');
    var y = { type: e.type };
    if (e.type === 'recit') { y.texte = t(e.texte, 600); if (!y.texte) throw erreurApp_('scenario_invalide'); x.etapes.push(y); return; }
    y.question = t(e.question, 300); if (!y.question) throw erreurApp_('scenario_invalide');
    if (e.indice) y.indice = t(e.indice, 300); if (e.explication) y.explication = t(e.explication, 500);
    if (e.type === 'choix') {
      y.choix = (e.choix || []).map(function (c) { return t(c, 200); }).filter(String); y.bonne = Number(e.bonne);
      if (y.choix.length < 2 || y.choix.length > 6 || !(y.bonne >= 0 && y.bonne < y.choix.length)) throw erreurApp_('scenario_invalide');
    } else if (e.type === 'multi') {
      y.items = (e.items || []).map(function (c) { return { t: t(c && c.t, 200), ok: !!(c && c.ok) }; }).filter(function (c) { return c.t; });
      if (y.items.length < 2 || y.items.length > 10 || !y.items.some(function (c) { return c.ok; })) throw erreurApp_('scenario_invalide');
    } else if (e.type === 'ordre') {
      y.items = (e.items || []).map(function (c) { return t(c, 200); }).filter(String);
      if (y.items.length < 2 || y.items.length > 8) throw erreurApp_('scenario_invalide');
    } else if (e.type === 'plan') {
      var c = e.cible || {}, z = {};
      if (c.chambre) z.chambre = t(c.chambre, 20); else if (c.section) z.section = t(c.section, 40); else if (c.point) { z.point = t(c.point, 40); if (c.proche) z.proche = t(c.proche, 20); }
      if (!Object.keys(z).length) throw erreurApp_('scenario_invalide');
      y.cible = z;
    }
    x.etapes.push(y);
  });
  return x;
}
function ligneEscape_(id, x, statut, auteur) { return [id, x.titre, x.ic, x.duree, x.resume, JSON.stringify(x.etapes), statut || 'actif', auteur || '', new Date()]; }
/* modeles : missions de départ envoyées par l'appli, recopiées une seule fois quand l'onglet est encore vide */
function escapeAmorcer_(ss, modeles, auteur) {
  var sh = ongletEscape_(ss); if (sh.getLastRow() > 1 || !Array.isArray(modeles)) return;
  var lignes = []; modeles.slice(0, ESCAPE.max).forEach(function (m) {
    var id = String(m && m.id || ''); if (!/^[a-z0-9-]{3,30}$/.test(id)) return;
    try { lignes.push(ligneEscape_(id, nettoyerScenario_(m), 'actif', 'Modèle Cap NCHUG')); } catch (e) { /* modèle ignoré */ }
  });
  if (lignes.length) sh.getRange(2, 1, lignes.length, ESCAPE.entetes.length).setValues(lignes);
}
function escapeOterValidation_(ss, id) {
  var c = jeuxConfig_(ss).escape; if (!c || !c.ligne) return;
  var g = c.reglages || {}; g.valides = g.valides || {};
  if (g.valides[id]) { delete g.valides[id]; ss.getSheetByName(ONGLETS.jeux).getRange(c.ligne, 6).setValue(JSON.stringify({ valides: g.valides })); }
}
function escapeEnregistrer_(session, id, scenario, modeles) {
  var x = nettoyerScenario_(scenario), ss = classeur_(), verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    escapeAmorcer_(ss, modeles, session.n);
    var sh = ongletEscape_(ss), l = lireEscape_(ss), y = id ? l.filter(function (z) { return z.id === String(id); })[0] : null;
    if (id && !y) throw erreurApp_('introuvable');
    if (y) { sh.getRange(y.ligne, 1, 1, ESCAPE.entetes.length).setValues([ligneEscape_(y.id, x, 'actif', session.n || 'Référent')]); escapeOterValidation_(ss, y.id); return { ok: true, id: y.id }; }
    if (l.length >= ESCAPE.max) throw erreurApp_('trop_de_missions');
    var nid = (idService_(x.titre).slice(0, 20) || 'mission') + '-' + Utilities.getUuid().slice(0, 4);
    sh.appendRow(ligneEscape_(nid, x, 'actif', session.n || 'Référent'));
    return { ok: true, id: nid };
  } finally { verrou.releaseLock(); }
}
function escapeRetirer_(session, id, modeles) {
  var ss = classeur_(), verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    escapeAmorcer_(ss, modeles, session.n);
    var y = lireEscape_(ss).filter(function (z) { return z.id === String(id || ''); })[0]; if (!y) throw erreurApp_('introuvable');
    var sh = ongletEscape_(ss), retire = y.statut !== 'retiré';
    sh.getRange(y.ligne, 7).setValue(retire ? 'retiré' : 'actif'); sh.getRange(y.ligne, 9).setValue(new Date());
    if (retire) escapeOterValidation_(ss, y.id);
    return { ok: true, statut: retire ? 'retiré' : 'actif' };
  } finally { verrou.releaseLock(); }
}


// ============================================================================
// Lot 5 : contenus communs à tout le CHU (Cap NCHUG)
// Un « service » caché, « _chu », porte les actualités, newsletters et documents communs. Le super-admin et les créateurs
// y entrent comme administrateurs (jeton du jour) et utilisent les écrans habituels. Chaque service les voit avec les siens.
// ============================================================================
var COMMUN = { id: '_chu', nom: 'Contenus communs du CHU' };
function communService_() { return modeAnnuaire_() ? (lireServices_().filter(function (s) { return s.id === COMMUN.id && s.ss; })[0] || null) : null; }
function avecCommun_(fn) { // exécute fn dans les contenus communs, puis revient au service en cours
  var c = communService_(); if (!c || (CTX_SERVICE && CTX_SERVICE.id === COMMUN.id)) return null;
  var ctx = CTX_SERVICE, memo = CLASSEUR_MEMO;
  CTX_SERVICE = { id: c.id, ssId: c.ss, nom: c.nom }; CLASSEUR_MEMO = null;
  try { return fn(); } catch (e) { console.error('commun : ' + e); return null; } finally { CTX_SERVICE = ctx; CLASSEUR_MEMO = memo; }
}
function communMemo_(cle, fn) {
  if (!CTX_SERVICE || CTX_SERVICE.id === COMMUN.id || !modeAnnuaire_()) return [];
  var c = CacheService.getScriptCache(), t = c.get('commun|' + cle); if (t) return JSON.parse(t);
  var v = avecCommun_(fn) || []; try { c.put('commun|' + cle, JSON.stringify(v), 120); } catch (e) { /* ignoré */ }
  return v;
}
function communActus_() { return communMemo_('actus', function () { return lireActualites_(classeur_()).map(function (a) { a.chu = true; return a; }); }); }
function communNewsletters_() {
  return communMemo_('nl', function () { return lireNewsletters_(classeur_()).filter(publieeNl_).reverse().map(function (n) { return { id: 'chu:' + n.id, titre: n.titre, parution: n.parution, pages: n.pages, ratio: n.ratio, ajout: n.ajout, chu: true }; }); });
}
function derniereNewsletterTout_(ss) {
  var a = derniereNewsletter_(ss), l = lireNewsletters_(ss).filter(publieeNl_), dateA = l.length ? l[l.length - 1].ajout : '';
  var c = communNewsletters_()[0];
  if (c && (!a || c.ajout > dateA)) return { id: c.id, titre: c.titre, chu: true };
  return a;
}
function communJeton_(session) {
  var verrou = LockService.getScriptLock(), c; verrou.waitLock(20000);
  try {
    viderCacheServices_(); c = communService_();
    if (!c) { // première fois : création du Google Sheets des contenus communs
      var ss = SpreadsheetApp.create('Cap NCHUG – ' + COMMUN.nom);
      try { DriveApp.getFileById(ss.getId()).moveTo(dossierServices_()); } catch (e) { console.error('déplacement : ' + e); }
      CTX_SERVICE = { id: COMMUN.id, ssId: ss.getId(), nom: COMMUN.nom }; CLASSEUR_MEMO = ss;
      installerBase_(ss, COMMUN.nom);
      var act = ss.getSheetByName(ONGLETS.actualites); if (act.getLastRow() > 1) act.deleteRows(2, act.getLastRow() - 1); // pas d'actualité d'accueil en double
      ecrireParametre_(ss, 'Rubriques actives', 'newsletter, docs'); ecrireParametre_(ss, "Message d'accueil", 'Espace des contenus communs : ce que vous publiez ici apparaît dans tous les services.');
      props_().setProperty('VERSION_JETONS', '1');
      sortirService_();
      annuaireClasseur_().getSheetByName(ANNUAIRE.onglet).appendRow([COMMUN.id, COMMUN.nom, ss.getId(), true, new Date(), session.n]);
      viderCacheServices_(); c = communService_();
    }
    CTX_SERVICE = { id: c.id, ssId: c.ss, nom: c.nom };
    var exp = Date.now() + 86400000;
    return { ok: true, service: { id: c.id, nom: c.nom }, jeton: signerJeton_({ r: 'admin', n: session.n, v: versionJetons_(), exp: exp, s: c.id }), role: 'admin', libelle: session.n, expiration: new Date(exp).toISOString() };
  } finally { sortirService_(); verrou.releaseLock(); }
}

/* ---------- Actualités modifiables dans l'appli (référents et administrateur) ---------- */
function actuListe_() {
  var v = classeur_().getSheetByName(ONGLETS.actualites).getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) { if (!v[i][1]) continue; l.push({ ligne: i + 1, date: v[i][0] instanceof Date ? formaterDate_(v[i][0]) : '', titre: String(v[i][1]), texte: String(v[i][2] || ''), publiee: v[i][3] === true, epinglee: v[i][4] === true }); }
  l.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  return { ok: true, actualites: l };
}
function actuEnregistrer_(session, d) {
  var titre = nettoyerTexte_(d.titre, 120), texte = String(d.texte == null ? '' : d.texte).replace(/[\u0000-\u0009\u000b-\u001f<>]/g, '').trim().slice(0, 2000);
  if (titre.length < 2) throw erreurApp_('requete_invalide');
  var sh = classeur_().getSheetByName(ONGLETS.actualites), verrou = LockService.getScriptLock(); verrou.waitLock(10000);
  try {
    var date = /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? new Date(+d.date.slice(0, 4), +d.date.slice(5, 7) - 1, +d.date.slice(8, 10), 12) : new Date();
    var ligne = [date, titre, texte, d.publiee !== false, !!d.epinglee];
    if (d.ligne) { var n = Number(d.ligne); if (!(n >= 2 && n <= sh.getLastRow()) || String(sh.getRange(n, 2).getValue()) !== String(d.titreAvant || '')) throw erreurApp_('introuvable'); sh.getRange(n, 1, 1, 5).setValues([ligne]); }
    else sh.appendRow(ligne);
  } finally { verrou.releaseLock(); }
  CacheService.getScriptCache().remove('commun|actus');
  return actuListe_();
}
function actuSupprimer_(n, titre) {
  var sh = classeur_().getSheetByName(ONGLETS.actualites); n = Number(n);
  if (!(n >= 2 && n <= sh.getLastRow()) || String(sh.getRange(n, 2).getValue()) !== String(titre || '')) throw erreurApp_('introuvable');
  sh.deleteRow(n); CacheService.getScriptCache().remove('commun|actus');
  return actuListe_();
}

/* ---------- Documents et FAQ (service + communs), PDF et rubriques personnalisées (moteur 2.4.0) ---------- */
// Un document peut porter un PDF : converti en images sur le téléphone (comme les newsletters), texte extrait pour la recherche.
// La colonne « Rubrique » range la fiche dans une rubrique personnalisée (« RUBxxxx/SRyyy ») ; vide = Documents et FAQ.
var DOCS = { entetes: ['ID', 'Catégorie', 'Titre ou question', 'Texte ou réponse', 'Lien (https)', 'Ordre', 'Publié', 'Par', 'Modifié le',
  'Rubrique (ID/sous-rubrique)', 'PDF : pages', 'PDF : fichiers (ID Drive)', 'PDF : format (hauteur/largeur)', 'PDF : texte (recherche)'], maxTextePdf: 30000 };
function ongletDocs_(ss) {
  var sh = ss.getSheetByName(ONGLETS.documents) || creerOnglet_(ss, ONGLETS.documents, DOCS.entetes, []);
  if (sh.getLastColumn() < DOCS.entetes.length) completerEntetes_(sh, DOCS.entetes);
  return sh;
}
function lireDocs_(ss) {
  var sh = ongletDocs_(ss), v = sh.getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0] || '').trim(); if (!id || !v[i][2]) continue;
    var lien = String(v[i][4] || '').trim(); if (lien && !/^https:\/\/[^\s<>"]+$/.test(lien)) lien = '';
    var pages = Number(v[i][10]) || 0, fichiers = [], pdf = null;
    try { fichiers = JSON.parse(v[i][11] || '[]'); } catch (e) { fichiers = []; }
    if (!Array.isArray(fichiers)) fichiers = [];
    if (pages > 0) {
      var complet = true; for (var k = 0; k < pages; k++) if (!fichiers[k]) complet = false;
      pdf = { pages: pages, ratio: Number(v[i][12]) || 1.414, complet: complet, v: fnv_(String(v[i][11] || '')).toString(36) };
    }
    l.push({ id: id, categorie: String(v[i][1] || 'Divers'), titre: String(v[i][2]), texte: String(v[i][3] || ''), lien: lien, ordre: Number(v[i][5]) || 0, publie: v[i][6] !== false, par: String(v[i][7] || ''),
      rubrique: String(v[i][9] || '').trim(), pdf: pdf, pdfTexte: pdf ? String(v[i][13] || '') : '', fichiers: fichiers, ligne: i + 1 });
  }
  return l.sort(function (a, b) { return a.categorie.localeCompare(b.categorie) || a.ordre - b.ordre || a.titre.localeCompare(b.titre); });
}
function docVisible_(d) { return d.publie && (!d.pdf || d.pdf.complet); } // un PDF en cours d'envoi n'est pas montré aux agents
function docPublic_(d, chu) {
  var o = { id: d.id, categorie: d.categorie, titre: d.titre, texte: d.texte, lien: d.lien, ordre: d.ordre, publie: d.publie, par: d.par, rubrique: d.rubrique, pdf: d.pdf, pdfTexte: d.pdfTexte };
  if (chu) o.chu = true;
  return o;
}
function docsListe_(session, rubrique) {
  var ref = session.r === 'admin' || session.r === 'referent', ss = classeur_(), r = null;
  rubrique = String(rubrique || '').trim();
  if (rubrique) { r = rubriqueTrouver_(ss, rubrique); if (!r) throw erreurApp_('rubrique_introuvable'); }
  function dansLaRubrique(d) { var x = String(d.rubrique || ''); return r ? x.split('/')[0] === r.id : !x; }
  var communs = communMemo_('docs', function () { return lireDocs_(classeur_()).filter(docVisible_).map(function (d) { return docPublic_(d, true); }); }).filter(dansLaRubrique);
  var propres = r && r.source === 'commune' ? [] : lireDocs_(ss).filter(function (d) { return dansLaRubrique(d) && (ref || docVisible_(d)); }).map(function (d) { return docPublic_(d, false); });
  return { ok: true, documents: communs.concat(propres), peutModifier: ref && !(r && r.source === 'commune'), rubrique: r };
}
function jeterFichiers_(ids) { (ids || []).forEach(function (fid) { if (fid) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) { /* déjà absent */ } } }); }
function texteCellule_(t) { t = String(t || ''); return /^[=+\-@]/.test(t) ? "'" + t : t; } // jamais interprété comme une formule
function docsEnregistrer_(session, id, d) {
  var titre = nettoyerTexte_(d.titre, 160), texte = String(d.texte == null ? '' : d.texte).replace(/[\u0000-\u0009\u000b-\u001f<>]/g, '').trim().slice(0, 4000);
  var lien = String(d.lien || '').trim(); if (lien && !/^https:\/\/[^\s<>"]{4,500}$/.test(lien)) throw erreurApp_('lien_invalide');
  var pdf = d.pdf; // absent : inchangé ; null : retiré ; { pages, ratio, texte } : nouveau PDF, dont les pages sont envoyées ensuite
  if (pdf) {
    var np = Number(pdf.pages), nr = Number(pdf.ratio);
    if (!(np >= 1 && np <= NL.maxPages && Math.floor(np) === np)) throw erreurApp_('requete_invalide');
    if (!(nr > 0.2 && nr < 5)) nr = 1.414;
    pdf = { pages: np, ratio: Math.round(nr * 1000) / 1000, texte: String(pdf.texte || '').replace(/[\u0000-\u0009\u000b-\u001f<>]/g, ' ').slice(0, DOCS.maxTextePdf) };
  } else if (pdf !== null) pdf = undefined;
  var ss = classeur_(), rub;
  if (d.rubrique !== undefined) {
    rub = '';
    if (d.rubrique) {
      var p = String(d.rubrique).split('/'), r = rubriqueTrouver_(ss, p[0]);
      if (!r || r.source === 'commune') throw erreurApp_('rubrique_introuvable');
      rub = r.id + '/' + (p[1] && r.sous.some(function (s) { return s.id === p[1]; }) ? p[1] : '');
    }
  }
  var verrou = LockService.getScriptLock(), nouvelId; verrou.waitLock(10000);
  try {
    var l = lireDocs_(ss), sh = ongletDocs_(ss), x = null;
    if (id) { x = l.filter(function (y) { return y.id === String(id); })[0]; if (!x) throw erreurApp_('introuvable'); }
    var aPdf = pdf ? true : (pdf === null ? false : !!(x && x.pdf));
    if (titre.length < 2 || (!texte && !lien && !aPdf)) throw erreurApp_('requete_invalide');
    var colsPdf;
    if (pdf) { if (x) jeterFichiers_(x.fichiers); colsPdf = [pdf.pages, '[]', pdf.ratio, texteCellule_(pdf.texte)]; }
    else if (pdf === null) { if (x) jeterFichiers_(x.fichiers); colsPdf = ['', '', '', '']; }
    else colsPdf = x && x.pdf ? [x.pdf.pages, JSON.stringify(x.fichiers), x.pdf.ratio, texteCellule_(x.pdfTexte)] : ['', '', '', ''];
    nouvelId = x ? x.id : 'DOC' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    var ligne = [nouvelId, nettoyerTexte_(d.categorie, 40) || 'Divers', titre, texte, lien, Math.round(Number(d.ordre) || 0), d.publie !== false, session.n || 'Administrateur', new Date(),
      rub !== undefined ? rub : (x ? x.rubrique : '')].concat(colsPdf);
    if (x) sh.getRange(x.ligne, 1, 1, ligne.length).setValues([ligne]); else sh.appendRow(ligne);
    if (rub === undefined) rub = x ? x.rubrique : '';
  } finally { verrou.releaseLock(); }
  CacheService.getScriptCache().remove('commun|docs');
  var res = docsListe_(session, rub ? rub.split('/')[0] : '');
  res.id = nouvelId;
  return res;
}
function docsSupprimer_(id) {
  var ss = classeur_(), x = lireDocs_(ss).filter(function (y) { return y.id === String(id || ''); })[0]; if (!x) throw erreurApp_('introuvable');
  jeterFichiers_(x.fichiers);
  ss.getSheetByName(ONGLETS.documents).deleteRow(x.ligne); CacheService.getScriptCache().remove('commun|docs');
  return { ok: true };
}
function jpegValide_(data) { // seules des images JPEG (signature FF D8 FF) de taille raisonnable sont acceptées
  var octets;
  try { octets = Utilities.base64Decode(String(data || '')); } catch (e) { throw erreurApp_('requete_invalide'); }
  if (octets.length < 1000 || octets.length > NL.maxOctetsPage || (octets[0] & 255) !== 0xFF || (octets[1] & 255) !== 0xD8 || (octets[2] & 255) !== 0xFF) throw erreurApp_('requete_invalide');
  return octets;
}
function docsPdfEnvoyer_(id, page, data) {
  var octets = jpegValide_(data), verrou = LockService.getScriptLock(); verrou.waitLock(20000);
  try {
    var ss = classeur_(), x = lireDocs_(ss).filter(function (y) { return y.id === String(id || ''); })[0], k = Number(page);
    if (!x) throw erreurApp_('introuvable');
    if (!x.pdf || !(k >= 0 && k < x.pdf.pages && Math.floor(k) === k)) throw erreurApp_('requete_invalide');
    var dossier = dossierPrive_(ss, 'Dossier des documents PDF (ID Drive)', 'Cap NCHUG – Documents PDF');
    if (x.fichiers[k]) jeterFichiers_([x.fichiers[k]]);
    x.fichiers[k] = dossier.createFile(Utilities.newBlob(octets, 'image/jpeg', x.id + '-page' + (k + 1) + '.jpg')).getId();
    ongletDocs_(ss).getRange(x.ligne, 12).setValue(JSON.stringify(x.fichiers));
    var complet = true; for (var j = 0; j < x.pdf.pages; j++) if (!x.fichiers[j]) complet = false;
    if (complet) CacheService.getScriptCache().remove('commun|docs');
    return { ok: true, page: k, complet: complet };
  } finally { verrou.releaseLock(); }
}
function docsPdfPage_(session, id, page) {
  id = String(id || '');
  if (id.indexOf('chu:') === 0) return avecCommun_(function () { return docsPdfPage_({ r: 'agent' }, id.slice(4), page); }) || { ok: false, erreur: 'introuvable' };
  var x = lireDocs_(classeur_()).filter(function (y) { return y.id === id; })[0], k = Number(page);
  var ref = session.r === 'admin' || session.r === 'referent';
  if (!x || !x.pdf || (!docVisible_(x) && !ref)) throw erreurApp_('introuvable');
  if (!(k >= 0 && k < x.pdf.pages && x.fichiers[k])) throw erreurApp_('requete_invalide');
  return { ok: true, page: k, type: 'image/jpeg', data: Utilities.base64Encode(DriveApp.getFileById(x.fichiers[k]).getBlob().getBytes()) };
}

/* ---------- Rubriques personnalisées (moteur 2.4.0) ----------
   Chaque service crée ses rubriques (tuile sur l'accueil) et leurs sous-rubriques ; les fiches sont dans « Documents et FAQ ».
   Annuaire : les rubriques des services sont recopiées dans « Rubriques – Catalogue » ; un autre service peut en « adopter »
   une : il suit la structure (nom, sous-rubriques) du service d'origine et y range ses propres fiches.
   Les rubriques du service caché « _chu » (créateurs) sont communes : visibles d'office partout, contenu tenu par les créateurs. */
var RUB = { onglet: 'Rubriques', entetes: ['ID', 'Nom', 'Emoji', 'Couleur', 'Sous-rubriques (JSON)', 'Ordre', 'Modifié le'],
  catalogue: 'Rubriques – Catalogue', catEntetes: ['ID', 'Service (ID)', 'Service', 'Nom', 'Emoji', 'Couleur', 'Sous-rubriques (JSON)', 'Statut', 'Utilisée par (ID des services)', 'Modifié le'],
  max: 6, maxSous: 12, couleurs: ['#223b80', '#40a8df', '#048e39', '#95c127'] };
function sousValides_(s) {
  return (Array.isArray(s) ? s : []).filter(function (x) { return x && /^SR[a-z0-9]{4,8}$/.test(String(x.id)) && x.nom; })
    .map(function (x) { return { id: String(x.id), nom: String(x.nom).slice(0, 40) }; });
}
function jsonSur_(t, defaut) { try { return JSON.parse(t); } catch (e) { return defaut; } }
function couleurRub_(c) { return RUB.couleurs.indexOf(String(c)) >= 0 ? String(c) : RUB.couleurs[0]; }
function lireRubriques_(ss) {
  var sh = ss.getSheetByName(RUB.onglet); if (!sh) return [];
  var v = sh.getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0] || '').trim(); if (!/^RUB[a-z0-9]{6,12}$/.test(id) || !v[i][1]) continue;
    l.push({ id: id, nom: String(v[i][1]).slice(0, 40), emoji: String(v[i][2] || '📁').slice(0, 8), couleur: couleurRub_(v[i][3]), sous: sousValides_(jsonSur_(v[i][4] || '[]', [])), ordre: Number(v[i][5]) || 0, ligne: i + 1 });
  }
  return l.sort(function (a, b) { return a.ordre - b.ordre; });
}
function rubPublique_(r, source) { return { id: r.id, nom: r.nom, emoji: r.emoji, couleur: r.couleur, sous: r.sous, source: source, chu: source === 'commune' }; }
function communRubriques_() { return communMemo_('rub', function () { return lireRubriques_(classeur_()).map(function (r) { delete r.ligne; return r; }); }); }
function adopteesIds_(params) { return String(params['Rubriques adoptées'] || '').split(/[,;\s]+/).filter(function (x) { return /^RUB[a-z0-9]{6,12}$/.test(x); }); }
function catalogueActif_() { return modeAnnuaire_() && !!CTX_SERVICE && CTX_SERVICE.id.charAt(0) !== '_'; }
function catalogueOnglet_() { var ss = annuaireClasseur_(); return ss.getSheetByName(RUB.catalogue) || creerOnglet_(ss, RUB.catalogue, RUB.catEntetes, []); }
function catalogueLire_() {
  if (!modeAnnuaire_()) return [];
  var c = CacheService.getScriptCache(), t = c.get('rubcat'); if (t) return JSON.parse(t);
  var v = catalogueOnglet_().getDataRange().getValues(), l = [];
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0] || '').trim(); if (!/^RUB[a-z0-9]{6,12}$/.test(id) || !v[i][3]) continue;
    l.push({ id: id, service: String(v[i][1] || ''), serviceNom: String(v[i][2] || ''), nom: String(v[i][3]).slice(0, 40), emoji: String(v[i][4] || '📁').slice(0, 8), couleur: couleurRub_(v[i][5]),
      sous: sousValides_(jsonSur_(v[i][6] || '[]', [])), statut: String(v[i][7] || 'active').trim() === 'retirée' ? 'retirée' : 'active',
      utilisateurs: String(v[i][8] || '').split(/[,;\s]+/).filter(Boolean), ligne: i + 1 });
  }
  try { c.put('rubcat', JSON.stringify(l), 300); } catch (e) { /* trop gros : pas de cache */ }
  return l;
}
function catalogueVider_() { CacheService.getScriptCache().remove('rubcat'); }
function catalogueAJour_(propres) { // le catalogue reflète-t-il les rubriques du service courant ?
  var sid = CTX_SERVICE.id, cat = catalogueLire_().filter(function (c) { return c.service === sid && c.statut === 'active'; });
  if (cat.length !== propres.length) return false;
  return propres.every(function (r) { var c = cat.filter(function (y) { return y.id === r.id; })[0];
    return c && c.nom === r.nom && c.emoji === r.emoji && c.couleur === r.couleur && c.serviceNom === CTX_SERVICE.nom && JSON.stringify(c.sous) === JSON.stringify(r.sous); });
}
function catalogueSynchroniser_(propres) { // à appeler sous verrou
  if (!catalogueActif_()) return;
  var sh = catalogueOnglet_(), v = sh.getDataRange().getValues(), sid = CTX_SERVICE.id, vus = {}, maintenant = new Date();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][1]) !== sid) continue;
    var id = String(v[i][0]), r = propres.filter(function (y) { return y.id === id; })[0];
    if (r) { vus[id] = 1; sh.getRange(i + 1, 3, 1, 6).setValues([[CTX_SERVICE.nom, r.nom, r.emoji, r.couleur, JSON.stringify(r.sous), 'active']]); sh.getRange(i + 1, 10).setValue(maintenant); }
    else if (!String(v[i][8] || '').trim()) sh.deleteRow(i + 1); // retirée et utilisée par aucun autre service
    else sh.getRange(i + 1, 8).setValue('retirée');               // les services qui l'utilisent gardent sa structure
  }
  propres.forEach(function (r) { if (!vus[r.id]) sh.appendRow([r.id, sid, CTX_SERVICE.nom, r.nom, r.emoji, r.couleur, JSON.stringify(r.sous), 'active', '', maintenant]); });
  catalogueVider_();
}
function catalogueUtilisateur_(id, sid, ajouter) { // à appeler sous verrou
  var sh = catalogueOnglet_(), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) !== id) continue;
    var l = String(v[i][8] || '').split(/[,;\s]+/).filter(function (x) { return x && x !== sid; });
    if (ajouter) l.push(sid);
    if (!l.length && String(v[i][7]).trim() === 'retirée') sh.deleteRow(i + 1); else sh.getRange(i + 1, 9).setValue(l.join(', '));
    break;
  }
  catalogueVider_();
}
function rubriquesService_(ss, params) { // ce que voit le service : communes, puis les siennes, puis celles adoptées
  var chuIci = !!(CTX_SERVICE && CTX_SERVICE.id === COMMUN.id), l = [];
  communRubriques_().forEach(function (r) { l.push(rubPublique_(r, 'commune')); });
  lireRubriques_(ss).forEach(function (r) { var o = rubPublique_(r, 'propre'); if (chuIci) o.chu = true; l.push(o); });
  var ids = catalogueActif_() ? adopteesIds_(params || lireParametres_(ss)) : [];
  if (ids.length) {
    var cat = catalogueLire_();
    ids.forEach(function (id) { var r = cat.filter(function (c) { return c.id === id; })[0]; if (r) { var o = rubPublique_(r, 'adoptee'); o.origine = r.serviceNom; l.push(o); } });
  }
  return l;
}
function rubriqueTrouver_(ss, id) { return rubriquesService_(ss).filter(function (r) { return r.id === String(id || ''); })[0] || null; }
function rubEtat_() {
  var ss = classeur_(), p = lireParametres_(ss), propres = lireRubriques_(ss), annuaire = catalogueActif_(), sid = CTX_SERVICE ? CTX_SERVICE.id : '';
  if (annuaire && !catalogueAJour_(propres)) { // ex. : service rattaché, ou nom du service changé
    var verrou = LockService.getScriptLock(); verrou.waitLock(20000);
    try { catalogueSynchroniser_(propres); } finally { verrou.releaseLock(); }
  }
  var cat = annuaire ? catalogueLire_() : [], ids = annuaire ? adopteesIds_(p) : [];
  function pub(c) { return { id: c.id, nom: c.nom, emoji: c.emoji, couleur: c.couleur, sous: c.sous, origine: c.serviceNom, utilisateurs: c.utilisateurs.length, retiree: c.statut === 'retirée' }; }
  return { ok: true, annuaire: annuaire, commune: !!(CTX_SERVICE && CTX_SERVICE.id === COMMUN.id), max: RUB.max, maxSous: RUB.maxSous, couleurs: RUB.couleurs,
    propres: propres.map(function (r) { var c = cat.filter(function (y) { return y.id === r.id; })[0]; return { id: r.id, nom: r.nom, emoji: r.emoji, couleur: r.couleur, sous: r.sous, utilisateurs: c ? c.utilisateurs.length : 0 }; }),
    adoptees: ids.map(function (id) { var c = cat.filter(function (y) { return y.id === id; })[0]; return c ? pub(c) : null; }).filter(Boolean),
    catalogue: cat.filter(function (c) { return c.service !== sid && c.statut === 'active' && ids.indexOf(c.id) < 0; }).map(pub) };
}
function rubGerer_(session, quoi, id, d) {
  var ss = classeur_(), commune = !!(CTX_SERVICE && CTX_SERVICE.id === COMMUN.id), sid = CTX_SERVICE ? CTX_SERVICE.id : '';
  id = String(id || '');
  var verrou = LockService.getScriptLock(); verrou.waitLock(20000);
  try {
    var propres = lireRubriques_(ss), p = lireParametres_(ss), adoptees = catalogueActif_() ? adopteesIds_(p) : [];
    var total = propres.length + adoptees.length;
    if (quoi === 'enregistrer') {
      d = d || {};
      var nom = nettoyerTexte_(d.nom, 40), emoji = nettoyerTexte_(d.emoji, 8) || '📁';
      if (nom.length < 2) throw erreurApp_('requete_invalide');
      var x = id ? propres.filter(function (y) { return y.id === id; })[0] : null;
      if (id && !x) throw erreurApp_('rubrique_introuvable');
      if (!x && total >= RUB.max) throw erreurApp_('rubriques_max');
      var anciens = x ? x.sous : [], sous = [], vus = {};
      (Array.isArray(d.sous) ? d.sous : []).forEach(function (s) {
        var n = nettoyerTexte_(s && s.nom, 40); if (!n) return;
        var garde = s && s.id && !vus[s.id] && anciens.some(function (a) { return a.id === s.id; });
        var sr = garde ? String(s.id) : 'SR' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toLowerCase();
        vus[sr] = 1; sous.push({ id: sr, nom: n });
      });
      if (sous.length > RUB.maxSous) throw erreurApp_('sous_rubriques_max');
      var sh = ss.getSheetByName(RUB.onglet) || creerOnglet_(ss, RUB.onglet, RUB.entetes, []);
      var ordre = x ? x.ordre : propres.reduce(function (m, y) { return Math.max(m, y.ordre); }, 0) + 1;
      var ligne = [x ? x.id : 'RUB' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toLowerCase(), nom, emoji, couleurRub_(d.couleur), JSON.stringify(sous), ordre, new Date()];
      if (x) sh.getRange(x.ligne, 1, 1, ligne.length).setValues([ligne]); else sh.appendRow(ligne);
    } else if (quoi === 'supprimer') { // la rubrique et ses fiches (PDF compris) ; ailleurs, les services qui l'utilisent gardent sa structure
      var z = propres.filter(function (y) { return y.id === id; })[0]; if (!z) throw erreurApp_('rubrique_introuvable');
      var fiches = lireDocs_(ss).filter(function (dd) { return dd.rubrique.split('/')[0] === z.id; }).sort(function (a, b) { return b.ligne - a.ligne; });
      fiches.forEach(function (dd) { jeterFichiers_(dd.fichiers); ss.getSheetByName(ONGLETS.documents).deleteRow(dd.ligne); });
      ss.getSheetByName(RUB.onglet).deleteRow(z.ligne);
      if (fiches.length) CacheService.getScriptCache().remove('commun|docs');
    } else if (quoi === 'adopter' || quoi === 'quitter') { // les fiches d'une rubrique quittée restent dans le Google Sheets : elles reviennent si on la reprend
      if (!catalogueActif_()) throw erreurApp_('requete_invalide');
      if (quoi === 'adopter') {
        if (adoptees.indexOf(id) >= 0) throw erreurApp_('deja_adoptee');
        var c = catalogueLire_().filter(function (y) { return y.id === id && y.statut === 'active' && y.service !== sid; })[0];
        if (!c) throw erreurApp_('rubrique_introuvable');
        if (total >= RUB.max) throw erreurApp_('rubriques_max');
        adoptees.push(id);
      } else adoptees = adoptees.filter(function (y) { return y !== id; });
      ecrireParametre_(ss, 'Rubriques adoptées', adoptees.join(', '), 'Rubriques d\'autres services affichées ici : structure du service d\'origine, fiches de ce service.');
      catalogueUtilisateur_(id, sid, quoi === 'adopter');
    } else throw erreurApp_('requete_invalide');
    if (quoi === 'enregistrer' || quoi === 'supprimer') { catalogueSynchroniser_(lireRubriques_(ss)); if (commune) CacheService.getScriptCache().remove('commun|rub'); }
  } finally { verrou.releaseLock(); }
  return rubEtat_(); // hors verrou : rubEtat_ peut le reprendre
}

/* ---------- Tableau de bord des créateurs (aucune donnée individuelle) ---------- */
function tableauBord_(session) {
  var c = CacheService.getScriptCache(), t = c.get('annuaire|tableau'); if (t) return JSON.parse(t);
  var tout = PropertiesService.getScriptProperties().getProperties(), mode = defiModeActuel_(), lu = lundi_(aujourdhuiDefi_()), lignes = [];
  lireServices_().forEach(function (sv) {
    if (sv.id.charAt(0) === '_') return;
    var x = { nom: sv.nom, actif: sv.actif, cree: sv.cree, plan: null, rubriques: null, referents: 0, defi: null };
    try { x.referents = JSON.parse(tout['s:' + sv.id + ':REFERENTS'] || '[]').filter(function (r) { return r.actif; }).length; } catch (e) { /* ignoré */ }
    var d = String(tout['DEFI_S|' + lu + '|' + mode + '|' + sv.id] || '').split(',');
    if (d[0]) x.defi = { reponses: Number(d[0]), pourcent: Number(d[0]) ? Math.round(1000 * Number(d[1]) / Number(d[0])) / 10 : 0 };
    if (sv.actif && sv.ss) try {
      var p = lireParametres_(SpreadsheetApp.openById(sv.ss));
      x.plan = !!String(p['Fichier du plan (ID Drive)'] || '').trim();
      x.rubriques = String(p['Rubriques actives'] || '').trim() || 'toutes';
    } catch (e) { x.plan = null; }
    lignes.push(x);
  });
  var r = { ok: true, services: lignes, mode: mode, seuil: DEFI.seuil, calcule: new Date().toISOString() };
  try { c.put('annuaire|tableau', JSON.stringify(r), 600); } catch (e) { /* ignoré */ }
  return r;
}


// ============================================================================
// Lot 2 : personnalisation du service (dans l'appli, par son administrateur) et import du plan avec contrôle
// ============================================================================
var RUBRIQUES = ['plan', 'visites', 'newsletter', 'souvenirs', 'jeux', 'docs'];
function rubriquesActives_(params) { // null = toutes
  var t = String(params['Rubriques actives'] || '').trim(); if (!t) return null;
  return t.split(/[,;\s]+/).filter(function (x) { return RUBRIQUES.indexOf(x) >= 0; });
}
function ecrireParametre_(ss, nom, valeur, aide) {
  var sh = ss.getSheetByName(ONGLETS.parametres), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === nom) { sh.getRange(i + 1, 2).setValue(valeur); return; }
  sh.appendRow([nom, valeur, aide || '']);
}
function serviceReglages_(d) {
  var ss = classeur_(), p = lireParametres_(ss);
  if (d && typeof d === 'object') {
    if (d.nom != null) { var nom = nettoyerTexte_(d.nom, 60); if (nom.length < 2) throw erreurApp_('requete_invalide'); ecrireParametre_(ss, 'Nom du service', nom);
      if (CTX_SERVICE && CTX_SERVICE.id.charAt(0) !== '_') { var sv = lireServices_().filter(function (x) { return x.id === CTX_SERVICE.id; })[0]; if (sv) { annuaireClasseur_().getSheetByName(ANNUAIRE.onglet).getRange(sv.ligne, 2).setValue(nom); viderCacheServices_(); } } }
    if (d.message != null) ecrireParametre_(ss, "Message d'accueil", nettoyerTexte_(d.message, 300));
    if (d.dateJ != null) { if (d.dateJ && !/^\d{4}-\d{2}-\d{2}$/.test(d.dateJ)) throw erreurApp_('requete_invalide'); ecrireParametre_(ss, 'Date J', d.dateJ ? new Date(+d.dateJ.slice(0, 4), +d.dateJ.slice(5, 7) - 1, +d.dateJ.slice(8, 10), 12) : ''); }
    if (d.rubriques != null) {
      var r = (Array.isArray(d.rubriques) ? d.rubriques : []).filter(function (x) { return RUBRIQUES.indexOf(x) >= 0; });
      ecrireParametre_(ss, 'Rubriques actives', r.length === RUBRIQUES.length ? '' : r.join(', '), 'Rubriques affichées sur l\'accueil (vide = toutes) : ' + RUBRIQUES.join(', '));
    }
    if (d.logo === null) { ecrireParametre_(ss, 'Logo du service (ID Drive)', ''); props_().setProperty('LOGO_VERSION', String(Date.now())); cache_().remove('logo'); }
    if (d.visiteVirtuelle != null) ecrireParametre_(ss, 'Visite virtuelle (activée)', d.visiteVirtuelle === true,
      'VRAI pour afficher la tuile « Visite virtuelle » dans Plan du service (réglable aussi dans Personnaliser le service).');
    p = lireParametres_(ss);
  }
  var dj = p['Date J'];
  return { ok: true, reglages: { nom: String(p['Nom du service'] || ''), message: String(p["Message d'accueil"] || ''), dateJ: dj instanceof Date && !isNaN(dj) ? formaterDate_(dj) : '',
    rubriques: rubriquesActives_(p) || RUBRIQUES.slice(), logo: !!p['Logo du service (ID Drive)'], plan: !!String(p['Fichier du plan (ID Drive)'] || '').trim(),
    visiteVirtuelle: parametreVrai_(p['Visite virtuelle (activée)']) }, toutes: RUBRIQUES };
}
function dossierService_(ss) { var parents = DriveApp.getFileById(ss.getId()).getParents(); return parents.hasNext() ? parents.next() : DriveApp.getRootFolder(); }
function logoEnvoyer_(data, type) {
  if (type !== 'image/png' && type !== 'image/jpeg') throw erreurApp_('requete_invalide');
  var octets; try { octets = Utilities.base64Decode(String(data || '')); } catch (e) { throw erreurApp_('requete_invalide'); }
  if (!octets.length || octets.length > 200 * 1024) throw erreurApp_('image_trop_lourde');
  var png = (octets[0] & 255) === 0x89 && (octets[1] & 255) === 0x50, jpg = (octets[0] & 255) === 0xff && (octets[1] & 255) === 0xd8;
  if (!(png || jpg)) throw erreurApp_('requete_invalide');
  var ss = classeur_(), ancien = String(lireParametres_(ss)['Logo du service (ID Drive)'] || '').trim();
  var f = dossierService_(ss).createFile(Utilities.newBlob(octets, png ? 'image/png' : 'image/jpeg', 'logo-service.' + (png ? 'png' : 'jpg')));
  ecrireParametre_(ss, 'Logo du service (ID Drive)', f.getId(), 'Envoyé depuis l\'appli (Personnaliser le service).');
  if (ancien) try { DriveApp.getFileById(ancien).setTrashed(true); } catch (e) { /* ignoré */ }
  props_().setProperty('LOGO_VERSION', String(Date.now())); cache_().remove('logo');
  return { ok: true, version: props_().getProperty('LOGO_VERSION') };
}
function logoLire_() {
  var c = cache_(), t = c.get('logo'); if (t) return JSON.parse(t);
  var id = String(lireParametres_(classeur_())['Logo du service (ID Drive)'] || '').trim(); if (!id) return { ok: true, data: null };
  var b; try { b = DriveApp.getFileById(id).getBlob(); } catch (e) { return { ok: true, data: null }; }
  var r = { ok: true, type: b.getContentType(), data: Utilities.base64Encode(b.getBytes()), version: String(props_().getProperty('LOGO_VERSION') || '1') };
  try { c.put('logo', JSON.stringify(r), 21600); } catch (e) { /* trop gros */ }
  return r;
}

/* ---------- Import du plan : contrôle avant enregistrement ---------- */
var PLAN_TYPES = { piece: 1, chambre: 1, couloir: 1, terrasse: 1, usic: 1, usinv: 1, circulation: 1, technique: 1 };
function validerPlan_(D) {
  var err = [], av = [], st = { pieces: 0, chambres: 0, nommees: 0, unites: 0 };
  function nb(x) { return typeof x === 'number' && isFinite(x); }
  if (!D || typeof D !== 'object' || Array.isArray(D)) return { erreurs: ['Le fichier ne contient pas un plan (objet JSON attendu).'], avertissements: [], stats: st };
  var vb = D.viewBox;
  if (!Array.isArray(vb) || vb.length !== 4 || !vb.every(nb) || vb[2] <= 0 || vb[3] <= 0) err.push('« viewBox » manquant ou incorrect : 4 nombres [x, y, largeur, hauteur] attendus.');
  if (!Array.isArray(D.pieces) || !D.pieces.length) { err.push('Aucune pièce (« pieces ») dans le fichier.'); return { erreurs: err, avertissements: av, stats: st }; }
  if (D.pieces.length > 6000) err.push('Trop de pièces (' + D.pieces.length + ', 6000 au plus).');
  var unites = D.unites && typeof D.unites === 'object' ? D.unites : {}, ids = {}, chambres = {}, boites = [];
  Object.keys(unites).forEach(function (k) { var u = unites[k]; st.unites++;
    if (!u || !String(u.nom || '').trim()) err.push('Unité « ' + k + ' » sans nom.');
    var c = u && (u.couleur || u.trait); if (c && !/^#[0-9a-fA-F]{6}$/.test(c)) err.push('Unité « ' + k + ' » : couleur « ' + c + ' » incorrecte (format #RRGGBB).'); });
  var horsCadre = 0, sansGeo = [], typesInconnus = {}, sansNumero = 0;
  D.pieces.forEach(function (p, i) {
    var nom = 'Pièce n° ' + (i + 1) + (p && p.id ? ' (' + p.id + ')' : '');
    if (!p || typeof p !== 'object') { err.push(nom + ' : illisible.'); return; }
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(p.id || ''))) { err.push(nom + ' : identifiant « id » manquant ou incorrect (lettres, chiffres, - et _).'); return; }
    if (ids[p.id]) { err.push('Identifiant en double : ' + p.id + '.'); return; } ids[p.id] = 1;
    var t = String(p.type || 'piece'); if (!PLAN_TYPES[t]) typesInconnus[t] = 1;
    var b = null;
    if (Array.isArray(p.r)) { if (p.r.length === 4 && p.r.every(nb) && p.r[2] > p.r[0] && p.r[3] > p.r[1]) b = p.r; else { err.push(nom + ' : rectangle « r » incorrect ([x0, y0, x1, y1] avec x1 > x0 et y1 > y0).'); return; } }
    else if (typeof p.d === 'string') {
      if (!/^[MLHVZmlhvz0-9.,\s-]+$/.test(p.d) || !/^\s*M/i.test(p.d)) { err.push(nom + ' : contour « d » incorrect (commandes M, L, H, V, Z uniquement).'); return; }
      var n = (p.d.match(/-?\d+(\.\d+)?/g) || []).map(Number); if (n.length < 6) { err.push(nom + ' : contour trop court (au moins 3 points).'); return; }
      if (!/[HVhv]/.test(p.d)) { var xs = [], ys = []; for (var k = 0; k + 1 < n.length; k += 2) { xs.push(n[k]); ys.push(n[k + 1]); } b = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]; }
      if (!/[Zz]\s*$/.test(p.d)) av.push(nom + ' : contour non fermé (pas de « Z » final) : vérifiez la forme.');
    } else { sansGeo.push(p.id); return; }
    st.pieces++;
    if (t === 'chambre') { st.chambres++; if (p.chambre == null || p.chambre === '') sansNumero++; else { var c = String(p.chambre); if (chambres[c]) av.push('Chambre ' + c + ' en double (' + chambres[c] + ' et ' + p.id + ').'); chambres[c] = p.id; } }
    if (p.nom) st.nommees++;
    if (p.unite != null && p.unite !== '' && !unites[p.unite]) err.push(nom + ' : unité « ' + p.unite + ' » inconnue (absente de « unites »).');
    if (b) { if (Array.isArray(vb) && vb.length === 4 && (b[0] < vb[0] - 1 || b[1] < vb[1] - 1 || b[2] > vb[0] + vb[2] + 1 || b[3] > vb[1] + vb[3] + 1)) horsCadre++; boites.push({ id: p.id, b: b }); }
  });
  if (sansGeo.length) err.push(sansGeo.length + ' pièce(s) sans forme (« r » ou « d ») : ' + sansGeo.slice(0, 8).join(', ') + (sansGeo.length > 8 ? '…' : '') + '.');
  if (horsCadre) av.push(horsCadre + ' pièce(s) dépassent du cadre « viewBox » : elles risquent d\'être coupées.');
  if (Object.keys(typesInconnus).length) av.push('Types de pièce inconnus, affichés comme des pièces : ' + Object.keys(typesInconnus).join(', ') + '.');
  if (sansNumero) av.push(sansNumero + ' chambre(s) sans numéro.');
  // Chevauchements (rectangles englobants qui se recouvrent nettement)
  if (boites.length <= 2500) {
    var chev = [], tri = boites.slice().sort(function (a, b) { return a.b[0] - b.b[0]; });
    for (var i = 0; i < tri.length && chev.length < 20; i++) for (var j = i + 1; j < tri.length && tri[j].b[0] < tri[i].b[2]; j++) {
      var A = tri[i].b, B = tri[j].b, w = Math.min(A[2], B[2]) - Math.max(A[0], B[0]), hh = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
      if (w > 0 && hh > 0) { var s1 = (A[2] - A[0]) * (A[3] - A[1]), s2 = (B[2] - B[0]) * (B[3] - B[1]); if (w * hh > 0.3 * Math.min(s1, s2)) chev.push(tri[i].id + ' / ' + tri[j].id); }
    }
    if (chev.length) av.push('Pièces qui se chevauchent : ' + chev.slice(0, 10).join(', ') + (chev.length > 10 ? '…' : '') + '.');
  }
  var aNommer = st.pieces - st.nommees - st.chambres; if (aNommer > 0) av.push(aNommer + ' pièce(s) sans nom : elles pourront être nommées dans l\'appli (rubrique Plan).');
  if (!st.unites) av.push('Aucune unité : les jeux de couleurs seront masqués, les autres jeux du plan restent disponibles.');
  return { erreurs: err.slice(0, 40), avertissements: av.slice(0, 40), stats: st };
}
function planImporter_(session, texte, enregistrer) {
  texte = String(texte || ''); if (!texte || texte.length > 20 * 1024 * 1024) throw erreurApp_('requete_invalide');
  var D; try { D = JSON.parse(texte); } catch (e) { return { ok: true, rapport: { erreurs: ['Fichier illisible : ce n\'est pas du JSON valide.'], avertissements: [], stats: {} }, enregistre: false }; }
  var rapport = validerPlan_(D);
  if (!enregistrer || rapport.erreurs.length) return { ok: true, rapport: rapport, enregistre: false };
  var ss = classeur_(), ancien = String(lireParametres_(ss)['Fichier du plan (ID Drive)'] || '').trim();
  var f = dossierService_(ss).createFile(Utilities.newBlob(texte, 'application/json', 'plan-donnees.json'));
  ecrireParametre_(ss, 'Fichier du plan (ID Drive)', f.getId());
  if (ancien) try { DriveApp.getFileById(ancien).setName('plan-donnees (remplacé le ' + formaterDate_(new Date()) + ').json'); } catch (e) { /* ignoré */ }
  viderCachePlan_();
  try { synchroniserPlan_(ss); } catch (e) { console.error('synchronisation : ' + e); } // les modifications déjà faites suivent les pièces
  return { ok: true, rapport: rapport, enregistre: true, par: session.n || 'Administrateur' };
}
