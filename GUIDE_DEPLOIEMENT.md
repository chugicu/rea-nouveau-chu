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
