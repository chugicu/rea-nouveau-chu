# Note de reprise — Cap NCHUG / appli réa (à lire en début de conversation)

Dépôt public : aucun code d'accès, aucun plan réel, aucune banque de questions ici.

## Le projet
PWA française gratuite pour le CHU de la Guadeloupe (GitHub Pages `/docs`) + moteur Apps Script (`apps-script/Code.gs`, v2.3.3) + Google Sheets/Drive. Compte : chugicu@gmail.com.
- **Appli réa** (réanimation – USC) : moteur propre, adresse dans `docs/js/config.js` (`SERVICES_EXTERNES`).
- **Cap NCHUG** : annuaire commun à tous les services (`CAP_URL` dans `config.js`), un moteur en `MODE='annuaire'`.
- Service worker : `VERSION` dans `docs/sw.js` (à augmenter à chaque mise en ligne ; actuellement `rea-app-v2.5.5`).
- Procédures : `GUIDE_DEPLOIEMENT.md` (P install Cap NCHUG, Q Défi, R rattachement de la réa, S lots 4/5/2, T plan et deux plans).

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

## Reste à faire côté utilisateur
1. Coller `Code.gs` 2.3.3 dans le script de la réa (et dans celui de Cap NCHUG), « Installer / réparer la base », puis Nouvelle version du déploiement.
2. Questions : déjà importées et corrigées dans la réa. Pour Cap NCHUG (Espace créateurs), importer les fichiers corrigés, puis relire et valider. Activer le jeu Parcours quand on le souhaite. Dans Cap NCHUG : recopier l'onglet « Plan – Services », entrer une fois dans « Modifier les contenus communs », puis choisir le code Infos générales.
3. Vérifier que Cap NCHUG répond (Espace créateurs, code super-admin ; déploiement « Exécuter en tant que : moi », « Accès : tout le monde »).
4. Créer un service test, puis rattacher la réa (partie R du guide) et retirer `SERVICES_EXTERNES` de `config.js`.
5. Validation DSI / DPO (mentionner le compte Google partagé).

## Questions de contenu encore ouvertes
Quelle entrée du B50 (32 ou 40) pour chaque niveau — débloque les 10 missions « à vérifier », numéro du B40, autres numéros de la rue, règle de parité, nommage des niveaux, couleurs B40/B50.

## Comment travailler
Les tests sont dans le répertoire de travail de la session précédente et ne sont pas dans le dépôt : si besoin, les réécrire (simulation Apps Script en Node, scénarios Playwright). Après toute modification : augmenter `VERSION`, committer, pousser.
