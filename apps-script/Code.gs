/**
 * Déménagement Réanimation – CHU de la Guadeloupe
 * Moteur de l'application (Google Apps Script, lié au Google Sheets "Base").
 *
 * Étape 1 : installation, connexion par codes, accueil.
 * Étape 2 : plan du service (lecture du plan depuis le Drive, désignation des pièces par les référents).
 * Étape 3 : visites des locaux (créneaux, inscriptions prénom + initiale + fonction, présence, purge à J+30).
 * 1.3 : modification de la forme du plan (déplacer, redimensionner, supprimer, ajouter une pièce).
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
  version: '1.5.0',
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
  points: 'Équipements'
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
