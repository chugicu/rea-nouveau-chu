/* Réa – Nouveau CHU · scénarios de l'escape game (rédigés par Claude, À VALIDER PAR LES RÉFÉRENTS avant ouverture).
   Patients fictifs, aucune donnée réelle. Contenu général : à adapter aux procédures du service et du CHU.
   Types d'étapes : recit, choix (une bonne réponse), multi (cocher tout ce qui est juste), ordre (remettre dans l'ordre),
   plan (toucher sur le plan : équipement ou section ; étape sautée si l'élément n'est pas encore sur le plan). */
window.REA_ESCAPE = [
  {
    id: 'transfert-309', ic: '🛏️', titre: 'Transfert du lit 309', duree: '10 min',
    resume: 'Jour J, 7 h 30. Vous êtes chargé(e) du transfert de M. Fictif, 58 ans, intubé-ventilé, du lit 9 de l\'ancien service vers la chambre 309 de Bougainvillier.',
    etapes: [
      { type: 'recit', texte: 'Le brancardier arrive dans 20 minutes. Le médecin a validé le transfert. Il faut tout préparer : rien ne doit manquer pendant les 10 km du trajet.' },
      { type: 'multi', question: 'Que vérifiez-vous sur le patient avant de partir ? (cochez tout ce qui est utile)',
        items: [{ t: 'Fixation de la sonde d\'intubation et repère noté', ok: true }, { t: 'Voies veineuses fixées et perméables', ok: true }, { t: 'Seringues en cours : autonomie suffisante pour le trajet', ok: true },
          { t: 'Sédation adaptée au transport', ok: true }, { t: 'Changer le pansement de la voie centrale', ok: false }, { t: 'Faire la toilette complète', ok: false }],
        indice: 'Pensez à tout ce qui pourrait se débrancher ou s\'arrêter pendant le trajet.',
        explication: 'Avant un transport : sécuriser les accès (sonde, voies, drains) et l\'autonomie des traitements. Les soins non urgents attendent l\'arrivée.' },
      { type: 'choix', question: 'La bouteille d\'oxygène de transport affiche une pression basse. Que faites-vous ?',
        choix: ['Je la remplace et je vérifie que l\'autonomie couvre tout le trajet, avec une marge', 'Je pars quand même, le trajet est court', 'Je baisse la FiO2 pour économiser l\'oxygène'], bonne: 0,
        indice: 'Un bouchon sur la route, et le trajet double.',
        explication: 'L\'autonomie en oxygène se calcule pour la durée prévue du trajet, avec une marge pour les imprévus.' },
      { type: 'multi', question: 'Qu\'emportez-vous dans le sac de transport ? (cochez tout ce qui est utile)',
        items: [{ t: 'Ballon auto-remplisseur à valve unidirectionnelle (BAVU) avec masque', ok: true }, { t: 'Aspiration portable', ok: true }, { t: 'Médicaments d\'urgence prévus par le protocole', ok: true },
          { t: 'Dossier et prescriptions du patient', ok: true }, { t: 'Le chariot d\'urgence du service', ok: false }, { t: 'Les effets personnels non inventoriés', ok: false }],
        indice: 'Le chariot d\'urgence reste dans le service pour les autres patients.',
        explication: 'Le sac de transport doit permettre de ventiler, aspirer et traiter une urgence pendant le trajet. Le chariot d\'urgence ne quitte pas le service.' },
      { type: 'ordre', question: 'Remettez les étapes du départ dans l\'ordre.',
        items: ['Annoncer le départ à l\'équipe d\'accueil', 'Brancher le patient sur le respirateur et le moniteur de transport', 'Vérifier les paramètres et l\'état du patient sur le matériel de transport', 'Installer le patient dans l\'ambulance et partir'],
        indice: 'On ne bouge pas le patient avant d\'avoir vérifié qu\'il est stable sur le matériel de transport.',
        explication: 'Prévenir l\'accueil, passer sur le matériel de transport, vérifier la stabilité, puis seulement partir.' },
      { type: 'plan', question: 'Vous arrivez au nouveau service. Touchez sur le plan la chambre d\'accueil du patient.', cible: { chambre: '309' },
        indice: 'Bougainvillier : chambres 309 à 317.', explication: 'La 309 est la première chambre de Bougainvillier.' },
      { type: 'choix', question: 'Dans la chambre 309, par quoi commencez-vous ?',
        choix: ['Brancher le patient sur le respirateur et le moniteur fixes, puis vérifier ses paramètres', 'Ranger les affaires du patient', 'Remplir la feuille de transfert'], bonne: 0,
        indice: 'Le patient d\'abord, le papier ensuite.',
        explication: 'Priorité au patient : ventilation et surveillance fixes, vérification, puis transmissions et rangement.' },
      { type: 'recit', texte: 'Transfert réussi ! M. Fictif est installé et stable en 309. Pensez à signaler la fin du transfert à la cellule de coordination.' }
    ]
  },
  {
    id: 'incident-trajet', ic: '🚑', titre: 'Incident pendant le trajet', duree: '8 min',
    resume: 'Vous accompagnez Mme Exemple, 71 ans, sous noradrénaline et oxygène, dans l\'ambulance vers le nouveau CHU. Tout se passe bien… jusqu\'ici.',
    etapes: [
      { type: 'recit', texte: 'À mi-chemin, le moniteur affiche une saturation qui baisse : 89 %… 86 %…' },
      { type: 'multi', question: 'Désaturation pendant le trajet : que vérifiez-vous en premier ? (cochez tout ce qui est utile)',
        items: [{ t: 'Le capteur de saturation est bien en place', ok: true }, { t: 'L\'arrivée d\'oxygène : bouteille ouverte, tuyau branché, débit', ok: true }, { t: 'L\'état clinique de la patiente', ok: true },
          { t: 'Le niveau de batterie du téléphone', ok: false }, { t: 'L\'heure d\'arrivée prévue', ok: false }],
        indice: 'Du plus simple au plus grave : le capteur, le circuit, la patiente.',
        explication: 'Devant une alarme : vérifier le patient et le matériel (capteur, source et circuit d\'oxygène) avant tout.' },
      { type: 'choix', question: 'La pousse-seringue de noradrénaline sonne : « batterie faible ». Que faites-vous ?',
        choix: ['Je la branche sur le secteur de l\'ambulance ou je prépare le relais prévu', 'Je l\'arrête pour économiser la batterie', 'J\'attends l\'arrivée : il reste 10 minutes'], bonne: 0,
        indice: 'Un arrêt de noradrénaline, même court, peut faire chuter la tension.',
        explication: 'Les traitements vitaux ne s\'interrompent pas : branchement sur le secteur du véhicule ou relais préparé avant le départ.' },
      { type: 'choix', question: 'Arrivée au nouveau CHU : l\'ascenseur est bloqué entre deux étages, avec vous et la patiente dedans. Première action ?',
        choix: ['Appuyer sur le bouton d\'alarme de l\'ascenseur et prévenir le service par téléphone', 'Forcer les portes', 'Attendre sans rien dire'], bonne: 0,
        indice: 'Il existe un bouton prévu pour cela.',
        explication: 'Alarme de l\'ascenseur et appel au service : l\'équipe technique intervient et le service se prépare. On continue la surveillance.' },
      { type: 'multi', question: 'En attendant le dépannage, que surveillez-vous ? (cochez tout ce qui est utile)',
        items: [{ t: 'L\'autonomie de la bouteille d\'oxygène', ok: true }, { t: 'La batterie du moniteur et des pousse-seringues', ok: true }, { t: 'Les paramètres de la patiente', ok: true }, { t: 'Rien : l\'ascenseur va repartir', ok: false }],
        indice: 'Chaque minute bloquée consomme de l\'oxygène et de la batterie.',
        explication: 'Un blocage prolongé épuise oxygène et batteries : on les surveille et on prévient l\'équipe de leur autonomie restante.' },
      { type: 'recit', texte: 'L\'ascenseur repart. Mme Exemple arrive stable dans le service. Bravo : sang-froid et méthode !' }
    ]
  },
  {
    id: 'premiere-garde', ic: '🌙', titre: 'Première garde dans les nouveaux locaux', duree: '10 min',
    resume: 'Première nuit dans le nouveau service. Vous êtes de garde, et tout est encore nouveau. Retrouvez vos repères avant qu\'on ait besoin de vous.',
    etapes: [
      { type: 'recit', texte: '21 h. Avant que la nuit ne commence vraiment, vous faites le tour du service pour repérer l\'essentiel.' },
      { type: 'plan', question: 'Touchez le chariot d\'urgence le plus proche de la chambre 318.', cible: { point: 'chariot', proche: '318' },
        indice: 'Regardez dans le couloir, près du poste de soins d\'Hibiscus.', explication: 'Le chariot d\'urgence le plus proche est entouré : retenez sa place, c\'est votre premier repère.' },
      { type: 'plan', question: 'Une perfusion manque : touchez la pharmacie du service.', cible: { section: 'pharmacie' },
        indice: 'Utilisez le plan de l\'appli : section Pharmacie.', explication: 'La pharmacie est entourée en vert.' },
      { type: 'plan', question: 'Touchez un poste de soins.', cible: { section: 'poste' },
        indice: 'Les postes de soins sont au cœur de chaque unité.', explication: 'Les postes de soins sont entourés en vert.' },
      { type: 'choix', question: '2 h du matin : coupure d\'électricité, les lumières s\'éteignent. Que se passe-t-il pour les respirateurs ?',
        choix: ['Ils continuent sur leur batterie, puis le groupe électrogène prend le relais sur les prises secourues', 'Ils s\'arrêtent immédiatement', 'Il faut tous les débrancher'], bonne: 0,
        indice: 'Les équipements vitaux sont branchés sur des prises spéciales.',
        explication: 'Respirateurs et équipements vitaux sont branchés sur les prises secourues (repérées par leur couleur) et ont une batterie. Vérifiez les prises de chaque chambre dès le premier jour.' },
      { type: 'multi', question: 'Pendant la coupure, que vérifiez-vous ? (cochez tout ce qui est utile)',
        items: [{ t: 'Que chaque respirateur fonctionne et affiche sa source d\'alimentation', ok: true }, { t: 'Les pousse-seringues et leur batterie', ok: true }, { t: 'L\'éclairage de secours et une lampe de poche', ok: true },
          { t: 'Les patients un par un, en commençant par les plus graves', ok: true }, { t: 'Redémarrer tous les ordinateurs', ok: false }],
        indice: 'Équipements vitaux et patients d\'abord.',
        explication: 'Vérifier les équipements vitaux, les batteries et les patients ; prévenir l\'astreinte technique selon la procédure.' },
      { type: 'recit', texte: 'Le courant revient à 2 h 07. Grâce à vos repères, tout s\'est passé dans le calme. Bonne fin de garde !' }
    ]
  },
  {
    id: 'alarme-incendie', ic: '🔥', titre: 'Alarme incendie', duree: '8 min',
    resume: 'Une alarme incendie retentit dans le nouveau service, en pleine journée. Fumée signalée dans un local de l\'unité Hibiscus.',
    etapes: [
      { type: 'ordre', question: 'Remettez les premiers gestes dans l\'ordre.',
        items: ['Donner l\'alerte selon la procédure du CHU', 'Mettre à l\'abri les personnes les plus menacées', 'Fermer les portes pour confiner la fumée', 'Attaquer le feu avec un extincteur si c\'est sans risque'],
        indice: 'Alerter d\'abord : personne ne doit lutter seul sans que les secours soient prévenus.',
        explication: 'Alerter, protéger, confiner, puis attaquer le feu seulement si c\'est sans danger (à adapter aux consignes incendie du CHU).' },
      { type: 'choix', question: 'Pour mettre à l\'abri des patients ventilés, que fait-on en priorité ?',
        choix: ['Une évacuation horizontale vers une zone protégée du même étage', 'Descendre les patients par l\'ascenseur', 'Les sortir sur le parking'], bonne: 0,
        indice: 'On reste au même étage, derrière des portes coupe-feu.',
        explication: 'En réanimation, on privilégie l\'évacuation horizontale vers une zone protégée, au même niveau. Jamais d\'ascenseur sans consigne des secours.' },
      { type: 'choix', question: 'Le feu touche une zone avec des prises d\'oxygène murales. Qui décide de fermer les vannes de coupure des fluides ?',
        choix: ['Selon la procédure : sur décision du responsable désigné, après avoir prévu l\'oxygène de relais des patients', 'Le premier qui passe', 'Personne : on ne les ferme jamais'], bonne: 0,
        indice: 'Fermer l\'oxygène prive aussi les patients de la zone.',
        explication: 'Fermer une vanne coupe l\'oxygène de tout un secteur : la décision suit la procédure et des bouteilles de relais doivent être prêtes.' },
      { type: 'plan', question: 'Touchez un poste de soins : c\'est là que l\'équipe se regroupe pour faire le point.', cible: { section: 'poste' },
        indice: 'Le cœur de l\'unité.', explication: 'Le poste de soins est le point de ralliement : on y fait le compte des patients et des soignants.' },
      { type: 'multi', question: 'Une fois les patients à l\'abri, que faites-vous ? (cochez tout ce qui est utile)',
        items: [{ t: 'Compter les patients et les soignants', ok: true }, { t: 'Surveiller les patients déplacés', ok: true }, { t: 'Transmettre la situation aux secours à leur arrivée', ok: true }, { t: 'Retourner chercher des affaires dans la zone enfumée', ok: false }],
        indice: 'On ne retourne jamais dans la fumée.',
        explication: 'Compter, surveiller, informer les secours. On ne retourne jamais dans une zone enfumée.' },
      { type: 'recit', texte: 'Les pompiers maîtrisent le départ de feu. Tout le monde est sain et sauf. Retenez : alerter, protéger, confiner.' }
    ]
  }
];

/* Cap NCHUG · missions de départ des autres services (générales : à adapter par les référents dans l'appli). */
window.REA_ESCAPE_MODELES = [
  {
    id: 'jour-j', ic: '📦', titre: 'Jour J : on déménage', duree: '8 min',
    resume: 'Le grand jour est arrivé. Votre équipe déménage ce matin vers le nouveau CHU. Tout doit être prêt, rien ne doit être oublié.',
    etapes: [
      { type: 'recit', texte: '6 h 45. Les cartons sont étiquetés, les déménageurs arrivent à 8 h. Dernières vérifications avant le départ.' },
      { type: 'multi', question: 'Que vérifiez-vous avant le départ des cartons ? (cochez tout ce qui est utile)',
        items: [{ t: 'Chaque carton porte la destination (pièce) du nouveau service', ok: true }, { t: 'Les documents confidentiels sont dans des contenants fermés', ok: true }, { t: 'Le matériel indispensable du premier jour est dans un carton « à ouvrir en premier »', ok: true }, { t: 'Les issues de secours sont encombrées pour gagner de la place', ok: false }],
        indice: 'Pensez à ce dont vous aurez besoin dès l\'arrivée… et à ce qui ne doit jamais traîner.',
        explication: 'Étiqueter, protéger la confidentialité, prévoir le « kit du premier jour », et ne jamais encombrer les issues de secours.' },
      { type: 'ordre', question: 'Remettez l\'arrivée dans le nouveau service dans l\'ordre.',
        items: ['Repérer les issues de secours et le matériel d\'urgence du secteur', 'Vérifier que les cartons sont arrivés dans les bonnes pièces', 'Installer le matériel indispensable du premier jour', 'Ranger le reste au fil de la semaine'],
        indice: 'La sécurité d\'abord, le rangement en dernier.', explication: 'Se repérer pour la sécurité, vérifier, installer l\'essentiel, puis ranger.' },
      { type: 'choix', question: 'Un carton manque à l\'arrivée. Que faites-vous ?',
        choix: ['Je le signale à la personne qui coordonne le déménagement, avec son étiquette', 'Je pars le chercher seul dans l\'ancien bâtiment', 'Je laisse tomber'], bonne: 0,
        indice: 'Quelqu\'un a la liste de tous les cartons.', explication: 'La coordination du déménagement suit chaque carton : signaler avec la référence permet de le retrouver vite.' },
      { type: 'recit', texte: 'Fin de journée : tout est arrivé, l\'essentiel est installé. Bravo à toute l\'équipe !' }
    ]
  },
  {
    id: 'premiers-reperes', ic: '🧭', titre: 'Premiers repères', duree: '6 min',
    resume: 'Premier jour dans le nouveau service. Avant que la journée ne s\'accélère, retrouvez l\'essentiel.',
    etapes: [
      { type: 'recit', texte: 'Vous arrivez un peu en avance. Le service est encore calme : c\'est le moment de faire le tour.' },
      { type: 'plan', question: 'Touchez sur le plan le chariot d\'urgence le plus proche.', cible: { point: 'chariot' },
        indice: 'Utilisez le plan de l\'appli : les équipements y sont signalés.', explication: 'Retenez sa place : c\'est votre premier repère en cas d\'urgence.' },
      { type: 'multi', question: 'Que repérez-vous en priorité dans votre secteur ? (cochez tout ce qui est utile)',
        items: [{ t: 'Les issues de secours et le plan d\'évacuation', ok: true }, { t: 'Le chariot d\'urgence et le défibrillateur', ok: true }, { t: 'Les extincteurs et le déclencheur d\'alarme', ok: true }, { t: 'La machine à café', ok: false }],
        indice: 'Ce dont vous auriez besoin en cas d\'urgence.', explication: 'Sécurité d\'abord : issues, urgence vitale, incendie.' },
      { type: 'choix', question: 'Un collègue d\'un autre service cherche son chemin. Que faites-vous ?',
        choix: ['Je l\'aide avec le plan de l\'appli ou la signalétique (N° de la rue intérieure, niveau)', 'Je lui dis de demander à l\'accueil', 'Je fais semblant de ne pas le voir'], bonne: 0,
        indice: 'Les numéros d\'entrée et les niveaux sont faits pour ça.', explication: 'S\'entraider à se repérer fait gagner du temps à tout le monde les premières semaines.' },
      { type: 'recit', texte: 'Vos repères sont pris. Bonne première journée dans le nouveau CHU !' }
    ]
  },
  {
    id: 'alarme-incendie', ic: '🔥', titre: 'Alarme incendie', duree: '6 min',
    resume: 'Une alarme incendie retentit dans le nouveau service. De la fumée est signalée dans un local.',
    etapes: [
      { type: 'ordre', question: 'Remettez les premiers gestes dans l\'ordre.',
        items: ['Donner l\'alerte selon la procédure du CHU', 'Mettre à l\'abri les personnes les plus menacées', 'Fermer les portes pour confiner la fumée', 'Attaquer le feu avec un extincteur si c\'est sans risque'],
        indice: 'Alerter d\'abord : personne ne doit lutter seul sans que les secours soient prévenus.',
        explication: 'Alerter, protéger, confiner, puis attaquer le feu seulement si c\'est sans danger (à adapter aux consignes incendie du CHU).' },
      { type: 'choix', question: 'Peut-on prendre l\'ascenseur pour évacuer ?',
        choix: ['Non, sauf consigne contraire des secours', 'Oui, c\'est plus rapide', 'Oui, s\'il n\'y a pas de fumée dans le couloir'], bonne: 0,
        indice: 'Un ascenseur peut s\'arrêter à l\'étage du feu.', explication: 'On n\'utilise pas les ascenseurs en cas d\'incendie, sauf consigne des secours.' },
      { type: 'multi', question: 'Une fois à l\'abri, que faites-vous ? (cochez tout ce qui est utile)',
        items: [{ t: 'Compter les personnes présentes', ok: true }, { t: 'Informer les secours à leur arrivée', ok: true }, { t: 'Retourner chercher ses affaires', ok: false }],
        indice: 'On ne retourne jamais dans la fumée.', explication: 'Compter, informer les secours, ne jamais retourner dans une zone enfumée.' },
      { type: 'recit', texte: 'Les secours maîtrisent la situation. Retenez : alerter, protéger, confiner.' }
    ]
  }
];
