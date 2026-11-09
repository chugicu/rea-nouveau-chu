#!/usr/bin/env python3
"""Détecte les pièces d'un plan (zones claires fermées par des murs foncés) et écrit un brouillon au format
Cap NCHUG. Les textes d'un PDF vectoriel (--pdf) sont rangés dans les pièces qui les contiennent.
Usage : python extraire_pieces.py page.png [--pdf plan.pdf] [--fermer 3] [--seuil 170] [--sortie brouillon.json]
Le résultat est un BROUILLON : à relire et corriger (légendes, couloirs, noms) avant verifier_plan.py."""
import argparse, json, re
import numpy as np
from PIL import Image

def contour(masque):
    """Suivi de bord (Moore) du contour extérieur d'un masque booléen ; renvoie des points (x, y)."""
    hh, w = masque.shape
    ys, xs = np.nonzero(masque)
    if not len(xs): return []
    k = np.lexsort((xs, ys))[0]; cx, cy = int(xs[k]), int(ys[k])
    DX, DY = (-1, -1, 0, 1, 1, 1, 0, -1), (0, -1, -1, -1, 0, 1, 1, 1)
    pts, d, debut = [(cx + .5, cy + .5)], 0, None
    for _ in range(400000):
        trouve = -1
        for j in range(1, 9):
            nd = (d + j) % 8; x, y = cx + DX[nd], cy + DY[nd]
            if 0 <= x < w and 0 <= y < hh and masque[y, x]: trouve = nd; break
        if trouve < 0: break
        cx += DX[trouve]; cy += DY[trouve]; d = (trouve + 4) % 8
        cle = (cx, cy, d)
        if debut is None: debut = cle
        elif cle == debut: break
        pts.append((cx + .5, cy + .5))
    return pts[:-1] if len(pts) > 1 else pts

def simplifier(pts, eps):
    def dist(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]; l = dx * dx + dy * dy
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) if l else 0
        return ((a[0] + t * dx - p[0]) ** 2 + (a[1] + t * dy - p[1]) ** 2) ** .5
    def dp(l):
        if len(l) < 3: return l
        dm, k = max((dist(l[i], l[0], l[-1]), i) for i in range(1, len(l) - 1))
        if dm <= eps: return [l[0], l[-1]]
        return dp(l[:k + 1])[:-1] + dp(l[k:])
    if len(pts) < 5: return pts
    loin = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    return dp(pts[:loin + 1])[:-1] + dp(pts[loin:] + [pts[0]])[:-1]

def aire(p): return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('image'); ap.add_argument('--pdf'); ap.add_argument('--page', type=int, default=1)
    ap.add_argument('--fermer', type=int, default=3); ap.add_argument('--seuil', type=int, default=170)
    ap.add_argument('--min', type=int, default=400, help='surface minimale d\'une pièce (px)')
    ap.add_argument('--sortie', default='brouillon.json')
    a = ap.parse_args()
    from scipy import ndimage
    img = Image.open(a.image).convert('L'); e = min(1, 1600 / max(img.size))
    if e < 1: img = img.resize((round(img.width * e), round(img.height * e)))
    g = np.asarray(img); hh, w = g.shape
    clair = g >= a.seuil
    ferme = ndimage.binary_erosion(clair, iterations=a.fermer, border_value=1) if a.fermer else clair  # ferme les portes
    lab, n = ndimage.label(ferme)
    tailles = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    bord = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}  # l'extérieur du bâtiment
    pieces = []
    for k in range(1, n + 1):
        if k in bord or tailles[k - 1] < a.min or tailles[k - 1] > 0.3 * w * hh: continue
        m = lab == k
        yy, xx = np.nonzero(m)
        be = [xx.min() - a.fermer, yy.min() - a.fermer, xx.max() + 1 + a.fermer, yy.max() + 1 + a.fermer]  # boîte rendue jusqu'aux murs
        if m.sum() / float((xx.max() + 1 - xx.min()) * (yy.max() + 1 - yy.min())) > .9:
            b = [float(max(0, be[0])), float(max(0, be[1])), float(min(w, be[2])), float(min(hh, be[3]))]; pts = None
        else:
            if a.fermer: m = ndimage.binary_dilation(m, iterations=a.fermer) & clair
            pts = simplifier(contour(m), 1.5 + a.fermer * .4)
            if len(pts) < 3: continue
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]; b = [min(xs), min(ys), max(xs), max(ys)]
        piece = {'id': 'P%03d' % (len(pieces) + 1), 'type': 'piece'}
        if pts is None: piece['r'] = [round(v, 1) for v in b]
        else: piece['d'] = 'M' + ' L'.join('%g,%g' % (round(x, 1), round(y, 1)) for x, y in pts) + ' Z'
        r = (b[2] - b[0]) * (b[3] - b[1])
        if r > 0.04 * w * hh and max(b[2] - b[0], b[3] - b[1]) > 5 * min(b[2] - b[0], b[3] - b[1]): piece['type'] = 'couloir'
        piece['_masque'] = k; pieces.append(piece)
    if a.pdf:  # textes du PDF vectoriel → nom ou numéro de chambre
        import pdfplumber
        with pdfplumber.open(a.pdf) as pdf:
            pg = pdf.pages[a.page - 1]; ex, ey = w / float(pg.width), hh / float(pg.height)
            iy, ix = ndimage.distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
            proche = lab[iy, ix]  # chaque pixel → zone la plus proche (le texte lui-même est foncé)
            for mot in pg.extract_words(keep_blank_chars=True, use_text_flow=True):
                x, y = int((mot['x0'] + mot['x1']) / 2 * ex), int((mot['top'] + mot['bottom']) / 2 * ey)
                if not (0 <= x < w and 0 <= y < hh): continue
                k = proche[y, x]
                for p in pieces:
                    if p['_masque'] == k and k:
                        t = mot['text'].strip()
                        if re.fullmatch(r'\d{1,4}[A-Za-z]?( ?bis)?', t) and 'chambre' not in p: p['type'] = 'chambre'; p['chambre'] = t; p['id'] = 'C' + p['id'][1:]
                        elif not re.fullmatch(r'[\d.,]+ ?m²?', t): p['nom'] = (p.get('nom', '') + ' ' + t).strip()[:60]
    for p in pieces: p.pop('_masque', None)
    json.dump({'viewBox': [0, 0, w, hh], 'pieces': pieces}, open(a.sortie, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('%d pièce(s) détectée(s) → %s (brouillon à relire). Taille de référence : %d × %d px.' % (len(pieces), a.sortie, w, hh))

if __name__ == '__main__':
    main()
