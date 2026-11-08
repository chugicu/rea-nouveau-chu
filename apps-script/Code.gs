/**
 * Déménagement Réanimation – CHU de la Guadeloupe
 * Moteur de l'application (Google Apps Script, lié au Google Sheets "Base").
 *
 * Étape 1 : installation, connexion par codes, accueil.
 * Étape 2 : plan du service (lecture du plan depuis le Drive, désignation des pièces par les référents).
 * Étape 3 : visites des locaux (créneaux, inscriptions prénom + initiale + fonction, présence, purge à J+30).
 * 1.3 : modification de la forme du plan (déplacer, redimensionner, supprimer, ajouter une pièce).
 * 1.7 : jeux (jauge du déménagement, souvenirs, concours photo, nuage, QR codes, paris, escape game, bingo), activables par l'administrateur.
 * 1.6 : quiz (questions rédigées, brouillons relus par l'administrateur, compteur collectif anonyme).
 * 1.5 : sections WC, Pharmacie, DM, Biomed, Secrétariats, Entretiens ; équipements placés sur le plan (chariots d'urgence, échographes, imprimantes).
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
  version: '1.7.0',
  dureeJetonJours: { agent: 30, referent: 14, admin: 1 },
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
  jeux: 'Jeux', souvenirs: 'Souvenirs', nuage: 'Nuage', qr: 'QR codes', paris: 'Paris', pronostics: 'Pronostics', retours: 'Retours'
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
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, erreur: 'requete_invalide' });
  }
  try {
    var action = String(req.action || '');
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
      escape_valider: function () { return escapeValider_(exigerReferent_(verifierJeton_(req.jeton)), req.scenario, req.valide, req.remarque); },
      quiz_liste: function () { return quizListe_(verifierJeton_(req.jeton)); },
      quiz_question: function () { return quizQuestion_(exigerReferent_(verifierJeton_(req.jeton)), req.id, req.donnees); },
      quiz_statut: function () { return quizStatut_(exigerReferent_(verifierJeton_(req.jeton)), req.ids, req.statut); },
      quiz_compteur: function () { verifierJeton_(req.jeton); return quizAjouterTotal_(req.n); },
      plan_point: function () { return planPoint_(exigerReferent_(verifierJeton_(req.jeton)), req.id, req.donnees); },
      plan_categorie: function () { return planCategorie_(exigerReferent_(verifierJeton_(req.jeton)), req.categorie, req.donnees); },
      visites: function () { return visites_(verifierJeton_(req.jeton)); },
      visite_inscrire: function () { return visiteInscrire_(verifierJeton_(req.jeton), req.creneau, req.donnees); },
      visite_statut: function () { verifierJeton_(req.jeton); return visiteStatut_(req.reservations); },
      visite_annuler: function () { verifierJeton_(req.jeton); return visiteAnnuler_(req.id, req.code); },
      visite_creneau: function () { return visiteCreneau_(exigerReferent_(verifierJeton_(req.jeton)), req.donnees); },
      visite_presence: function () { exigerReferent_(verifierJeton_(req.jeton)); return visitePresence_(req.id, req.present); },
      nl_liste: function () { return nlListe_(verifierJeton_(req.jeton)); },
      nl_page: function () { return nlPage_(verifierJeton_(req.jeton), req.id, req.page); },
      nl_ajouter: function () { return nlAjouter_(exigerAdmin_(verifierJeton_(req.jeton)), req.donnees); },
      nl_envoyer_page: function () { exigerAdmin_(verifierJeton_(req.jeton)); return nlEnvoyerPage_(req.id, req.page, req.data); },
      nl_publier: function () { exigerAdmin_(verifierJeton_(req.jeton)); return nlPublier_(req.id); },
      nl_retirer: function () { exigerAdmin_(verifierJeton_(req.jeton)); return nlRetirer_(req.id); }
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

  var cache = CacheService.getScriptCache();
  if (cache.get('blocage')) throw erreurApp_('trop_de_tentatives');

  var props = PropertiesService.getScriptProperties();
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
    jeton: signerJeton_({ r: role, n: libelle, v: versionJetons_(), exp: exp }),
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
    dateJ: dateJIso,
    actualites: lireActualites_(ss),
    newsletter: derniereNewsletter_(ss),
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
  return { ok: true, donnees: geometriePlan_(), reglages: reglagesPlan_(), peutModifier: session.r !== 'agent' };
}

function geometriePlan_() {
  var cache = CacheService.getScriptCache();
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
    var valeurs = [[id, nom, precision, categorie, icone || '', couleur, new Date(), session.n || 'Administrateur', forme, supprimee, ajout]];
    if (ligne > 0) sh.getRange(ligne, 1, 1, 11).setValues(valeurs); else sh.appendRow(valeurs[0]);
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

/** À lancer après avoir remplacé le fichier du plan dans le Drive. */
function viderCachePlan() {
  var cache = CacheService.getScriptCache(), n = Number(cache.get('plan_n') || 0);
  cache.removeAll(['plan_n'].concat(Array.apply(null, Array(n)).map(function (_, i) { return 'plan_' + i; })));
  alerte_('Le plan sera relu depuis le Drive au prochain affichage.');
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
function purgerVisites() {
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
function dossierNewsletters_(ss) {
  var nom = 'Dossier des newsletters (ID Drive)', params = lireParametres_(ss), id = String(params[nom] || '').trim();
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* dossier supprimé : on en recrée un */ } }
  var parents = DriveApp.getFileById(ss.getId()).getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var dossier = parent.createFolder('Réa – Newsletters');
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
function quizCompteur_() { return Number(PropertiesService.getScriptProperties().getProperty('quiz_total') || 0); }
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
    var props = PropertiesService.getScriptProperties(), t = Number(props.getProperty('quiz_total') || 0) + n;
    props.setProperty('quiz_total', String(t));
    return { ok: true, total: t };
  } finally { verrou.releaseLock(); }
}
function installerBanqueQuiz_(ss) { // seulement si l'onglet est vide
  var sh = ss.getSheetByName(ONGLETS.quiz);
  if (!sh || sh.getLastRow() > 1) return 0;
  var maintenant = new Date(), lignes = QUIZ_BANQUE.map(function (b, i) {
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
    { texte: 'Je connais les couleurs des unités' }, { texte: 'J\'ai pris une photo souvenir de l\'ancien service' }, { texte: 'J\'ai repéré la salle de détente' },
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
  var pts = quizCompteur_() + Number(PropertiesService.getScriptProperties().getProperty('jeux_points') || 0);
  var obj = Number(c.reglages.objectif) || 4000;
  return { points: pts, objectif: obj, pourcent: Math.min(100, Math.floor(100 * pts / obj)), paliers: c.reglages.paliers || [] };
}
function ajouterPointsJeux_(n, dejaVerrouille) { // dejaVerrouille : appelé alors que le verrou du script est déjà pris
  if (!(n > 0)) return;
  function ajouter() { var p = PropertiesService.getScriptProperties(); p.setProperty('jeux_points', String(Number(p.getProperty('jeux_points') || 0) + n)); }
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
  if (!jeton || typeof jeton !== 'string' || jeton.indexOf('.') < 0) throw erreurApp_('session_absente');
  var parts = jeton.split('.');
  var attendu = b64url_(Utilities.computeHmacSha256Signature(parts[0], secret_()));
  if (!egaliteConstante_(attendu, parts[1])) throw erreurApp_('session_invalide');
  var corps = parts[0] + '==='.slice((parts[0].length + 3) % 4);
  var charge = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(corps)).getDataAsString());
  if (charge.v !== versionJetons_()) throw erreurApp_('session_expiree');
  if (!charge.exp || Date.now() > charge.exp) throw erreurApp_('session_expiree');
  if (charge.r === 'referent' && !referentActif_(charge.n)) throw erreurApp_('session_expiree');
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
  var sel = PropertiesService.getScriptProperties().getProperty('SEL');
  var octets = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sel + '|' + code, Utilities.Charset.UTF_8);
  return b64url_(octets);
}

function lireReferents_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('REFERENTS') || '[]');
}

function ecrireReferents_(liste) {
  PropertiesService.getScriptProperties().setProperty('REFERENTS', JSON.stringify(liste));
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
  var p = PropertiesService.getScriptProperties();
  if (empr === p.getProperty('CODE_ADMIN') || empr === p.getProperty('CODE_SERVICE')) return true;
  return lireReferents_().some(function (r) { return r.empreinte === empr; });
}

function versionJetons_() {
  return Number(PropertiesService.getScriptProperties().getProperty('VERSION_JETONS') || 1);
}

// ============================================================================
// Menu d'administration dans le Google Sheets
// ============================================================================
function onOpen() {
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
    .addToUi();
}

/** Crée les onglets, le sel et le secret. Sans danger si relancé : rien n'est effacé. */
function installer() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SEL')) props.setProperty('SEL', Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty('VERSION_JETONS')) props.setProperty('VERSION_JETONS', '1');

  var ss = classeur_();
  creerOnglet_(ss, ONGLETS.parametres, ['Paramètre', 'Valeur', 'Aide'], [
    ['Date J', '', 'Date du 1er jour de transfert (format date). Laisser vide tant qu\'elle n\'est pas fixée.'],
    ['Nom du service', 'Réanimation – USC', 'Affiché sur l\'accueil.'],
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
  installerBanqueQuiz_(ss);
  ajouterParametre_(ss, 'Objectif quiz équipe', 'Nombre total de réponses visé par l\'équipe (compteur anonyme). Par défaut : 3000.');
  creerOnglet_(ss, ONGLETS.creneaux, ['ID', 'Date', 'Heure', 'Durée (min)', 'Lieu de rendez-vous', 'Guide', 'Places', 'Statut', 'Créé par', 'Modifié le'], []);
  creerOnglet_(ss, ONGLETS.newsletters, NL.entetes, []);
  ajouterParametre_(ss, 'Dossier des newsletters (ID Drive)', 'Créé automatiquement au premier envoi. Dossier privé : ne pas le partager.');
  creerOnglet_(ss, ONGLETS.inscriptions, ['ID', 'ID créneau', 'Prénom', 'Initiale', 'Fonction', 'Code (chiffré)', 'Inscrit le', 'Présent'], []);
  ss.getSheetByName(ONGLETS.inscriptions).getRange('H2:H1000').insertCheckboxes();
  ss.getSheetByName(ONGLETS.creneaux).getRange('B2:B1000').setNumberFormat('@'); // dates gardées en texte AAAA-MM-JJ
  ss.getSheetByName(ONGLETS.creneaux).getRange('C2:C1000').setNumberFormat('@');
  installerPurgeQuotidienne_();

  // Mise en forme utile
  var act = ss.getSheetByName(ONGLETS.actualites);
  act.getRange('D2:E200').insertCheckboxes();
  act.getRange('A2:A200').setNumberFormat('dd/mm/yyyy');
  ss.getSheetByName(ONGLETS.parametres).getRange('B2').setNumberFormat('dd/mm/yyyy');
  ss.getSheetByName(ONGLETS.prets).protect().setDescription('Rempli automatiquement par l\'application').setWarningOnly(true);
  ss.getSheetByName(ONGLETS.referents).protect().setDescription('Géré par le menu Réa – Administration').setWarningOnly(true);

  var feuilleDefaut = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (feuilleDefaut && ss.getSheets().length > 1) ss.deleteSheet(feuilleDefaut);

  if (!props.getProperty('CODE_SERVICE') || !props.getProperty('CODE_ADMIN')) {
    alerte_('Installation terminée.\n\nÉtape suivante : définissez le code SERVICE puis le code ADMINISTRATEUR (menu Réa – Administration).');
  } else {
    alerte_('Base vérifiée : tout est en place.');
  }
}

function menuCodeService() {
  var code = demanderCode_('Code SERVICE', 'Code commun à tout le service (au moins ' + APP.longueurMinCode + ' lettres/chiffres).\nLes agents déjà connectés le restent.');
  if (!code) return;
  PropertiesService.getScriptProperties().setProperty('CODE_SERVICE', empreinte_(code));
  alerte_('Code SERVICE enregistré.\nNotez-le : il n\'est conservé que sous forme chiffrée et ne pourra pas être relu.');
}

function menuCodeAdmin() {
  var code = demanderCode_('Code ADMINISTRATEUR', 'Code personnel, à ne jamais partager (au moins ' + APP.longueurMinCode + ' lettres/chiffres).');
  if (!code) return;
  PropertiesService.getScriptProperties().setProperty('CODE_ADMIN', empreinte_(code));
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
  var p = PropertiesService.getScriptProperties();
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
// Utilitaires
// ============================================================================
function classeur_() {
  var id = PropertiesService.getScriptProperties().getProperty('CLASSEUR_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Ouvrez ce script depuis le Google Sheets « Base » (Extensions > Apps Script).');
  PropertiesService.getScriptProperties().setProperty('CLASSEUR_ID', ss.getId());
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
  var s = PropertiesService.getScriptProperties().getProperty('SECRET');
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
