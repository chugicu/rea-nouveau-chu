/* Réglage unique à modifier après le déploiement du moteur Apps Script.
   Collez ici l'URL de l'application web (elle se termine par /exec).
   Tant que ce champ est vide, l'application tourne en MODE DÉMONSTRATION
   (données fictives, codes : DEMO pour un agent, REFDEMO pour un référent, ADMDEMO pour l'administrateur). */
/* Cap NCHUG (plusieurs services) : quand le moteur commun est installé sur le compte dédié, remplacer le bloc
   ci-dessous par (voir GUIDE_DEPLOIEMENT.md, partie P) :
   window.REA_CONFIG = {
     CAP_URL: 'https://script.google.com/macros/s/…/exec',          // moteur commun Cap NCHUG
     SERVICES_EXTERNES: [                                           // services qui gardent leur propre moteur
       { id: 'rea', nom: 'Réanimation – USC', api: 'https://script.google.com/macros/s/AKfycbxqk…/exec' }
     ]
   };
   Après le rattachement de la réa au moteur commun (partie R du guide) :
   window.REA_CONFIG = {
     CAP_URL: 'https://script.google.com/macros/s/…/exec',
     SERVICE_HISTORIQUE: 'rea'      // les téléphones qui avaient déjà l'appli de la réa y retournent directement
   };
   CAP_URL: '' (vide) = démonstration de Cap NCHUG (codes SUPDEMO, CREADEMO, puis DEMO / REFDEMO / ADMDEMO). */
window.REA_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxqk5SwM37-xiTwznTS0vaAmo9naC_MwyjjzID1ie_LTcnY713BZYIIpfAf0bb6IAug/exec'
};
