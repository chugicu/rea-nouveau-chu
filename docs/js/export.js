/* Réa – Nouveau CHU · exports des visites (référents et administrateur)
   - Excel (.xlsx) : feuille « Visiteurs » + feuille « Créneaux »
   - PDF : liste des visiteurs, ou feuille d'émargement d'un créneau
   Les bibliothèques (SheetJS, jsPDF) sont hébergées dans l'appli (dossier vendor) et chargées seulement au premier export :
   aucune donnée n'est envoyée à un service extérieur. */
(function () {
  'use strict';
  var charges = {};
  function charger(src) {
    if (!charges[src]) charges[src] = new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = ok; s.onerror = function () { delete charges[src]; ko(new Error('chargement')); };
      document.head.appendChild(s);
    });
    return charges[src];
  }
  function dateFr(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  function dateLongue(iso) {
    var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12));
    var t = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function fin(heure, duree) { var m = (+heure.slice(0, 2)) * 60 + (+heure.slice(3, 5)) + (Number(duree) || 0); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function aujourdhui() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function trier(l) { return l.slice().sort(function (a, b) { return (a.date + a.heure) < (b.date + b.heure) ? -1 : 1; }); }
  function triInscrits(l) { return (l || []).slice().sort(function (a, b) { return (a.prenom + a.initiale).localeCompare(b.prenom + b.initiale, 'fr'); }); }

  /* ---------- Excel ---------- */
  function excel(creneaux) {
    return charger('vendor/xlsx.mini.min.js').then(function () {
      var X = window.XLSX, lignes = [], resume = [];
      trier(creneaux).forEach(function (c) {
        var l = triInscrits(c.liste);
        resume.push({ 'Date': dateFr(c.date), 'Heure': c.heure, 'Fin': fin(c.heure, c.duree), 'Durée (min)': c.duree, 'Lieu de rendez-vous': c.lieu, 'Guide': c.guide,
          'Places': c.places, 'Inscrits': l.length, 'Présents': l.filter(function (x) { return x.present; }).length, 'Statut': c.statut === 'annulé' ? 'Annulé' : 'Ouvert' });
        l.forEach(function (x) {
          lignes.push({ 'Date': dateFr(c.date), 'Heure': c.heure, 'Fin': fin(c.heure, c.duree), 'Lieu de rendez-vous': c.lieu, 'Guide': c.guide,
            'Prénom': x.prenom, 'Initiale du nom': x.initiale, 'Fonction': x.fonction, 'Présent': x.present ? 'Oui' : 'Non' });
        });
      });
      var wb = X.utils.book_new();
      var f1 = X.utils.json_to_sheet(lignes.length ? lignes : [{ 'Date': '', 'Prénom': 'Aucun inscrit' }]);
      f1['!cols'] = [12, 8, 8, 32, 20, 16, 14, 16, 9].map(function (w) { return { wch: w }; });
      var f2 = X.utils.json_to_sheet(resume);
      f2['!cols'] = [12, 8, 8, 11, 32, 20, 8, 9, 9, 9].map(function (w) { return { wch: w }; });
      X.utils.book_append_sheet(wb, f1, 'Visiteurs');
      X.utils.book_append_sheet(wb, f2, 'Créneaux');
      wb.Props = { Title: 'Visites des locaux – Réanimation', Author: 'Réa – Nouveau CHU' };
      X.writeFile(wb, 'visites-reanimation-' + aujourdhui() + '.xlsx');
    });
  }

  /* ---------- PDF ---------- */
  function imageEnDonnees(src) { // logo → PNG (proportions d'origine conservées, aucune modification)
    return new Promise(function (ok) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        ok({ data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
      };
      img.onerror = function () { ok(null); };
      img.src = src;
    });
  }
  function entete(doc, logos, titre, sousTitre) {
    var y = 12, x = 14;
    logos.forEach(function (l) { // hauteur fixe, largeur proportionnelle : le logo n'est jamais déformé
      if (!l) return; var h = 16, w = h * l.w / l.h;
      doc.addImage(l.data, 'PNG', x, y, w, h); x += w + 8;
    });
    doc.setTextColor(34, 59, 128); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(titre, 14, 40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(76, 90, 122);
    doc.text(sousTitre, 14, 46);
    return 52;
  }
  function piedDePage(doc) {
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120, 130, 150);
      doc.text(doc.splitTextToSize('Données personnelles : usage interne au service, à détruire après usage. Effacées de l\'application 30 jours après le déménagement.', 160), 14, 286);
      doc.text(i + ' / ' + n, 196, 289, { align: 'right' });
    }
  }
  var COULEUR_TETE = [34, 59, 128];
  function pdf(creneaux, options) {
    options = options || {};
    return Promise.all([charger('vendor/jspdf.umd.min.js').then(function () { return charger('vendor/jspdf.plugin.autotable.min.js'); }),
      imageEnDonnees('assets/logos/chu-guadeloupe.png'), imageEnDonnees('assets/logos/reanimation-guadeloupe.png')]).then(function (t) {
      var jsPDF = window.jspdf.jsPDF, doc = new jsPDF({ unit: 'mm', format: 'a4' }), logos = [t[1], t[2]];
      var liste = trier(creneaux), edite = 'Édité le ' + dateFr(aujourdhui());
      if (options.emargement) {
        var c = liste[0], l = triInscrits(c.liste);
        var y = entete(doc, logos, 'Feuille d\'émargement - visite des locaux', edite);
        doc.setFontSize(11); doc.setTextColor(27, 42, 82); doc.setFont('helvetica', 'bold');
        doc.text(dateLongue(c.date) + ', ' + c.heure + ' - ' + fin(c.heure, c.duree), 14, y + 2);
        doc.setFont('helvetica', 'normal');
        doc.text('Rendez-vous : ' + (c.lieu || '-') + '     Guide : ' + (c.guide || '-') + '     ' + l.length + ' inscrit(s) / ' + c.places + ' places', 14, y + 8);
        doc.autoTable({ startY: y + 13, head: [['Prénom', 'Initiale', 'Fonction', 'Présent', 'Signature']],
          body: l.map(function (x) { return [x.prenom, x.initiale + '.', x.fonction, x.present ? 'Oui' : '', '']; })
            .concat([['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', '']]), // lignes libres pour les participants non inscrits
          headStyles: { fillColor: COULEUR_TETE }, styles: { fontSize: 10, cellPadding: 3, minCellHeight: 11, valign: 'middle' },
          columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 18 }, 2: { cellWidth: 40 }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 'auto' } } });
        piedDePage(doc);
        doc.save('emargement-' + c.date + '-' + c.heure.replace(':', 'h') + '.pdf');
        return;
      }
      var y0 = entete(doc, logos, 'Visites des locaux - liste des visiteurs', edite + '  ·  ' + liste.length + ' créneau(x)');
      var total = 0, presents = 0;
      liste.forEach(function (c) {
        var l = triInscrits(c.liste); total += l.length; presents += l.filter(function (x) { return x.present; }).length;
        var y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : y0 + 2;
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 82);
        doc.text(dateLongue(c.date) + ', ' + c.heure + ' - ' + fin(c.heure, c.duree) + (c.statut === 'annulé' ? '  (annulé)' : ''), 14, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(76, 90, 122);
        doc.text('Rendez-vous : ' + (c.lieu || '-') + '   Guide : ' + (c.guide || '-') + '   ' + l.length + ' inscrit(s) / ' + c.places + ' places', 14, y + 5);
        doc.autoTable({ startY: y + 8, head: [['Prénom', 'Initiale', 'Fonction', 'Présent']],
          body: l.length ? l.map(function (x) { return [x.prenom, x.initiale + '.', x.fonction, x.present ? 'Oui' : 'Non']; }) : [['Aucun inscrit', '', '', '']],
          headStyles: { fillColor: COULEUR_TETE }, styles: { fontSize: 9, cellPadding: 2 }, margin: { left: 14, right: 14 },
          columnStyles: { 3: { halign: 'center', cellWidth: 22 } } });
      });
      var yf = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y0) + 10;
      if (yf > 275) { doc.addPage(); yf = 20; }
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 82);
      doc.text('Total : ' + total + ' inscrit(s), dont ' + presents + ' présent(s) confirmé(s).', 14, yf);
      piedDePage(doc);
      doc.save('visites-reanimation-' + aujourdhui() + '.pdf');
    });
  }

  window.ReaExport = { excel: excel, pdf: pdf };
})();
