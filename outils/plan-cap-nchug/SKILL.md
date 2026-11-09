---
name: plan-cap-nchug
description: Convertit le plan d'un service hospitalier (PDF, image ou photo) en fichier plan-donnees.json au format Cap NCHUG, prêt à importer dans l'appli. Accepte deux plans : un simplifié (formes, numéros de chambres) et un détaillé (utilisation des pièces), fusionnés. À utiliser pour convertir, numériser ou fusionner des plans de service pour Cap NCHUG.
---

# Plan de service → fichier Cap NCHUG

Tu aides l'administrateur d'un service du CHU à transformer son plan (PDF, capture, photo) en un fichier
`plan-donnees.json` que l'appli Cap NCHUG sait importer. L'appli contrôle le fichier à l'import ; ton
travail est de lui donner un fichier propre du premier coup.

## Règles à respecter

- **Confidentialité** : le plan reste dans cette conversation. Ne le publie nulle part (pas de lien, pas
  d'artifact public, pas de dépôt GitHub). Le seul livrable est le fichier `.json` (et un aperçu en image).
- **Aucune donnée de santé ni nom de personne** : uniquement des pièces (numéros de chambre, noms de locaux
  comme « Poste de soins », « Pharmacie »). Si le plan porte des noms de patients ou d'agents, ignore-les.
- **Pas d'invention** : une pièce dont tu ne lis pas le nom reste sans nom (l'appli permet de la nommer
  ensuite). Dis-le dans ton résumé plutôt que de deviner.

## Format du fichier

```json
{
  "viewBox": [0, 0, 1600, 900],
  "unites": { "a": { "nom": "Unité A", "couleur": "#e0670f" } },
  "pieces": [
    { "id": "C001", "type": "chambre", "chambre": "101", "unite": "a", "r": [50, 50, 170, 220] },
    { "id": "P001", "type": "piece", "nom": "Poste de soins", "d": "M300,0 L400,0 L400,90 L300,90 Z" }
  ]
}
```

- `viewBox` : `[0, 0, largeur, hauteur]` dans les unités de tes coordonnées (en pratique les pixels de
  l'image du plan, ramenée à 1600 px de grand côté).
- `pieces` : chaque pièce a un `id` **unique** (lettres, chiffres, `-`, `_` ; ex. `C001` pour les chambres,
  `P001` pour les autres) et **une** forme :
  - `r` : rectangle `[x0, y0, x1, y1]` avec `x1 > x0` et `y1 > y0` (à préférer dès que la pièce est rectangulaire) ;
  - `d` : contour polygonal avec seulement `M`, `L`, `H`, `V` et un `Z` final.
- `type` : `chambre` (avec `chambre` = son numéro, en texte), `piece`, `couloir`, `circulation`
  (escalier, ascenseur), `technique`, `terrasse`.
- `nom` : facultatif pour une chambre, conseillé pour les autres pièces.
- `unites` : **facultatif**. Seulement si le service est vraiment découpé en unités de couleur (couleur
  `#RRGGBB`). La plupart des services n'en ont pas : n'en crée pas sans raison. Si une pièce a `unite`,
  la clé doit exister dans `unites`.
- Les pièces ne doivent pas se chevaucher et doivent rester dans le cadre `viewBox`.

## Deux plans : simplifié + détaillé (cas fréquent)

Souvent, le service a **deux plans** du même étage :
- un **plan simplifié**, lisible, avec la **numérotation des chambres** mais sans détail sur les autres pièces ;
- un **plan détaillé** (plan d'architecte), trop chargé pour l'appli, mais qui indique **l'utilisation de
  chaque pièce** (Poste de soins, Pharmacie, Vestiaires…).

Le rendu attendu est **le plan simplifié** (ses formes, ses numéros de chambre) **+ les utilisations lues
sur le plan détaillé**. Ne reprends jamais les formes du plan détaillé. Demande à la personne lequel est
lequel si ce n'est pas évident. Méthode :

1. Fais les étapes 2 à 4 ci-dessous **sur le plan simplifié seulement** → `brouillon.json` relu
   (chambres numérotées, autres pièces sans nom, couloirs).
2. Récupère les textes du plan détaillé :
   - PDF vectoriel : rien à faire, le script les lit (`--detaille-pdf`) ;
   - image ou scan : lis le plan et écris `etiquettes.json` : `[{"texte": "Poste de soins", "x": 812, "y": 455}, …]`
     (x, y = centre du texte, en pixels de l'image du plan détaillé ; n'oublie pas les numéros de chambre
     visibles, ils servent au recalage).
3. Lance la fusion :
   `python scripts/fusionner_plans.py --brouillon brouillon.json --detaille-pdf detaille.pdf --simplifie simple-1.png --sortie plan-donnees.json --apercu fusion.png`
   - le **recalage** (échelle, décalage, rotation entre les deux plans) se fait tout seul grâce aux numéros
     de chambre présents sur les deux plans (3 au moins) ;
   - sinon, donne 2 à 4 repères communs (angles du bâtiment, cage d'escalier) dans `reperes.json` :
     `[{"detaille": [x, y], "simplifie": [x, y]}, …]` et ajoute `--reperes reperes.json` ;
   - en dernier recours `--cadre --detaille detaille.png` aligne les contours extérieurs (approximatif).
4. Lis le rapport : précision du recalage (écart en px), pièces nommées, **conflits** (une pièce du plan
   simplifié qui couvre plusieurs pièces du plan détaillé : demande à la personne quel nom garder),
   chambres portant une autre utilisation sur le plan détaillé, textes hors des pièces, pièces restées
   sans nom. Regarde `fusion.png` (points rouges = textes du plan détaillé recalés) : s'ils tombent à côté
   des pièces, le recalage est faux → repères à la main.
5. Termine par l'étape 5 (vérification) et l'étape 6 (livraison) ci-dessous.

## Méthode

1. **Regarde le plan** et fais l'inventaire : combien d'étages ou de zones ? Si le document en a
   plusieurs, demande lequel convertir (un fichier par plan). Repère les numéros de chambres, les noms des
   locaux, les couloirs.
2. **Mets le plan en image** si c'est un PDF :
   `pdftoppm -png -r 150 -f 1 -l 1 plan.pdf page` (puis réduis à 1600 px de grand côté).
   Pour un PDF vectoriel, récupère aussi les textes et leur position (`pdfplumber`) : ils donnent les noms
   et numéros des pièces au bon endroit.
3. **Détecte les pièces** avec `scripts/extraire_pieces.py` (zones claires fermées par des murs foncés) :
   `python scripts/extraire_pieces.py page-1.png --pdf plan.pdf --sortie brouillon.json`
   - `--fermer 3` ferme les ouvertures de porte jusqu'à 3 px (augmente si des pièces fusionnent avec le couloir) ;
   - le script range les textes du PDF dans les pièces qui les contiennent (numéro → chambre, sinon nom).
   Pour une photo de travers ou un plan très chargé, trace les pièces toi-même en lisant les
   coordonnées sur l'image (grille de repères dessinée avec PIL si besoin).
4. **Corrige le brouillon** : supprime les zones parasites (légendes, cartouche, textes), fusionne ou
   découpe ce qui doit l'être, mets les bons `type`, `nom`, `chambre`. Les grandes zones allongées sont en
   général des couloirs (`couloir`).
5. **Vérifie** avec `scripts/verifier_plan.py plan-donnees.json --apercu apercu.png` : le script applique
   les mêmes contrôles que l'appli (erreurs bloquantes, points à vérifier) et dessine un aperçu par-dessus
   le plan d'origine (`--fond page-1.png`). Corrige jusqu'à **zéro erreur**. Montre l'aperçu à la
   personne et demande-lui de confirmer.
6. **Livre** `plan-donnees.json` avec un résumé court : nombre de pièces, de chambres, pièces sans nom,
   points à vérifier. Rappelle comment l'importer : appli Cap NCHUG › tuile « Personnaliser le service »
   › « 3. Importer un fichier ». Les noms modifiés ensuite dans l'appli sont conservés si on réimporte un
   plan corrigé.

## Pièges fréquents

- Coordonnées mélangées (`[x, y, largeur, hauteur]` au lieu de `[x0, y0, x1, y1]`) : le vérificateur le voit.
- Identifiants en double après une fusion ou un copier-coller.
- Numéros de chambre en nombre (`101`) au lieu de texte (`"101"`) : accepté, mais garde du texte pour `"101 bis"`.
- Légende et cartouche du plan détectés comme des pièces : supprime-les.
- Chambres doubles coupées en deux par une cloison légère : une seule pièce si c'est une seule chambre.
- Deux plans : surfaces (« 12,5 m² »), cotes, « Lit », codes de porte du plan détaillé ne sont pas des
  utilisations ; le script les ignore, ne les remets pas à la main.
