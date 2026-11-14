# Guide de déploiement – Réa · Nouveau CHU (étapes 1 à 3)

Durée : environ 45 minutes, une seule fois. Aucune compétence en programmation n'est nécessaire : il s'agit de copier-coller et de cliquer.

Vous aurez besoin :
- du **Gmail de service** (c'est lui qui « possède » la base et le moteur) ;
- d'un **compte GitHub** (gratuit) ; idéalement créé avec ce même Gmail de service ;
- du dossier `reanimation-demenagement` (fichier ZIP fourni).

---

## Partie A – La base de données et le moteur (Google)

### A1. Créer le Google Sheets « Base »
1. Connectez-vous au **Gmail de service**, puis ouvrez Google Drive.
2. Créez un dossier **Réa – Déménagement**.
3. Dans ce dossier : **Nouveau > Google Sheets**. Nommez-le **Réa – Base**.

### A2. Coller le moteur
1. Dans le Sheets : **Extensions > Apps Script**. Un éditeur s'ouvre.
2. Nommez le projet **Réa – Moteur** (en haut à gauche).
3. Supprimez tout le contenu du fichier `Code.gs`, puis collez-y le contenu du fichier `apps-script/Code.gs` du ZIP.
4. Cliquez sur l'engrenage **Paramètres du projet** (à gauche) et cochez **Afficher le fichier manifeste « appsscript.json » dans l'éditeur**.
5. Revenez à l'éditeur (icône `< >`), ouvrez `appsscript.json`, remplacez son contenu par celui du fichier `apps-script/appsscript.json` du ZIP.
6. Cliquez sur **Enregistrer** (icône disquette).

### A3. Installer la base
1. Revenez sur l'onglet du Sheets et **rechargez la page**. Un menu **Réa – Administration** apparaît après quelques secondes.
2. **Réa – Administration > 1. Installer / réparer la base**.
3. Google demande une autorisation :
   - **Continuer**, choisissez le Gmail de service ;
   - écran « Google n'a pas validé cette application » : **Paramètres avancés > Accéder à Réa – Moteur (non sécurisé)**. C'est normal : c'est votre propre script ;
   - **Autoriser**.
4. Relancez **1. Installer / réparer la base** si le menu ne s'est pas exécuté après l'autorisation.

Résultat : cinq onglets sont créés.

| Onglet | Rôle | Qui le modifie |
|---|---|---|
| Paramètres | Date J, nom du service, message d'accueil | Administrateur |
| Effectifs | Effectif par fonction (sert à la jauge) | Administrateur |
| Actualités | Actualités affichées sur l'accueil | Référents |
| Je suis prêt | Déclarations anonymes (rempli par l'application) | Personne |
| Référents | Liste des référents (sans les codes) | Menu uniquement |

### A4. Définir les codes d'accès
Dans **Réa – Administration** :
1. **Définir le code SERVICE (agents)** : le code commun à tout le service. Au moins 6 lettres ou chiffres.
2. **Définir le code ADMINISTRATEUR** : votre code personnel.
3. **Ajouter ou modifier un référent** : à faire 10 fois, une fois par référent (nom affiché + code personnel).

Astuce : **Générer un code aléatoire (aide)** propose un code facile à lire (sans 0/O ni 1/I/L).

Important : les codes sont stockés **uniquement sous forme chiffrée**. Notez-les dans un endroit sûr : ils ne peuvent pas être relus, seulement redéfinis.

### A5. Publier le moteur
1. Dans l'éditeur Apps Script : **Déployer > Nouveau déploiement**.
2. Engrenage à côté de « Sélectionner le type » : **Application Web**.
3. Description : `Étape 1`.
4. **Exécuter en tant que : Moi** (le Gmail de service).
5. **Qui a accès : Tout le monde**.
6. **Déployer**, puis copiez l'**URL de l'application Web** (elle se termine par `/exec`).

Vérification : collez cette URL dans un navigateur. Vous devez voir un court texte commençant par `{"ok":true`.

---

## Partie B – L'application (GitHub Pages)

### B1. Créer le dépôt
1. Connectez-vous sur **github.com** (créez le compte si besoin, avec le Gmail de service).
2. **New repository**. Nom : `rea-nouveau-chu`. Visibilité : **Public** (obligatoire pour l'hébergement gratuit). Cochez **Add a README file**. **Create repository**.

Le dépôt est public : il ne contient que le code et les logos. **Ne jamais y déposer** de plans, de codes, de numéros internes ou de procédures : ils iront dans le Drive (étapes suivantes).

### B2. Déposer les fichiers
1. Dans le dépôt : **Add file > Upload files**.
2. Glissez **le contenu** du dossier `reanimation-demenagement` du ZIP (les dossiers `docs`, `apps-script` et les fichiers `.md`).
3. **Commit changes**.

Note : le dossier `apps-script` est une copie de référence du moteur, pour garder l'historique des versions. L'application n'en a pas besoin pour fonctionner.

### B3. Brancher l'application sur le moteur
1. Dans le dépôt, ouvrez `docs/js/config.js`, puis l'icône crayon **Edit**.
2. Collez l'URL `/exec` entre les apostrophes :
   ```js
   API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
   ```
3. **Commit changes**.

Tant que `API_URL` est vide, l'application fonctionne en **mode démonstration** (données fictives, codes `DEMO`, `REFDEMO`, `ADMDEMO`). Pratique pour la montrer avant la mise en service.

### B4. Activer l'hébergement
1. **Settings > Pages**.
2. Source : **Deploy from a branch**. Branch : **main**, dossier **/docs**. **Save**.
3. Après 1 à 2 minutes, l'adresse apparaît : `https://<votre-compte>.github.io/rea-nouveau-chu/`.

---

## Partie C – Tester puis diffuser

### C1. Test complet (10 minutes)
- [ ] L'adresse s'ouvre sur l'écran de connexion, sans bandeau « Mode démonstration ».
- [ ] Un faux code affiche « Ce code n'est pas reconnu ».
- [ ] Le code SERVICE ouvre l'accueil avec « Équipe réa » en haut à droite.
- [ ] Un code référent affiche « Référent : <nom> ».
- [ ] Le code ADMINISTRATEUR affiche « Administrateur ».
- [ ] Saisissez une **Date J** dans l'onglet Paramètres (format date), cliquez **Actualiser** dans l'application : le compte à rebours apparaît.
- [ ] Ajoutez une actualité, cochez **Publiée** : elle apparaît après **Actualiser**.
- [ ] Mode avion sur le téléphone, rouvrez l'application : l'accueil s'affiche avec « Hors ligne. Données du … ».

### C2. Installer sur le téléphone
- **Android (Chrome)** : menu ⋮ > **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
- **iPhone (Safari)** : bouton Partager > **Sur l'écran d'accueil**.

L'icône « Réanimation Guadeloupe » apparaît comme une application normale.

### C3. Diffuser
Communiquez l'adresse et le code SERVICE par vos canaux internes habituels (relève, affichage en salle de pause avec QR code, réunion de service). Évitez de les publier ensemble sur un support accessible hors du service.

### C4. Validation par le service communication
La charte du CHU (page 33) impose une validation avant diffusion de tout support portant le logo. Présentez l'application au service communication et demandez le **fichier officiel du logo CHU** (PNG fond transparent, 400 px de large environ). Déposez-le dans le dépôt sous le nom exact `docs/assets/logos/chu-guadeloupe.png` : il remplacera automatiquement le texte « CHU de la Guadeloupe » en bas de l'accueil.

---

## Partie D – Au quotidien

| Je veux… | Où | Comment |
|---|---|---|
| Fixer ou changer la date J | Sheets > Paramètres | Cellule B2, format date |
| Publier une actualité | Sheets > Actualités | Date, Titre, Texte, cocher **Publiée** (et **Épinglée** pour la garder en tête) |
| Retirer une actualité | Sheets > Actualités | Décocher **Publiée** |
| Corriger un effectif | Sheets > Effectifs | Effectif 0 = fonction masquée de la jauge |
| Ajouter un référent | Menu Réa – Administration | Ajouter ou modifier un référent |
| Retirer un référent | Menu Réa – Administration | Désactiver un référent (sa session est coupée immédiatement) |
| Changer le code SERVICE | Menu Réa – Administration | Définir le code SERVICE, puis **Déconnecter tout le monde** si l'ancien code a fuité |

Les modifications du Sheets sont visibles dans l'application dès que l'utilisateur clique sur **Actualiser** ou rouvre l'application.

---

## Partie E – Installer les étapes suivantes

À chaque nouvelle étape livrée (plan, visites, quiz…), deux gestes :

1. **Moteur** : remplacez le contenu de `Code.gs` dans l'éditeur, enregistrez, puis
   **Déployer > Gérer les déploiements > crayon (Modifier) > Version : Nouvelle version > Déployer**.
   Ne créez **pas** un « Nouveau déploiement » : l'URL changerait et l'application ne trouverait plus le moteur.
   Relancez ensuite **Réa – Administration > 1. Installer / réparer la base** : les nouveaux onglets sont ajoutés, rien n'est effacé.
2. **Application** : dans GitHub, **Add file > Upload files**, déposez les fichiers modifiés du dossier `docs` (sauf `config.js`, pour garder votre URL). Les téléphones afficheront « Une nouvelle version est disponible – Mettre à jour ».

---

## Partie F – Étape 2 : le plan du service

Le plan n'est **jamais déposé sur GitHub** (dépôt public). Il est rangé dans le Drive du Gmail de service et lu par le moteur, uniquement pour les personnes connectées.

### F1. Mettre à jour le moteur
1. Remplacez le contenu de `Code.gs` et de `appsscript.json` dans l'éditeur Apps Script (fichiers du dossier `apps-script`), puis **Enregistrer**.
2. Dans le Sheets : **Réa – Administration > 1. Installer / réparer la base**. Google redemande une autorisation : elle permet au moteur de **lire** le fichier du plan dans le Drive (lecture seule). Acceptez.
   Deux onglets apparaissent : **Pièces** (désignations des référents) et **Catégories** (couleurs), ainsi qu'une ligne **Fichier du plan (ID Drive)** dans Paramètres.
3. **Déployer > Gérer les déploiements > crayon > Version : Nouvelle version > Déployer** (l'adresse `/exec` ne change pas).

### F2. Déposer le plan dans le Drive
1. Déposez le fichier **plan-donnees.json.gz** (fourni à part, hors du ZIP ; version compressée) dans le dossier **Réa – Déménagement** du Drive.
   *Déjà fait pour vous dans le Drive de chugicu@gmail.com, ainsi que l'étape 3.*
2. Clic droit sur le fichier > **Partager > Copier le lien**. L'identifiant est la partie entre `/d/` et `/view` (ex. `1AbC…xYz`).
   Ne changez pas le partage : le fichier reste privé, seul le moteur le lit.
3. Collez cet identifiant dans l'onglet **Paramètres**, ligne **Fichier du plan (ID Drive)**.

### F3. Mettre l'application à jour
Dans GitHub, déposez les fichiers modifiés du dossier `docs` (sauf `config.js`) : `index.html`, `sw.js`, `css/app.css`, `js/app.js`, `js/api.js`, `js/plan.js`. Les téléphones proposeront « Mettre à jour ».

### F4. Au quotidien
| Je veux… | Comment |
|---|---|
| Nommer une pièce « à désigner » | Dans l'appli, en référent : Plan > filtre **À désigner** > toucher la pièce > **Désigner cette pièce** (nom, catégorie, icône, couleur) |
| Changer la couleur de toute une catégorie | Même formulaire, cocher **Appliquer cette couleur à toute la catégorie** |
| Annuler une désignation | Fiche de la pièce > **Modifier** > **Revenir au plan d'origine** (ou supprimer la ligne dans l'onglet Pièces) |
| Remplacer le plan (nouvelle version) | Remplacer le fichier dans le Drive (même ID : *Gérer les versions*), puis **Réa – Administration > Relire le plan depuis le Drive** |

Les désignations sont rattachées à un identifiant de pièce (P001, P002…) : elles restent valables tant que le fichier du plan n'est pas régénéré.

---

## Partie G – Étape 3 : visites des locaux et badges

### G1. Mettre à jour le moteur (5 minutes)
1. Copiez le nouveau `apps-script/Code.gs` (sur GitHub : dépôt rea-nouveau-chu > apps-script > Code.gs > bouton « Copy raw file ») et collez-le à la place de l'ancien dans l'éditeur Apps Script. Faites de même pour `appsscript.json`. **Enregistrer**.
2. Dans le Sheets : **Réa – Administration > 1. Installer / réparer la base**. Google demande une nouvelle autorisation (programmer l'effacement automatique des inscriptions) : acceptez.
   Deux onglets apparaissent : **Créneaux** et **Inscriptions**.
3. **Déployer > Gérer les déploiements > crayon > Version : Nouvelle version > Déployer** (l'adresse `/exec` ne change pas).

### G2. Utilisation
| Qui | Quoi | Où |
|---|---|---|
| Référent | Créer, modifier ou annuler un créneau (date, heure, durée, places, lieu de rendez-vous, guide) | Appli > Visites des locaux > **Créer un créneau** / **Modifier** |
| Référent | Cocher les présents à la fin de la visite | Appli > carte du créneau > **Inscrits** |
| Agent | S'inscrire (prénom, initiale du nom, fonction), noter son code de réservation, annuler | Appli > Visites des locaux |

- **Badge « Visite faite »** : attribué quand un référent coche la présence, ou quand l'agent touche « J'ai fait la visite » après l'heure du créneau.
- **Badge « Plan exploré »** : attribué dès que **8 pièces différentes** du plan ont été touchées (n'importe lesquelles).
- Les badges restent sur le téléphone de chacun : aucun suivi individuel.
- **Protection des données** : prénom, initiale et fonction sont effacés automatiquement chaque nuit après **J+30** (si la Date J est renseignée). Effacement manuel possible : **Réa – Administration > Effacer les inscriptions aux visites**.

---

## Partie H – Version 1.3 : exports, modification du plan, plein écran

### H1. Mettre à jour le moteur (5 minutes)
1. Collez le nouveau `apps-script/Code.gs` **et** `appsscript.json` à la place des anciens (comme en G1). **Enregistrer**.
   (Si vous n'aviez pas encore fait la partie G, cette mise à jour la comprend : faites seulement H.)
2. Dans le Sheets : **Réa – Administration > 1. Installer / réparer la base** (acceptez l'autorisation si Google la demande). L'onglet **Pièces** reçoit trois colonnes de plus : *Forme*, *Supprimée*, *Ajoutée*.
3. **Déployer > Gérer les déploiements > crayon > Version : Nouvelle version > Déployer**.
4. Sur les téléphones, l'appli se met à jour seule (fermer puis rouvrir l'appli si besoin).

### H2. Nouveautés
| Qui | Quoi | Où |
|---|---|---|
| Référent / admin | Exporter la liste des visiteurs en **Excel** ou en **PDF** | Visites des locaux > **Exporter** |
| Référent / admin | Imprimer la **feuille d'émargement** d'un créneau (avec colonne signature) | Carte du créneau > **Émargement (PDF)** |
| Référent / admin | Déplacer ou redimensionner une pièce | Plan > toucher la pièce > **Modifier la forme** (faire glisser les ronds blancs) > **Enregistrer la forme** |
| Référent / admin | Ajouter une pièce | Plan > **+ Pièce** > dessiner un rectangle du doigt > nom, catégorie, icône |
| Référent / admin | Retirer une pièce, puis la remettre si besoin | Plan > pièce > **Supprimer la pièce** ; filtre **Pièces supprimées** > **Remettre la pièce sur le plan** |
| Référent / admin | Annuler une modification de forme | Plan > pièce > **Rétablir la forme d'origine** |
| Tous | Plan en **plein écran** | Bouton ⛶ en bas des boutons de zoom. Toucher une pièce : sa fiche s'affiche en bas. Toucher hors d'une pièce : le bandeau du haut (recherche, types de pièces) s'affiche ou se masque. |

- Les fichiers exportés contiennent des données personnelles (prénom, initiale, fonction) : usage interne, à détruire après usage. Ils sont fabriqués sur le téléphone ou l'ordinateur : rien n'est envoyé à un service extérieur.
- Toutes les modifications du plan sont dans l'onglet **Pièces** du Sheets : effacer une ligne rend à la pièce son état d'origine.
- **Logo du CHU** : le logo officiel (extrait sans modification de la charte, taille ≥ 50 px, fond blanc, zone de protection respectée) figure sur l'écran de connexion, l'accueil et les PDF. Faire valider par le service communication, seul habilité à fournir les fichiers officiels.

---

## Partie I – Version 1.4 : newsletters

### I1. Mettre à jour le moteur (5 minutes)
1. Collez le nouveau `apps-script/Code.gs` **et** `appsscript.json` (comme en G1). **Enregistrer**. Cette version comprend les parties G et H.
2. Dans le Sheets : **Réa – Administration > 1. Installer / réparer la base**. Google demande une autorisation élargie au **Drive** (le moteur doit pouvoir y ranger les pages des newsletters) : acceptez. L'onglet **Newsletters** apparaît.
3. **Déployer > Gérer les déploiements > crayon > Version : Nouvelle version > Déployer**.

### I2. Publier une newsletter (administrateur)
1. Appli > **Newsletter** > **+ Ajouter une newsletter**.
2. Choisissez le PDF (16 pages au plus). Il est converti **sur votre appareil** en images haute définition (≈ 200 ppp) ; un aperçu s'affiche.
3. Indiquez le titre (ex. « Actu Réa #1 ») et la parution (ex. « Septembre 2026 »), puis **Publier la newsletter**.
- Les images sont rangées dans le dossier privé **Réa – Newsletters** du Drive (créé automatiquement, ne pas le partager) et ne sont servies qu'aux personnes connectées avec un code.
- Une étiquette **Nouveau** apparaît sur l'accueil de chacun jusqu'à la lecture.
- **Retirer** une newsletter : bouton *Retirer* sous sa vignette (2 temps). Les images partent à la corbeille du Drive.
- Les newsletters lues restent consultables hors ligne sur le téléphone, jusqu'à la déconnexion.

---

## Partie J – Version 1.5 : sections et équipements sur le plan

### J1. Mettre à jour le moteur
Collez `Code.gs` et `appsscript.json` (version 1.5.0), **Installer / réparer la base** (crée l'onglet **Équipements**), puis **Nouvelle version** du déploiement.

### J2. Nouveautés (référents et administrateur)
- **Sections de pièces** : WC, Pharmacie, DM (dispositifs médicaux), Logistique, Biomed, Secrétariats, Entretiens (en plus des postes de soins, bureaux, personnel, familles…). Chaque section a son filtre, sa couleur et son icône. Les pièces déjà nommées « WC », « Pharmacie », « Secrétariat »… y sont rangées automatiquement ; corrigez si besoin (Plan > pièce > *Modifier le nom, l'icône ou la couleur* > Catégorie).
- **Équipements** (chariots d'urgence, échographes, imprimantes) : Plan > **+ Équipement** > type et précision (ex. « Adulte », « n° 2 ») > **Placer sur le plan** > toucher l'emplacement. Toucher un équipement : *Modifier*, *Déplacer* (puis toucher le nouvel emplacement), *Supprimer*.
- Tout le monde voit les équipements, peut les rechercher (« chariot », « écho »…) et filtrer « Chariots d'urgence », « Échographes », « Imprimantes ». La fiche indique la pièce la plus proche (« Près de : chambre 312 »).
- Les équipements sont dans l'onglet **Équipements** du Sheets (une ligne par équipement) ; ils serviront aux quiz (« Où est le chariot d'urgence le plus proche de la 318 ? »).

---

## Partie K – Version 1.6 : Quiz

### K1. Mettre à jour le moteur
Collez `Code.gs` et `appsscript.json` (version 1.6.0), **Installer / réparer la base**, puis **Nouvelle version** du déploiement.
L'installation crée l'onglet **Quiz** avec **21 questions préparées par Claude, en brouillon** (10 sur le plan, 11 sur les urgences), et le paramètre **Objectif quiz équipe** (3000 par défaut).

### K2. Relire et publier la banque de Claude (administrateur)
Appli > **Quiz** > **Gérer les questions** > filtre **Brouillons** : *Modifier* si besoin, puis *Publier* (ou **Publier tous les brouillons**).
Les questions Urgences de Claude sont générales : adaptez-les aux procédures du CHU avant de les publier.

### K3. Ce que contient le quiz
- **Quiz du jour** : 3 questions par jour (dont 1 Urgences quand il y en a), badge **Fidèle** après 7 jours.
- **Entraînement libre** : Plan et équipements, Urgences et sécurité, Couleurs des unités. Les questions ratées reviennent plus souvent (mémoire du téléphone).
- **Questions automatiques**, fabriquées à partir du plan **en direct** (elles suivent les modifications des référents) : chambre → unité, toucher une chambre d'une unité, toucher une pièce nommée, toucher une section (poste de soins, WC, pharmacie…), équipement le plus proche d'une chambre, couleur des unités. Les futurs équipements (DAE, vannes…) y entreront automatiquement dès qu'ils seront ajoutés au plan.
- **Jeux du plan** : *Placer les étiquettes* (noms d'unités gris à glisser), *Colorier les unités* (ronds de couleur à glisser sur les étiquettes grises, chambres grises), *Niveau ultime* (contours seuls, toutes les pièces à replacer zone par zone).
- **Badges** : Boussole (20 bonnes réponses plan), Prêt pour l'urgence (toutes les questions Urgences réussies une fois), Fidèle (7 quiz du jour), Expert (100 bonnes réponses).
- **Défi d'équipe** : seul un **total anonyme** de réponses est envoyé au moteur (aucune réponse individuelle).
- Fonctionne **hors ligne** après une première ouverture.

### K4. Questions rédigées par les référents
Quiz > **Gérer les questions** > **+ Nouvelle question** : QCM (2 à 4 réponses), Vrai / faux, ou **Sur le plan** (toucher la ou les bonnes réponses sur le mini-plan). Publiées **directement** ; tous les référents peuvent les modifier ou les retirer.
- Une question peut être **liée** à des pièces : si une pièce ou un équipement lié est modifié, la question passe **À revérifier** et disparaît du quiz jusqu'à ce qu'un référent clique **Toujours juste** (ou la modifie).

---

## Partie L – Version 1.7 : jeux et souvenirs

### L1. Mettre à jour le moteur
Collez `Code.gs` et `appsscript.json` (version 1.7.0), **Installer / réparer la base**, puis **Nouvelle version** du déploiement.
L'installation crée les onglets **Jeux**, **Souvenirs**, **Nuage**, **QR codes**, **Paris** (5 paris prêts), **Pronostics** et **Retours**. **Tous les jeux sont désactivés au départ.**

### L2. Activer les jeux (administrateur)
Appli > **Jeux** > **⚙ Activer et régler les jeux** : pour chaque jeu, case *Activé*, dates d'**ouverture** et de **fermeture** facultatives (fermeture : jusqu'au soir de la date), puis **Enregistrer**.
- **Jauge du déménagement** (en haut de l'accueil) : objectif en points (4000 par défaut) et 5 paliers modifiables. Points : 1 par réponse au quiz, 1 par newsletter lue, 1 par mot du nuage ou pari, 2 par QR code trouvé, 3 par inscription à une visite ou ligne de bingo, 5 par souvenir publié ou mission d'escape game, 10 par carton plein. Aucun nom n'est enregistré : seulement un total.
- **Souvenirs** (tuile de l'accueil) : photos et anecdotes du CHU actuel, signature facultative. Chaque envoi est **validé par un référent** (onglet *À valider*). Règles affichées avant l'envoi d'une photo : aucun patient, collègues d'accord. Mosaïque, cœurs anonymes, **diaporama** plein écran (idéal sur un écran en salle de pause).
- **Concours photo** : rubrique séparée, photo obligatoire, validation par un référent, un cœur par photo et par téléphone. Les cœurs restent **cachés jusqu'à la date de fermeture**, puis le **podium** s'affiche.
- **Le nuage** : 4 questions (modifiables : une par ligne), 3 mots maximum, filtre des grossièretés, mots identiques regroupés. Les référents retirent un mot en le touchant.
- **QR codes cachés** : Jeux > QR codes > *+ Nouveau QR code* (lieu, message, emplacement touché sur le plan) > **Imprimer la planche (PDF)** : 6 QR codes par page avec leur code écrit en dessous. Scannés avec l'appareil photo, ils ouvrent l'appli et montrent le lieu sur le plan. Badges à 5, 10 et tous les QR codes.
- **Escape game** : 4 missions rédigées par Claude (transfert du lit 309, incident pendant le trajet, première garde, alarme incendie). **Les référents jouent chaque mission puis la valident** (ou laissent une remarque, notée dans l'onglet *Retours*). Les agents ne voient que les missions validées.
- **Bingo** : 20 cases par défaut (modifiables, 16 minimum) ; chaque téléphone tire une grille 4 × 4 dans un ordre différent. Les cases ✦ se cochent toutes seules (visite, quiz du jour, QR code, newsletter…).
- **Paris** : sous un **pseudo** libre ; on peut modifier son pari jusqu'à la fermeture (par défaut la **veille du jour J**). L'administrateur ajoute des paris et saisit les **résultats** : le podium des pseudos les plus proches s'affiche.

---

## Partie M – Version 1.8 : nouveau design

Rien à faire côté moteur : seuls les fichiers du dossier `docs/` changent.

1. Remplacez le dossier `docs/` sur GitHub (nouveaux fichiers : `css/theme.css`, `js/fun.js`, polices `barlow-condensed-*`).
2. Le design suit le réglage clair ou sombre du téléphone.
3. Confettis, vibrations, série 🔥 et transitions restent sur le téléphone. Si le téléphone demande de réduire les animations, elles sont coupées.
4. Les logos restent intacts, sur fond blanc, ≥ 50 px.
5. Les téléphones récupèrent la nouvelle version à la réouverture suivante (cache `rea-app-v1.8.0`).

## Partie N – Version 1.9 : rubrique Plan, GPS, Quiz et jeux

**Moteur (une fois) :** remplacez `Code.gs` par la version 1.8.0, enregistrez, puis Déployer › Gérer les déploiements › modifier › Nouvelle version. Aucune nouvelle installation n'est nécessaire.

**Nouveautés :**
1. Accueil : le message d'accueil passe au-dessus du compte à rebours, et le quiz du jour s'y trouve directement. La tuile « Quiz » disparaît.
2. Rubrique « Plan du service » : plan interactif, puis Placer le nom des unités, Colorier les unités, Colorier les chambres (nouveau), Niveau ultime.
3. Rubrique « Quiz et jeux » : les thèmes du quiz (Plan et équipements, Urgences et sécurité, Couleurs des unités), les badges et le défi d'équipe, puis les jeux.
4. GPS dans le plan interactif : bouton « 📍 Ma position ». À la première activation, un message prévient que la précision dépend du téléphone et du réseau. La position reste sur le téléphone.

**Calage du GPS (administrateur, sur place, une seule fois) :**
1. Plan du service › Plan interactif › « ⚙ Caler le GPS ».
2. Les points sont proposés à l'avance et numérotés en orange sur le plan : les 4 chambres des extrémités (près de la fenêtre), les angles des patios, les escaliers et monte-malades.
3. Allez sur un point, touchez « Je suis ici » et ne bougez plus pendant 15 s. Recommencez sur d'autres points.
4. Visez au moins 8 points bien répartis, en commençant par les points 1 à 4. Le panneau affiche l'écart moyen ; refaites ou retirez un point dont l'écart est nettement plus grand que les autres.
5. Touchez « Enregistrer pour tous ». Un « Point libre » permet aussi de toucher n'importe quel endroit du plan.

## Partie O – Garder les modifications du plan (moteur 1.8.1)

**Où sont les modifications ?** Renommages, pièces ajoutées, couleurs, équipements et calage GPS sont dans le Google Sheets « Base » (onglets Pièces, Catégories, Équipements) et dans les propriétés du script. Ils ne sont jamais effacés par :
- une nouvelle version du moteur (Déployer › Gérer les déploiements › modifier › **Nouvelle version**) ;
- une nouvelle version de l'appli sur GitHub ;
- « Installer » (qui ne crée que les onglets manquants).

À éviter : supprimer ou renommer ces onglets, repartir d'un autre Google Sheets, ou créer un « Nouveau déploiement » au lieu d'une « Nouvelle version » (l'adresse du moteur changerait).

**Nouvelle version du fichier du plan** (plan de l'architecte mis à jour) : la numérotation des pièces peut changer. Depuis la 1.8.1, chaque modification garde un repère (position et numéro de chambre), et le moteur rattache tout automatiquement.
1. Déployez d'abord le moteur 1.8.1 et ouvrez une fois le plan dans l'appli : les repères des modifications existantes sont notés (colonne « Repère », à ne pas modifier).
2. Remplacez le fichier du plan dans le Drive (ou changez son ID dans Paramètres), puis lancez `viderCachePlan` dans Apps Script.
3. À la première ouverture du plan, les modifications, les questions du quiz et les QR codes suivent leurs pièces. Le détail est noté dans l'onglet « Suivi du plan ».
4. Une pièce qui n'existe plus est gardée comme « pièce ajoutée » et signalée dans la colonne « À vérifier » de l'onglet Pièces : rien n'est perdu.

## Partie P – Cap NCHUG : installer l'appli commune à tous les services (dernier moteur)

**Ce qui ne change pas pour la réa :** tant que `config.js` n'est pas modifié, l'appli reste celle de la réa. Mettez quand même à jour le moteur de la réa en 2.0.0 (même procédure que d'habitude : coller `Code.gs`, Nouvelle version) : l'administrateur peut désormais gérer les codes depuis l'appli (tuile ⚙️ Administration).

**Installer le moteur commun Cap NCHUG (une seule fois, sur le compte Google dédié) :**
1. Connecté au compte dédié, créez un Google Sheets vide nommé « Cap NCHUG – Annuaire ».
2. Extensions › Apps Script : collez le **dernier** `Code.gs` (le même que celui de la réa) et, dans Paramètres du projet, cochez « Afficher le fichier manifeste appsscript.json » puis collez `appsscript.json` ; enregistrez.
3. Rechargez le Google Sheets : un menu « Cap NCHUG – Installation » apparaît › « Installer l'annuaire Cap NCHUG » ; acceptez les autorisations. (Ou, dans l'éditeur Apps Script : liste des fonctions en haut › `installerAnnuaire` › Exécuter.)
4. Rouvrez le Google Sheets : menu « Cap NCHUG – Administration › Définir le code SUPER-ADMINISTRATEUR ».
5. Déployer › Nouveau déploiement › Application Web (Exécuter en tant que : moi ; Accès : tout le monde). Copiez l'adresse en /exec.
6. Envoyez cette adresse à Claude (ou modifiez vous-même `docs/js/config.js` sur GitHub avec le modèle indiqué en haut du fichier) :
   - si la réa garde son moteur pour l'instant : `CAP_URL` = cette adresse, et la réa dans `SERVICES_EXTERNES` avec l'adresse de son moteur actuel ;
   - si vous rattachez la réa tout de suite (partie R) : `CAP_URL` = cette adresse et `SERVICE_HISTORIQUE: 'rea'`.
7. Ouvrez l'appli : la liste des services apparaît ; « Espace créateurs » en bas, avec votre code super-administrateur.

**Ensuite, tout se fait dans l'appli :**
- À l'ouverture, chacun choisit son service (retenu sur le téléphone), ou arrive par le lien / QR code de son service.
- « Espace créateurs » (en bas de la liste des services) : votre code super-administrateur permet de nommer des admins créateurs (un code chacun, montré une fois), de créer un service, de fermer ou rouvrir un service, et de remplacer un code admin perdu (code choisi, ou bouton « Générer au hasard »).
- À la création d'un service, le créateur choisit le code administrateur et le code des agents (ou les génère au hasard) ; ils s'affichent une dernière fois avec le lien direct et le QR code du service. Un Google Sheets privé est créé pour le service dans le dossier « Cap NCHUG – Services (privé) » du compte dédié.
- L'administrateur du service choisit lui-même ses codes dans l'appli (tuile ⚙️ Administration) : code des agents, son code administrateur et le code de chaque référent. Règle : 6 à 32 lettres ou chiffres, sans espace, accent ni tiret, différent des autres codes du service (moteur 2.3.4). Les codes sont conservés chiffrés : notez-les.
- Chaque administrateur personnalise ensuite son service et prépare son plan (parties S et T) ; le Défi CHU se gère depuis l'Espace créateurs (partie Q).

**Mises à jour :** un seul moteur pour tous les services : collez le nouveau `Code.gs` dans le projet de l'annuaire et faites « Nouvelle version », une fois.

## Partie Q – Défi CHU (moteur 2.1.0)

Questions communes à tous les services, défi du jour, classement des services en % de bonnes réponses, jeu « Parcours ». Aucune question et aucun plan ne sont sur GitHub : tout est dans le Google Sheets privé (annuaire Cap NCHUG, ou base « Base » de la réa tant qu'elle est seule).

**Installer (réa seule, aujourd'hui) :**
1. Collez le nouveau `Code.gs` dans le projet Apps Script de la réa, enregistrez, puis menu « Réa – Administration › 1. Installer / réparer la base » : trois onglets apparaissent (« Défi – Questions », « Défi – Site », « Défi – Scores »).
2. Déployer › Gérer les déploiements › modifier › Nouvelle version.
3. Dans l'appli, avec le code ADMINISTRATEUR : tuile 🏆 « Gestion du Défi CHU » › « Importer un fichier de questions » : choisissez `defi-chu-import.json` (fourni à part, à ne jamais déposer sur GitHub) et cochez « Remplacer aussi la vue du ciel ». Les 135 questions arrivent « à valider ».

Avec Cap NCHUG, la gestion du Défi se fait depuis l'Espace créateurs (bouton « Gérer le Défi CHU »), par le super-admin et les créateurs ; les questions sont dans le Google Sheets de l'annuaire.

**Phase de test, puis ouverture :**
- En phase de test (au départ), les questions « à valider » et « validées » sont jouées ; les « retirées » jamais. Les scores ne servent qu'à tester.
- Validez, retirez, modifiez ou ajoutez les questions dans l'appli (filtres par statut, thème, recherche) ou directement dans l'onglet « Défi – Questions » (colonne Statut : à valider / validée / retirée ; pris en compte en 5 minutes).
- « Ouvrir officiellement le Défi » : seules les questions validées sont jouées et le classement repart de zéro. On peut revenir en phase de test.

**Règles :** les mêmes 6 questions pour tout le CHU chaque jour : 4 questions (choix multiple ou vrai/faux) et 2 missions du Parcours (vue du ciel → entrée de la rue Caraïbes → étage), en 3e et 6e position. Une mission compte comme une bonne réponse dès qu'elle est terminée, quel que soit le nombre d'erreurs. Les questions de type « ascenseur » ne sont plus jamais posées seules : elles servent uniquement de missions. S'il n'y a pas assez de missions jouables, le défi est complété par des questions classiques ; seule la 1re réponse de chaque téléphone compte (empreinte gardée quelques heures, jamais reliée à une personne) ; un service est classé à partir de 30 réponses dans la semaine ; podium de la semaine, de la semaine dernière et classement général. Seuls des totaux par service et par semaine sont gardés ; la tâche de nuit les recopie dans « Défi – Scores ».

**Vue du ciel (Parcours) :** dans la gestion, touchez un bâtiment, une entrée (N°) ou un parking pour changer son code, sa couleur (ou « sans couleur »), le bâtiment desservi, sa taille ; faites-le glisser pour le déplacer ; « + Entrée (N°) » pour ajouter un numéro de la rue Caraïbes. Le Parcours (vue du ciel → rue → ascenseur → arrivée) utilise les questions de type « ascenseur ». Une mission dont le bâtiment n'a pas d'entrée connue (ex. B40) passe directement à l'ascenseur.

**Jeu Parcours séparé (moteur 2.3.2) :** désactivé au départ. Dans « Gestion du Défi CHU » (super-admin et créateurs ; l'administrateur quand le service est seul), bouton « Activer le jeu Parcours » : le bouton « Parcours » apparaît alors pour tous les services. Les 2 missions du Défi du jour sont jouées que le jeu soit activé ou non.

**Missions à vérifier :** une mission dont on n'est pas sûr est mise en statut « retirée » avec « À VÉRIFIER – … » au début de la colonne Source. Elle n'est jamais jouée. Une fois corrigée (colonne « Entrée ou bâtiment » : le N° de l'entrée, ou le code B du bâtiment s'il n'a pas d'entrée connue), remettez-la « à valider ».

**Plans du CHU › Plan virtuel (moteur 2.3.3) :** tuile « 🏥 Plans du CHU », visible dans tous les services (même si l'administrateur a choisi ses rubriques) et dans Infos générales. Promenade libre, sans question ni score : vue du ciel → rue Caraïbes (portes du bâtiment choisi en surbrillance) → ascenseur → étage. Seuls les étages renseignés sont proposés ; un bâtiment sans entrée connue (B40) passe directement à l'ascenseur. Les services de chaque étage sont dans l'onglet « Plan – Services » (Bâtiment, Niveau de -1 à 4, Services un par ligne), créé automatiquement à côté des onglets « Défi – … », jamais sur GitHub. Ils se modifient aussi dans « Gestion du Défi CHU » › « Plans du CHU : services par étage » (un étage vidé est retiré du plan).

**Infos générales (Cap NCHUG, moteur 2.3.3) :** l'écran d'accueil propose « ℹ️ Infos générales » puis la liste des services. Infos générales donne accès, en lecture, aux contenus communs (Plans du CHU, Quiz du jour – Défi CHU en entraînement : les réponses ne comptent pour aucun service, actualités, newsletters et documents communs) avec un code commun. Ce code se choisit dans l'Espace créateurs › « Infos générales » (super-admin et créateurs ; 6 à 32 lettres, chiffres ou tirets) ; tant qu'aucun code n'est défini, le bouton affiche « Bientôt ». Changer le code oblige les téléphones à saisir le nouveau ; « Fermer l'accès » le désactive. Le code n'est demandé qu'une fois par téléphone, mais à chaque ouverture l'appli revient à l'écran de choix. Prérequis : être entré une fois dans « Modifier les contenus communs ». Le code étant affiché dans les services, ces contenus sont accessibles à toute personne qui le connaît : à signaler à la DSI / au DPO.

## Partie R – Rattacher la réa au moteur commun Cap NCHUG (moteur 2.2.0)

La réa garde son Google Sheets « Base », ses fichiers Drive, ses codes et ses référents : seul le moteur change. Ensuite elle a le même Défi CHU que les autres services (classement inter-services). À faire une fois, quand l'annuaire Cap NCHUG est installé (partie P).

**Avant :** collez `Code.gs` 2.2.0 dans le projet de la réa **et** dans celui de l'annuaire, puis « Nouvelle version » des deux déploiements.

1. **Dans le Google Sheets de la réa** : menu « Réa – Administration › Préparer le rattachement à Cap NCHUG ». Une clé à usage unique s'affiche une seule fois (notez-la). Un paquet chiffré est rangé dans l'onglet « Rattachement Cap NCHUG » (illisible sans la clé). La réa continue de fonctionner normalement.
2. **Partage** (depuis le compte de la réa) : partagez avec le compte dédié Cap NCHUG, en **éditeur**, le Google Sheets « Base » et le dossier Drive qui contient le plan (`plan-donnees.json`) et les dossiers privés (newsletters, photos).
3. **Dans l'appli, Espace créateurs** (code super-administrateur) : « Rattacher un service existant » : lien du Google Sheets, identifiant `rea`, nom, clé. En 20 secondes, la réa apparaît dans la liste des services, avec son lien et son QR code. Si un fichier Drive n'est pas accessible, un avertissement le dit : complétez le partage, rien d'autre à refaire.
4. **Sur GitHub, `docs/js/config.js`** : remplacez le bloc par le second modèle indiqué en haut du fichier (`CAP_URL` + `SERVICE_HISTORIQUE: 'rea'`). Je peux le faire dès que vous me donnez l'adresse /exec de l'annuaire.

**Ce qui change pour les agents :** rien à installer. À la mise à jour de l'appli, les téléphones qui avaient déjà l'appli de la réa arrivent directement sur la réa ; chacun ressaisit **son code habituel**, une seule fois (codes admin, agents et référents inchangés). Badges, records et réservations restent sur le téléphone.

**Ce qui est repris :** codes (chiffrés), référents, compteurs du quiz et des jeux, calage GPS, repères du plan ; toutes les données du Google Sheets (plan modifié, visites, newsletters, quiz, jeux, souvenirs). Pour le Défi CHU : si l'annuaire n'a pas encore de questions, celles de la réa (avec leurs statuts) et sa vue du ciel sont reprises ; les scores de test ne le sont pas.

**L'ancien moteur** voit l'import et répond ensuite « service déplacé » (plus d'écriture en double). Retour arrière possible : « Annuler le rattachement à Cap NCHUG » dans le menu de la réa, et fermer la réa dans l'Espace créateurs.

**Points d'attention :**
- Les fichiers restent la propriété du compte de la réa : ne supprimez pas ce compte et ne retirez pas le partage.
- Les quotas du compte dédié couvrent désormais la réa aussi (voir l'estimation de la partie P).
- Pendant les quelques minutes entre l'étape 3 et l'étape 4, l'appli encore réglée sur l'ancien moteur affiche « service déplacé » : faites les deux étapes à la suite, hors des heures de pointe.

## Partie S – Lots 4, 5 et 2 (moteur 2.3.0)

Mise à jour : collez `Code.gs` 2.3.0, menu « 1. Installer / réparer la base » (réa) ou « Vérifier / réparer l'annuaire » (Cap NCHUG), puis « Nouvelle version » du déploiement. Les nouveaux onglets (« Escape game », « Documents et FAQ ») sont créés sans rien effacer.

**Lot 4 – contenus de départ et escape game**
- Un nouveau service reçoit des questions générales (sécurité, déménagement) et jamais celles du plan de la réa. Les questions du plan sont fabriquées automatiquement à partir de son propre plan.
- Escape game : les référents créent et modifient les missions dans l'appli (Quiz et jeux › Escape game › « Modifier les missions »), étape par étape : récit, choix, cases à cocher, remise dans l'ordre, toucher sur le plan. Une mission modifiée doit être rejouée et validée par un référent avant d'être visible des agents. La réa garde ses 4 missions ; les autres services partent de 3 missions générales.
- Bingo, nuage, jauge et paris restaient déjà modifiables (Quiz et jeux › Réglages des jeux).

**Lot 5 – contenus communs au CHU (Cap NCHUG)**
- Espace créateurs › « Modifier les contenus communs » : le super-admin et les créateurs publient actualités, newsletters et documents visibles dans tous les services (étiquette « CHU »). Un bandeau rappelle qu'on modifie les contenus communs ; « Quitter » ramène à l'Espace créateurs.
- Actualités : modifiables dans l'appli par les référents et l'administrateur (bouton « ✏️ Gérer » sur l'accueil), plus besoin du Google Sheets.
- Rubrique « Documents et FAQ » : questions-réponses et liens (https uniquement) par catégorie, avec recherche. Pas de données de santé ni de document confidentiel : des liens vers l'intranet ou des documents publics.
- Espace créateurs › « Tableau de bord » : services ouverts, services sans plan, nombre de référents, rubriques, participation au Défi. Uniquement des totaux par service.

**Lot 2 – personnaliser le service et importer son plan** (tuile 🎨 « Personnaliser le service », administrateur)
- Nom, message d'accueil, date J ; logo du service (réduit sur le téléphone, affiché à côté du logo du CHU qui reste inchangé) ; rubriques affichées sur l'accueil.
- Import du plan : choisissez le fichier `.json` ; l'appli affiche un aperçu et le contrôle (format, identifiants en double, formes, unités inconnues, chambres en double, chevauchements, pièces sans nom). Rien n'est enregistré tant qu'il reste une erreur. Le fichier est rangé dans le Drive privé du service. Les noms et pièces déjà modifiés suivent les pièces du nouveau plan.
- Sans unités ni couleurs (cas de la plupart des services), les jeux de couleurs disparaissent et « Où est… ? » apparaît.

**Format du fichier plan (pour les services) :**
```json
{ "viewBox": [0, 0, 1200, 700],
  "unites": { "a": { "nom": "Unité A", "couleur": "#e0670f" } },
  "pieces": [
    { "id": "C01", "type": "chambre", "chambre": "101", "unite": "a", "r": [50, 50, 170, 220] },
    { "id": "P01", "type": "piece", "nom": "Poste de soins", "d": "M300,0 L400,0 L400,90 L300,90 Z" } ] }
```
`unites` est facultatif. Chaque pièce a un `id` unique et une forme : rectangle `r` [x0, y0, x1, y1] ou contour `d` (M, L, H, V, Z). Types : `chambre`, `piece`, `couloir`, `circulation`, `technique`, `terrasse`.

## Partie T – Lot 3 : fabriquer son plan (appli 2.4.0, moteur inchangé)

Rien à coller dans Apps Script : seule l'appli change (mise à jour automatique). Dans la tuile 🎨 « Personnaliser le service » › Plan du service, trois façons de préparer le plan :

**1. Dessiner dans l'appli** (« ✏️ Dessiner le plan ») – sur ordinateur de préférence, possible sur tablette ou téléphone.
- Fond : une image (PNG, JPEG) ou un PDF du plan (1re page). Il reste sur l'appareil : il n'est jamais envoyé. On peut aussi dessiner sans fond (quadrillage) ou partir du plan actuel du service.
- 🪄 Baguette magique : touchez l'intérieur d'une pièce, le contour est tracé. Si elle déborde par une porte ouverte, augmentez « Fermer les ouvertures » ; « Tolérance des couleurs » pour les plans colorés ou scannés. Une pièce déjà tracée n'est jamais recouverte.
- ▭ Rectangle (glisser d'un coin à l'autre), ✏️ Forme libre (toucher chaque coin, « Angles droits » pour des murs bien droits), 👆 Choisir (nommer, type, n° de chambre, unité ; déplacer la pièce ou ses coins ; rendre rectangulaire ; dupliquer ; supprimer). ↶ Annuler.
- Unités et couleurs : facultatives.
- Le brouillon (sans le fond) est gardé sur l'appareil : on peut s'arrêter et reprendre.
- « Contrôler et importer » : le plan passe par le même contrôle qu'un fichier, puis « Enregistrer ce plan ».

**2. Faire convertir par Claude**, sur le compte Claude de chacun :
- « Télécharger le skill » (`plan-cap-nchug.zip`) : dans Claude, Paramètres › Fonctionnalités › Skills › ajouter le fichier .zip. Ensuite : « Convertis ce plan pour Cap NCHUG » avec le PDF ou la photo. Le skill détecte les pièces, lit les numéros et noms d'un PDF, vérifie le fichier avec les mêmes règles que l'appli et montre un aperçu avant de rendre `plan-donnees.json`.
- **Deux plans** : donnez à Claude le plan simplifié (numérotation des chambres) et le plan détaillé (utilisation des pièces). Le rendu garde les formes et les numéros du plan simplifié et y ajoute les utilisations lues sur le plan détaillé ; les deux plans sont recalés automatiquement grâce aux numéros de chambre communs (sinon par quelques repères). Les conflits (une pièce du plan simplifié qui en recouvre plusieurs du plan détaillé) sont signalés pour être tranchés.
- Sans skill : « Consigne à copier », à coller dans Claude avec le plan (ou les deux plans).
- Le plan reste dans la conversation Claude de la personne ; rien ne passe par GitHub.

**3. Importer un fichier** `.json` au format Cap NCHUG (partie S).

## Partie U – PDF dans Documents et FAQ, rubriques personnalisées (moteur 2.4.0, appli 2.6.0)

**Mise à jour :** collez `Code.gs` 2.4.0 dans le projet de l'annuaire Cap NCHUG **et** dans celui de la réa, puis « Nouvelle version » de chaque déploiement. Rien d'autre à faire : les nouvelles colonnes de « Documents et FAQ » et les onglets « Rubriques » (dans chaque service) et « Rubriques – Catalogue » (dans l'annuaire) se créent tout seuls, sans rien effacer. L'appli se met à jour automatiquement.

**PDF dans « Documents et FAQ »** (administrateur et référents)
- Dans « + Ajouter un document ou une question » (ou « Modifier »), champ « PDF (facultatif) ». Le PDF est converti en images sur l'appareil, comme une newsletter (16 pages et 40 Mo au plus), avec un aperçu. Son texte est extrait : la barre de recherche le trouve (« 🔎 trouvé dans le PDF »). Un PDF scanné n'a pas de texte : la recherche porte alors sur le titre et la réponse.
- Les agents voient « 📄 Lire le PDF (n pages) » : liseuse avec zoom, pages gardées pour la lecture sans réseau jusqu'à la déconnexion.
- Une fiche dont l'envoi du PDF a été interrompu reste invisible pour les agents (message « PDF incomplet » pour les référents) : la modifier et choisir à nouveau le PDF.
- Remplacer ou retirer le PDF, ou supprimer la fiche, met les images à la corbeille du Drive (dossier privé « Cap NCHUG – Documents PDF », créé au premier envoi).
- Fonctionne aussi dans les contenus communs (créateurs) et donc dans Infos générales.

**Rubriques personnalisées** (tuile 🎨 « Personnaliser le service » › « Mes rubriques », administrateur)
- « + Nouvelle rubrique » : nom, emoji, couleur de la charte, sous-rubriques (12 au plus, ordre réglable). Chaque rubrique devient une tuile sur l'accueil du service. 6 rubriques au plus par service (reprises comprises).
- Contenu : en ouvrant la tuile, l'administrateur et les référents ajoutent des fiches (titre, texte, lien, PDF) dans chaque sous-rubrique, avec la recherche en haut. Une sous-rubrique retirée : ses fiches passent dans « Autres ». Supprimer une rubrique supprime ses fiches et leurs PDF.
- « Rubriques des autres services » : la liste des rubriques créées ailleurs, avec le nom du service d'origine. « Ajouter à mon service » donne la structure (nom, sous-rubriques), vide, à remplir avec ses propres fiches. La structure suit automatiquement le service d'origine (renommage, sous-rubrique ajoutée). Si celui-ci supprime sa rubrique, les services qui l'ont reprise la gardent. « Retirer » enlève la tuile ; les fiches restent dans le Google Sheets et reviennent si on la reprend.
- Réservé aux services sur le moteur commun : tant que la réa a son propre moteur, elle crée ses rubriques mais ne voit pas celles des autres (et inversement) ni les rubriques communes.

**Rubriques communes** (Espace créateurs › « Modifier les contenus communs » › tuile 🗂️ « Rubriques communes »)
- Même fonctionnement ; elles s'affichent d'office dans tous les services et dans Infos générales, avec l'étiquette CHU, avant les rubriques du service. Les créateurs remplissent les fiches en ouvrant la tuile ; les services les lisent seulement.

## Partie V – Visite virtuelle : photos 360° (moteur 2.5.1, appli 2.7.1)

**Mise à jour :** collez `Code.gs` 2.5.1 dans le projet de la réa (et des autres services qui voudront la visite virtuelle plus tard), puis « Nouvelle version » du déploiement. Les deux nouveaux onglets « Street – Points » et « Street – Liens », et le paramètre « Visite virtuelle (activée) », se créent tout seuls (bouton « Installer / réparer la base »), sans rien effacer.

**Remplir « Street – Points »** (un point de prise de vue = une ligne) : `ID` (même numérotation que le plan : `E-01`, `C-02`…, `CH-301`, `L-01`), `Nom`, `Zone`, `ID photo (Drive)` et `ID vignette (Drive)` (identifiants des fichiers déposés dans le dossier Drive partagé « toute personne disposant du lien »), `ID illustration (Drive)` (laisser vide pour l'instant, réservé à la vue dessinée), `Cap initial` (`decalage_deg` du fichier de caps), `Date de prise de vue`, `Pris par`. « Street – Liens » peut rester vide : les flèches et points d'info se posent directement dans l'appli (voir plus bas). Pour la réa, les flèches entre points voisins ont été préremplies par calcul (plan + cap de chaque photo) ; elles se corrigent comme n'importe quelle flèche posée à la main.

**Activer la rubrique** (tuile 🎨 « Personnaliser le service », administrateur) : section « Visite virtuelle », cocher « Afficher la tuile « Visite virtuelle » ». Elle n'apparaît alors, dans « Plan du service », qu'en dessous de « Plan interactif ». Désactivée par défaut pour tout nouveau service.

**Poser les flèches et les points d'info** (référents et administrateur, directement dans la visionneuse) : bouton « Modifier les liens » en haut de la visite virtuelle, puis toucher la photo à l'endroit voulu → choisir « Flèche » (avec le point d'arrivée) ou « Point d'info » (avec un texte). Toucher un repère existant pour le modifier ou le « Retirer ». Les agents ne voient pas ce bouton.

**Si les photos ne s'affichent pas dans la visionneuse** (écran noir ou erreur de chargement) : le format d'image utilisé (`https://lh3.googleusercontent.com/d/ID=sTAILLE`) fonctionne pour un fichier Drive partagé « toute personne disposant du lien », sans être republié ailleurs — vérifié le 14/11/2026 avec les photos de la réa (image reçue depuis un autre site, en-têtes permissifs, taille demandée respectée). Si cela cessait de fonctionner, la solution de repli prévue (décision 4 du document de décisions) est de servir les photos depuis l'Apps Script plutôt que directement depuis Drive ; cela ne changerait que la fonction `urlDrive_()` de `docs/js/street.js`, rien d'autre.

**Si les flèches préremplies pointent toutes de travers** : elles sont calculées en supposant que le centre de chaque photo correspond à l'avant de la caméra (colonne `Cap initial`). Si elles sont toutes à l'opposé de la bonne direction, ajouter 50 à la colonne « Position horizontale » de « Street – Liens » (et retirer 100 au-delà de 100). Si elles sont toutes inversées gauche/droite, remplacer chaque valeur par 100 moins la valeur. Une flèche isolée qui tombe mal se corrige directement dans l'appli, c'est plus rapide.

**Mettre à jour la visionneuse 360°** (Photo Sphere Viewer, vendue dans `docs/vendor/photo-sphere-viewer/`, jamais chargée depuis un site extérieur) : voir `docs/vendor/photo-sphere-viewer/LISEZ-MOI.txt` pour la commande exacte (npm + esbuild), puis augmenter `VERSION` dans `sw.js`.

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Pas de connexion au serveur » alors que le réseau fonctionne | URL `/exec` erronée dans `config.js`, ou accès du déploiement différent de « Tout le monde » | Vérifier A5 et B3 |
| « L'application n'est pas encore installée » | Le menu Installer n'a pas été lancé | A3 |
| Tout le monde est déconnecté d'un coup | Quelqu'un a utilisé « Déconnecter tout le monde » | Ressaisir le code |
| « Trop d'essais incorrects » | Plus de 30 codes faux en 10 minutes (protection) | Attendre 5 minutes |
| La page GitHub affiche une erreur 404 | Pages pas encore activé, ou dossier différent de `/docs` | B4, attendre 2 minutes |
| Modification du Sheets invisible | Pas d'actualisation côté téléphone | Bouton **Actualiser** |
| Le menu Réa – Administration n'apparaît pas | Page non rechargée après collage du code | Recharger le Sheets |
| « Le plan n'est pas encore installé » | ID du fichier absent ou erroné dans Paramètres, ou autorisation Drive non donnée | F1 étape 2, puis F2 |

Les quotas gratuits de Google (dont 30 exécutions simultanées du moteur) suffisent largement pour 213 personnes : chaque ouverture de l'accueil ne prend qu'une fraction de seconde.
