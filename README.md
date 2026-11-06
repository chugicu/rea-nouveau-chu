# Réa · Nouveau CHU

Application de préparation au déménagement du service de **Réanimation – USC** vers le nouveau CHU de la Guadeloupe (Belle-Plaine).

- Aucune donnée de santé, aucun compte Google demandé aux agents.
- Accès par code : code commun du service, code personnel pour chaque référent et pour l'administrateur.
- Installable sur téléphone, consultable hors ligne.

## Organisation

```
docs/            Application (hébergée par GitHub Pages)
  index.html
  css/app.css    Charte CHU 2026 + logo Réanimation Guadeloupe
  js/config.js   ← seul fichier à régler (URL du moteur)
  js/api.js      Échanges avec le moteur (et mode démonstration)
  js/app.js      Écrans
  js/plan.js     Module « Plan du service »
  sw.js          Fonctionnement hors ligne
apps-script/     Moteur (copie de référence, à coller dans Google Apps Script)
GUIDE_DEPLOIEMENT.md
```

## Avancement

| Étape | Contenu | État |
|---|---|---|
| 1 | Socle, connexion, accueil (compte à rebours, jauge, badges, actualités) | Livrée |
| 2 | Plan du service : texte ou icônes, vue par catégorie, recherche, hors ligne, désignation des pièces et couleurs par les référents | Livrée |
| 3 | Visites des locaux : créneaux, inscription, code de réservation, présence, badges « Visite faite » et « Plan exploré » | Livrée |
| 3.1 | Exports Excel/PDF des visiteurs, émargement, modification du plan (forme, ajout, retrait), plein écran, logo CHU | Livrée |
| 4 | Quiz | À venir |
| 5 | Simulations in situ | À venir |
| 6 | Documents, FAQ, « Je suis prêt(e) » | À venir |
| 7 | Espace référent et administration | À venir |

## Sécurité et confidentialité

- Codes stockés uniquement sous forme d'empreinte SHA-256 salée (propriétés du script, jamais dans le Sheets ni sur GitHub).
- Sessions par jeton signé (HMAC-SHA256), révocables globalement ou par référent.
- Protection contre les essais de codes en série.
- Dépôt public : aucun plan, code, numéro interne ou procédure ne doit y être déposé.

## Crédits

Polices Barlow et PT Sans : SIL Open Font License (licences dans `docs/assets/fonts`).
Logos : CHU de la Guadeloupe et Réanimation Guadeloupe, usage interne au service.
