#!/usr/bin/env python3
"""Fusionne deux plans du même service :
  - le plan SIMPLIFIÉ donne les formes des pièces et la numérotation des chambres (brouillon.json, issu de
    extraire_pieces.py et relu) ;
  - le plan DÉTAILLÉ donne l'utilisation des autres pièces (Poste de soins, Pharmacie…).
Les deux plans n'ont ni la même échelle ni le même cadrage : le script les recale (numéros de chambre
présents sur les deux plans, sinon repères donnés à la main, sinon cadre extérieur), puis range chaque
texte du plan détaillé dans la pièce du plan simplifié qui le contient.

Textes du plan détaillé :
  --detaille-pdf detaille.pdf [--page 1]      PDF vectoriel : textes et positions lus directement ;
  --etiquettes etiquettes.json                sinon, liste préparée en lisant l'image du plan détaillé :
                                              [{"texte": "Poste de soins", "x": 812, "y": 455}, …]
                                              (x, y en pixels de l'image du plan détaillé).
Recalage (dans l'ordre) :
  1. automatique : numéros de chambre écrits sur les deux plans (au moins 3) ;
  2. --reperes reperes.json : [{"detaille": [x, y], "simplifie": [x, y]}, …] (au moins 2 points communs,
     par ex. des angles du bâtiment ; coordonnées du plan détaillé dans le même repère que ses textes,
     coordonnées du plan simplifié dans celui de brouillon.json) ;
  3. --cadre : on aligne les cadres extérieurs des deux dessins (approximatif ; à vérifier sur l'aperçu).

Usage : python fusionner_plans.py --brouillon brouillon.json --detaille-pdf detaille.pdf \
          [--simplifie simple-1.png] --sortie plan-donnees.json --apercu fusion.png
Écrit le plan fusionné et affiche un rapport : pièces nommées, conflits, textes non placés, précision du recalage."""
import argparse, json, math, re, sys

TYPES_MOTS = [  # utilisation → type de pièce
    (r'\b(couloir|circulation|d[ée]gagement|hall|palier|sas)\b', 'couloir'),
    (r'\b(escalier|ascenseur|asc\.?|monte[- ]charge)\b', 'circulation'),
    (r'\b(local technique|tech\.?|gaine|cta|tgbt|[ée]lectrique|serveur|baie)\b', 'technique'),
    (r'\b(terrasse|patio|balcon)\b', 'terrasse'),
]
BRUIT = re.compile(r'^\s*([\d.,]+\s*m[²2]?|[\d.,]+\s*cm|h\s*=?\s*[\d.,]+|[A-Z]?\d{1,2}|[-–—_.:/]+|lit|lits?\s*\d*)\s*$', re.I)

# ---------- géométrie ----------
def points_piece(p):
    if 'r' in p: x0, y0, x1, y1 = p['r']; return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    t = re.findall(r'[MLHVZmlhvz]|-?\d*\.?\d+', p['d']); pts, c, x, y, i = [], None, 0., 0., 0
    while i < len(t):
        if t[i].isalpha():
            c = t[i]; i += 1
            if c in 'Zz': continue
        if c in 'ML': x, y = float(t[i]), float(t[i + 1]); i += 2
        elif c in 'ml': x, y = x + float(t[i]), y + float(t[i + 1]); i += 2
        elif c == 'H': x = float(t[i]); i += 1
        elif c == 'h': x += float(t[i]); i += 1
        elif c == 'V': y = float(t[i]); i += 1
        elif c == 'v': y += float(t[i]); i += 1
        else: i += 1; continue
        pts.append((x, y)); c = {'M': 'L', 'm': 'l'}.get(c, c)
    return pts

def dedans(pt, poly):
    x, y, ok = pt[0], pt[1], False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: ok = not ok
    return ok

def centre(poly):
    a = cx = cy = 0.
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]; f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f
    if abs(a) < 1e-9: xs, ys = zip(*poly); return (sum(xs) / len(xs), sum(ys) / len(ys))
    return (cx / (3 * a), cy / (3 * a))

def dist_poly(pt, poly):
    best = 1e18
    for i in range(len(poly)):
        (ax, ay), (bx, by) = poly[i], poly[(i + 1) % len(poly)]; dx, dy = bx - ax, by - ay; l = dx * dx + dy * dy
        t = max(0, min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / l)) if l else 0
        best = min(best, math.hypot(ax + t * dx - pt[0], ay + t * dy - pt[1]))
    return best

# ---------- recalage : similitude (échelle, rotation, translation) par moindres carrés ----------
def similitude(src, dst):
    n = len(src); mx = sum(p[0] for p in src) / n; my = sum(p[1] for p in src) / n; nx = sum(p[0] for p in dst) / n; ny = sum(p[1] for p in dst) / n
    a = b = d = 0.
    for (x, y), (u, v) in zip(src, dst):
        x -= mx; y -= my; u -= nx; v -= ny; a += x * u + y * v; b += x * v - y * u; d += x * x + y * y
    if d == 0: return None
    s_cos, s_sin = a / d, b / d
    return (s_cos, s_sin, nx - (s_cos * mx - s_sin * my), ny - (s_sin * mx + s_cos * my))

def appliquer(T, p): c, s, tx, ty = T; return (c * p[0] - s * p[1] + tx, s * p[0] + c * p[1] + ty)

def ransac(paires, seuil):
    """paires : [(point_détaillé, point_simplifié)] (peut contenir des erreurs) → meilleure similitude."""
    meilleur, garde = None, []
    for i in range(len(paires)):
        for j in range(i + 1, len(paires)):
            T = similitude([paires[i][0], paires[j][0]], [paires[i][1], paires[j][1]])
            if not T or not (0.05 < math.hypot(T[0], T[1]) < 50): continue
            ok = [p for p in paires if math.dist(appliquer(T, p[0]), p[1]) < seuil]
            if len(ok) > len(garde): meilleur, garde = T, ok
    if len(garde) >= 2: meilleur = similitude([p[0] for p in garde], [p[1] for p in garde])
    return meilleur, garde

# ---------- textes du plan détaillé ----------
def textes_pdf(chemin, page):
    import pdfplumber
    with pdfplumber.open(chemin) as pdf:
        pg = pdf.pages[page - 1]
        mots = pg.extract_words(keep_blank_chars=False, use_text_flow=False, extra_attrs=['size'])
        lignes = []
        for m in sorted(mots, key=lambda m: (round(m['top']), m['x0'])):  # mots → lignes
            for l in lignes:
                if abs(l['top'] - m['top']) < 0.4 * m['size'] and 0 <= m['x0'] - l['x1'] < 1.2 * m['size']:
                    l['texte'] += ' ' + m['text']; l['x1'] = m['x1']; l['bottom'] = max(l['bottom'], m['bottom']); break
            else: lignes.append({'texte': m['text'], 'x0': m['x0'], 'x1': m['x1'], 'top': m['top'], 'bottom': m['bottom'], 'size': m['size']})
        blocs = []
        for l in sorted(lignes, key=lambda l: l['top']):  # lignes → blocs (nom sur deux lignes)
            cx = (l['x0'] + l['x1']) / 2
            for b in blocs:
                if 0 <= l['top'] - b['bottom'] < 0.9 * l['size'] and abs(cx - (b['x0'] + b['x1']) / 2) < max(b['x1'] - b['x0'], l['x1'] - l['x0']) / 2 and not BRUIT.match(l['texte']) and not BRUIT.match(b['texte']):
                    b['texte'] += ' ' + l['texte']; b['bottom'] = l['bottom']; b['x0'] = min(b['x0'], l['x0']); b['x1'] = max(b['x1'], l['x1']); break
            else: blocs.append(dict(l))
        objets = pg.lines + pg.rects + pg.curves
        cadre = (min(o['x0'] for o in objets), min(o['top'] for o in objets), max(o['x1'] for o in objets), max(o['bottom'] for o in objets)) if objets else None
        return [{'texte': b['texte'].strip(), 'x': (b['x0'] + b['x1']) / 2, 'y': (b['top'] + b['bottom']) / 2} for b in blocs], cadre

def cadre_image(chemin, taille=None):
    from PIL import Image
    import numpy as np
    im = Image.open(chemin).convert('L')
    if taille: im = im.resize(taille)
    g = np.asarray(im) < 110; ys, xs = g.nonzero()
    return (float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())) if len(xs) else None

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--brouillon', required=True); ap.add_argument('--detaille-pdf'); ap.add_argument('--page', type=int, default=1)
    ap.add_argument('--etiquettes'); ap.add_argument('--detaille', help='image du plan détaillé (pour --cadre ou l\'aperçu)')
    ap.add_argument('--simplifie', help='image du plan simplifié (pour --cadre et l\'aperçu)')
    ap.add_argument('--reperes'); ap.add_argument('--cadre', action='store_true')
    ap.add_argument('--sortie', default='plan-donnees.json'); ap.add_argument('--apercu')
    a = ap.parse_args()
    D = json.load(open(a.brouillon, encoding='utf-8')); vb = D['viewBox']
    pieces = [(p, points_piece(p)) for p in D['pieces']]
    if a.detaille_pdf: textes, cadre_d = textes_pdf(a.detaille_pdf, a.page)
    elif a.etiquettes: textes, cadre_d = json.load(open(a.etiquettes, encoding='utf-8')), None
    else: sys.exit('Donnez --detaille-pdf ou --etiquettes.')
    if cadre_d is None and a.detaille: cadre_d = cadre_image(a.detaille)
    # 1. Recalage
    num = {}
    for p, poly in pieces:
        if p.get('type') == 'chambre' and p.get('chambre'): num.setdefault(str(p['chambre']).strip().lower(), []).append(centre(poly))
    paires = [((t['x'], t['y']), c) for t in textes for c in num.get(t['texte'].strip().lower(), [])]
    diag = math.hypot(vb[2], vb[3]); T, garde, methode = None, [], ''
    if len(paires) >= 3:
        T, garde = ransac(paires, 0.04 * diag)
        if len(garde) >= 3: methode = '%d numéros de chambre communs aux deux plans' % len(garde)
        else: T = None
    if T is None and a.reperes:
        R = json.load(open(a.reperes, encoding='utf-8'))
        if len(R) >= 2: T = similitude([r['detaille'] for r in R], [r['simplifie'] for r in R]); garde = [(r['detaille'], r['simplifie']) for r in R]; methode = '%d repères donnés à la main' % len(R)
    if T is None and a.cadre:
        cs = cadre_image(a.simplifie, (int(vb[2]), int(vb[3]))) if a.simplifie else None
        if cadre_d and cs:
            src = [(cadre_d[0], cadre_d[1]), (cadre_d[2], cadre_d[3])]; dst = [(cs[0], cs[1]), (cs[2], cs[3])]
            T = similitude(src, dst); garde = list(zip(src, dst)); methode = 'cadres extérieurs alignés (approximatif)'
    if T is None:
        sys.exit('❌ Recalage impossible : moins de 3 numéros de chambre communs. Donnez --reperes (2 points communs ou plus, ex. angles du bâtiment) ou --cadre avec --simplifie et --detaille.')
    ecart = max((math.dist(appliquer(T, p[0]), p[1]) for p in garde), default=0)
    # 2. Chaque texte du plan détaillé → pièce du plan simplifié
    numeros = set(num)
    par_piece, hors, ignores = {}, [], []
    for t in textes:
        s = t['texte'].strip()
        if not s or s.lower() in numeros or BRUIT.match(s) or len(s) < 3: ignores.append(s); continue
        pt = appliquer(T, (t['x'], t['y']))
        cible = [i for i, (p, poly) in enumerate(pieces) if dedans(pt, poly)]
        if not cible:
            proche = min(range(len(pieces)), key=lambda i: dist_poly(pt, pieces[i][1]))
            if dist_poly(pt, pieces[proche][1]) < 0.01 * diag: cible = [proche]
        if not cible: hors.append((s, pt)); continue
        par_piece.setdefault(cible[0], []).append((s, pt))
    nommees, conflits, chambres_notees = 0, [], []
    for i, l in par_piece.items():
        p = pieces[i][0]
        noms = []
        for s, _ in sorted(l, key=lambda x: (x[1][1], x[1][0])):
            if s not in noms: noms.append(s)
        nom = ' / '.join(noms)[:60]
        if len(noms) > 1: conflits.append('%s : plusieurs utilisations sur le plan détaillé → « %s » (une seule pièce sur le plan simplifié ; à trancher)' % (p['id'], nom))
        if p.get('type') == 'chambre':
            chambres_notees.append('%s (chambre %s) : le plan détaillé indique « %s » — laissé en chambre' % (p['id'], p.get('chambre'), nom)); continue
        if p.get('nom') and p['nom'] != nom: conflits.append('%s : nom « %s » remplacé par « %s »' % (p['id'], p['nom'], nom))
        p['nom'] = nom; nommees += 1
        for motif, ty in TYPES_MOTS:
            if re.search(motif, nom, re.I): p['type'] = ty; break
    D['source'] = 'Formes et numéros : plan simplifié ; utilisations : plan détaillé (fusion Cap NCHUG)'
    json.dump(D, open(a.sortie, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    sans_nom = [p['id'] for p, _ in pieces if p.get('type') != 'chambre' and not p.get('nom')]
    echelle = math.hypot(T[0], T[1]); rot = math.degrees(math.atan2(T[1], T[0]))
    print('Recalage : %s ; échelle ×%.3f, rotation %.1f°, écart max %.1f px.' % (methode, echelle, rot, ecart))
    print('✅ %d pièce(s) nommée(s) d\'après le plan détaillé → %s' % (nommees, a.sortie))
    if conflits: print('À trancher :'); [print('  - ' + c) for c in conflits]
    if chambres_notees: print('Chambres du plan simplifié portant une autre utilisation sur le plan détaillé :'); [print('  - ' + c) for c in chambres_notees]
    if hors: print('Textes du plan détaillé hors de toute pièce (non utilisés) :'); [print('  - « %s »' % s) for s, _ in hors[:30]]
    if sans_nom: print('Pièces restées sans nom : ' + ', '.join(sans_nom))
    if a.apercu:
        from PIL import Image, ImageDraw, ImageFont
        w, h = int(vb[2]), int(vb[3])
        try: police = ImageFont.load_default(size=max(12, int(min(w, h) / 70)))
        except TypeError: police = None
        im = Image.open(a.simplifie).convert('RGB').resize((w, h)) if a.simplifie else Image.new('RGB', (w, h), 'white')
        g = ImageDraw.Draw(im, 'RGBA')
        for p, poly in pieces:
            g.polygon(poly, fill=(120, 200, 140, 70) if p.get('type') == 'chambre' else (150, 185, 235, 70) if p.get('nom') else (255, 120, 0, 60), outline=(34, 59, 128, 255))
        for t in textes:
            x, y = appliquer(T, (t['x'], t['y'])); g.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(200, 0, 0, 255)); g.text((x + 5, y + 4), t['texte'][:24], fill=(200, 0, 0, 255))
        for p, poly in pieces:
            c = centre(poly); g.text((c[0], c[1] - 18), str(p.get('chambre') if p.get('type') == 'chambre' else p.get('nom') or '?')[:24], fill=(20, 30, 90, 255), anchor='mm', font=police)
        im.save(a.apercu); print('Aperçu (points rouges = textes du plan détaillé recalés) : ' + a.apercu)

if __name__ == '__main__':
    main()
