# Note de reprise — Cap NCHUG / appli réa (à lire en début de conversation)

Dépôt public : aucun code d'accès, aucun plan réel, aucune banque de questions ici.

## Le projet
PWA française gratuite pour le CHU de la Guadeloupe (GitHub Pages `/docs`) + moteur Apps Script (`apps-script/Code.gs`, v2.3.1) + Google Sheets/Drive. Compte : chugicu@gmail.com.
- **Appli réa** (réanimation – USC) : moteur propre, adresse dans `docs/js/config.js` (`SERVICES_EXTERNES`).
- **Cap NCHUG** : annuaire commun à tous les services (`CAP_URL` dans `config.js`), un moteur en `MODE='annuaire'`.
- Service worker : `VERSION` dans `docs/sw.js` (à augmenter à chaque mise en ligne ; actuellement `rea-app-v2.5.3`).
- Procédures : `GUIDE_DEPLOIEMENT.md` (P install Cap NCHUG, Q Défi, R rattachement de la réa, S lots 4/5/2, T plan et deux plans).

## Règles à ne jamais enfreindre
- Pas de données de santé dans l'appli ; pas de suivi individuel ; pas de compte Google pour les agents ; pas d'e-mails.
- Codes jamais stockés en clair ; données de visite purgées à J+30.
- Le vrai plan (`plan-donnees.json`), les synoptiques et la banque de questions du Défi ne vont **jamais** sur GitHub.
- Logo CHU non modifié (charte, ≥ 50 px, sur fond blanc). Couleurs : `#223b80`, `#40a8df`, `#048e39`, `#95c127`.
- Défi CHU : seulement les lits couverts en personnel (pas de lits gelés ni de totaux par bâtiment) ; dessins uniquement, pas de photos de vidéos ni de personnes.
- Ne pas générer de nouvelle appli ou fonction sans l'accord de l'utilisateur ; demander avant toute action sur son ordinateur.
- Nommage : B-codes = bâtiments, « rue Caraïbes N° » = entrées ; niveaux -1 à 4, 0 = niveau rue Caraïbes.

## État (9 novembre 2026)
- En ligne : plan interactif, visites, quiz et jeux, relecture/validation du quiz par l'administrateur, Défi CHU (gestion, test puis officiel, scores remis à zéro à l'ouverture), rattachement de la réa au moteur commun (prévu), dessin de plan, charte graphique.
- Fichiers de questions (hors GitHub, chez l'utilisateur) : `defi-chu-import.json` (D001–D135 + vue du ciel) et `defi-transfert-import.json` (T001–T100, tirées du livret de transfert v2.7). Chaque import ignore les identifiants déjà présents.
- Le moteur réel de Cap NCHUG n'a jamais pu être testé depuis le bac à sable (accès à script.google.com bloqué) : tests par simulation (`test-*.js`) et Playwright seulement.

## Reste à faire côté utilisateur
1. Coller `Code.gs` 2.3.1 dans le script de la réa, « Installer / réparer la base », puis Nouvelle version du déploiement.
2. Importer les deux fichiers de questions dans « Gestion du Défi CHU » (réa : code administrateur ; Cap NCHUG : Espace créateurs), puis relire et valider.
3. Vérifier que Cap NCHUG répond (Espace créateurs, code super-admin ; déploiement « Exécuter en tant que : moi », « Accès : tout le monde »).
4. Créer un service test, puis rattacher la réa (partie R du guide) et retirer `SERVICES_EXTERNES` de `config.js`.
5. Validation DSI / DPO (mentionner le compte Google partagé).

## Questions de contenu encore ouvertes
Quelle entrée B50 dessert les étages hauts, numéro du B40, autres numéros de la rue, règle de parité, nommage des niveaux, couleurs B40/B50.

## Comment travailler
Les tests sont dans le répertoire de travail de la session précédente et ne sont pas dans le dépôt : si besoin, les réécrire (simulation Apps Script en Node, scénarios Playwright). Après toute modification : augmenter `VERSION`, committer, pousser.
