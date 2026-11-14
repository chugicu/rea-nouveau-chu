# Note de reprise — Cap NCHUG / appli réa (à lire en début de conversation)

Dépôt public : aucun code d'accès, aucun plan réel, aucune banque de questions ici.

## Le projet
PWA française gratuite pour le CHU de la Guadeloupe (GitHub Pages `/docs`) + moteur Apps Script (`apps-script/Code.gs`, v2.5.0) + Google Sheets/Drive. Compte : chugicu@gmail.com.
- **Appli réa** (réanimation – USC) : moteur propre, adresse dans `docs/js/config.js` (`SERVICES_EXTERNES`).
- **Cap NCHUG** : annuaire commun à tous les services (`CAP_URL` dans `config.js`), un moteur en `MODE='annuaire'`.
- Service worker : `VERSION` dans `docs/sw.js` (à augmenter à chaque mise en ligne ; actuellement `rea-app-v2.7.0`).
- Procédures : `GUIDE_DEPLOIEMENT.md` (P install Cap NCHUG, Q Défi, R rattachement de la réa, S lots 4/5/2, T plan et deux plans, U PDF des documents et rubriques personnalisées, V visite virtuelle 360°).

## Règles à ne jamais enfreindre
- Pas de données de santé dans l'appli ; pas de suivi individuel ; pas de compte Google pour les agents ; pas d'e-mails.
- Codes jamais stockés en clair ; données de visite purgées à J+30.
- Le vrai plan (`plan-donnees.json`), les synoptiques et la banque de questions du Défi ne vont **jamais** sur GitHub.
- Logo CHU non modifié (charte, ≥ 50 px, sur fond blanc). Couleurs : `#223b80`, `#40a8df`, `#048e39`, `#95c127`.
- Questions : jamais de piège ni d'inversion entre N° d'entrée et code de bâtiment (« l'entrée N° 17 dessert le B32 », « niveau 2 du B32 (entrée N° 17) »).
- Défi CHU : seulement les lits couverts en personnel (pas de lits gelés ni de totaux par bâtiment) ; dessins uniquement, pas de photos de vidéos ni de personnes.
- Ne pas générer de nouvelle appli ou fonction sans l'accord de l'utilisateur ; demander avant toute action sur son ordinateur.
- Nommage : B-codes = bâtiments, « rue Caraïbes N° » = entrées ; niveaux -1 à 4, 0 = niveau rue Caraïbes.

## État (9 novembre 2026)
- En ligne : plan interactif, visites, quiz et jeux, relecture/validation du quiz par l'administrateur, Défi CHU (gestion, test puis officiel, scores remis à zéro à l'ouverture), rattachement de la réa au moteur commun (prévu), dessin de plan, charte graphique.
- Fichiers de questions (hors GitHub, chez l'utilisateur) : `defi-chu-import.json` (D001–D135 + vue du ciel) et `defi-transfert-import.json` (T001–T100, tirées du livret de transfert v2.7). Chaque import ignore les identifiants déjà présents.
- Le moteur réel de Cap NCHUG n'a jamais pu être testé depuis le bac à sable (accès à script.google.com bloqué) : tests par simulation (`test-*.js`) et Playwright seulement.
- Défi du jour (moteur 2.3.2) : 6 questions = 4 classiques + 2 missions du Parcours (3e et 6e), mission bonne dès qu'elle est terminée ; les questions « ascenseur » ne sont plus posées seules. Jeu Parcours séparé : interrupteur global dans la Gestion du Défi, désactivé au départ (`DEFI_PARCOURS`).
- Questions corrigées le 9/11/2026 (25 questions D024–D112, confusions entrées/bâtiments et pièges retirés), directement dans « Réa – Base » › « Défi – Questions » ; fichier `defi-chu-import.json` corrigé remis à l'utilisateur. Rien à corriger dans le Transfert.
- Missions « à vérifier » : D040–D046, D049–D051 (entrée du B50 : 32 ou 40 selon le niveau ?) en statut « retirée », source « À VÉRIFIER – … ». Les missions du B40 passent directement du bâtiment à l'étage.

- Accueil (2.5.5) : plus de carte « Quiz du jour » du service (le quiz reste dans « Quiz et jeux ») ; carte « 🏆 Quiz du jour – Défi CHU » ; tuile « 🏥 Plans du CHU » en 2e position, toujours visible, rubrique « Plan virtuel » (promenade libre, étages renseignés seulement).
- Onglet « Plan – Services » (Bâtiment, Niveau, Services) rempli le 9/11/2026 dans « Réa – Base » d'après le synoptique du Directoire (juin 2025) et le synoptique consult-explo : 28 étages, sans internat ni HAD. Modifiable dans la Gestion du Défi.
- Infos générales (Cap NCHUG) : bouton sur l'écran de choix, code commun choisi dans l'Espace créateurs (`INFOS_CODE`, global), jeton `visiteur` limité à la lecture (liste `INFOS_ACTIONS` dans le moteur), Défi en entraînement, retour à l'écran de choix à chaque ouverture.

- Codes (2.3.4) : l'administrateur choisit tous les codes de son service (agents, admin, référents), sans tirage au hasard ; les créateurs choisissent ou génèrent les codes à la création d'un service et pour un code admin perdu (`codeChoisi_` : 6 à 32 lettres/chiffres, unique dans le service ; jamais renvoyé par `codes_changer`).

- Plans du CHU (appli 2.5.8, 12/11/2026) : en haut de chaque étape du Plan virtuel, ligne 1 = barre de recherche des services (sans accents, noms de « Plan – Services » + codes B), ligne 2 = liste déroulante des services de A à Z (pas de tuile à part, rien sur l'écran « Plans du CHU »). Un choix ouvre une fiche (bâtiment, niveau, entrée rue Caraïbes, autres services de l'étage) avec « Me guider » : bâtiment, porte(s) puis bouton d'ascenseur allumés, l'agent les touche (rien n'est compté), service mis en évidence à l'arrivée. B50 : « N° 32 ou 40 » tant que l'entrée par niveau n'est pas connue ; bâtiment sans entrée : ascenseur direct. Le plan du service garde sa recherche existante. Aucun changement du moteur.

- PDF et rubriques (moteur 2.4.0, appli 2.6.0, 13/11/2026) : PDF dans « Documents et FAQ » (admin et référents ; images + texte extrait pour la recherche ; colonnes 10–14 de l'onglet). Rubriques personnalisées : onglet « Rubriques » par service, fiches rangées par la colonne « Rubrique » (`RUBxxx/SRyyy`) ; catalogue « Rubriques – Catalogue » dans l'annuaire ; un service reprend une rubrique d'un autre (paramètre « Rubriques adoptées ») = structure suivie, fiches propres ; rubriques du service « _chu » = communes, visibles d'office. Max 6 rubriques, 12 sous-rubriques. Actions : `docs_pdf_envoyer`, `docs_pdf_page`, `rub_etat`, `rub_gerer` ; `home` renvoie `perso`.

- Mises à jour (appli 2.6.2) : `sw.js` fait `skipWaiting()` à l'installation et relit les fichiers avec `cache: 'reload'` ; l'appli affiche le bandeau « Mettre à jour » (rechargement) et vérifie les mises à jour au retour dans l'appli. Auparavant la nouvelle version restait en attente et « Mettre à jour » ne changeait rien.

- Visite virtuelle (moteur 2.5.0, appli 2.7.0, 14/11/2026) : nouvelle rubrique, dans « Plan du service », tuile sous « Plan interactif », visible seulement si « Visite virtuelle (activée) » est VRAI (réglage par service, « Personnaliser le service », masquée par défaut — pour l'instant seule la réa a des photos). Onglets `Street – Points` (id, nom, zone, id photo/vignette/illustration Drive, cap initial, date, auteur) et `Street – Liens` (id, départ, type flèche/info, arrivée, position horizontale/verticale en %, texte) dans le classeur de chaque service. Visionneuse Photo Sphere Viewer 5.15.1 + three.js 0.185.1, vendues (jamais de CDN) dans `docs/vendor/photo-sphere-viewer/` (bundle esbuild, voir son `LISEZ-MOI.txt`), module `docs/js/street.js`. Photos et vignettes jamais sur GitHub, servies depuis le Drive du compte dédié via `https://lh3.googleusercontent.com/d/ID=sTAILLE` (à vérifier avec de vraies photos : repli prévu côté Apps Script si WebGL/CORS pose problème, voir Partie V du guide). Flèches et points d'info posés par clic direct dans la photo (référents/admin, bouton « Modifier les liens »), actions `street_liste` et `street_lien_modifier`. Prise de vue des 90 premiers points faite le 13/11 (E-01 à C-90 ; chambres et locaux restants) ; dépôt sur Drive et remplissage de `Street – Points` pas encore fait.

## Reste à faire côté utilisateur
1. Coller `Code.gs` 2.5.0 dans le script de la réa (et dans celui de Cap NCHUG), « Installer / réparer la base », puis Nouvelle version du déploiement.
2. Questions : déjà importées et corrigées dans la réa. Pour Cap NCHUG (Espace créateurs), importer les fichiers corrigés, puis relire et valider. Activer le jeu Parcours quand on le souhaite. Dans Cap NCHUG : recopier l'onglet « Plan – Services », entrer une fois dans « Modifier les contenus communs », puis choisir le code Infos générales.
3. Vérifier que Cap NCHUG répond (Espace créateurs, code super-admin ; déploiement « Exécuter en tant que : moi », « Accès : tout le monde »).
4. Créer un service test, puis rattacher la réa (partie R du guide) et retirer `SERVICES_EXTERNES` de `config.js`.
5. Validation DSI / DPO (mentionner le compte Google partagé).

## Questions de contenu encore ouvertes
Quelle entrée du B50 (32 ou 40) pour chaque niveau — débloque les 10 missions « à vérifier », numéro du B40, autres numéros de la rue, règle de parité, nommage des niveaux, couleurs B40/B50.

## Comment travailler
Les tests sont dans le répertoire de travail de la session précédente et ne sont pas dans le dépôt : si besoin, les réécrire (simulation Apps Script en Node, scénarios Playwright). Après toute modification : augmenter `VERSION`, committer, pousser.
