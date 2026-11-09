#!/usr/bin/env python3
"""Contrôle un fichier plan-donnees.json comme le fait l'appli Cap NCHUG à l'import, et dessine un aperçu.
Usage : python verifier_plan.py plan-donnees.json [--apercu apercu.png] [--fond page.png]
Code de sortie 0 = importable (aucune erreur), 1 = erreurs à corriger."""
import argparse, json, re, sys

TYPES = {'piece', 'chambre', 'couloir', 'terrasse', 'usic', 'usinv', 'circulation', 'technique'}

def nombre(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)

def points_chemin(d):
    t = re.findall(r'[MLHVZmlhvz]|-?\d*\.?\d+(?:e-?\d+)?', d)
    pts, c, x, y, i = [], None, 0.0, 0.0, 0
    while i < len(t):
        if re.match(r'[A-Za-z]', t[i]):
            c = t[i]; i += 1
            if c in 'Zz': continue
        if c in 'ML': x, y = float(t[i]), float(t[i + 1]); i += 2
        elif c in 'ml': x, y = x + float(t[i]), y + float(t[i + 1]); i += 2
        elif c == 'H': x = float(t[i]); i += 1
        elif c == 'h': x += float(t[i]); i += 1
        elif c == 'V': y = float(t[i]); i += 1
        elif c == 'v': y += float(t[i]); i += 1
        else: i += 1; continue
        pts.append((x, y))
        if c == 'M': c = 'L'
        if c == 'm': c = 'l'
    return pts

def controler(D):
    err, av = [], []
    st = {'pieces': 0, 'chambres': 0, 'nommees': 0, 'unites': 0}
    if not isinstance(D, dict):
        return ['Le fichier ne contient pas un plan (objet JSON attendu).'], av, st, []
    vb = D.get('viewBox')
    if not (isinstance(vb, list) and len(vb) == 4 and all(nombre(v) for v in vb) and vb[2] > 0 and vb[3] > 0):
        err.append('« viewBox » manquant ou incorrect : 4 nombres [x, y, largeur, hauteur] attendus.'); vb = None
    pieces = D.get('pieces')
    if not isinstance(pieces, list) or not pieces:
        err.append('Aucune pièce (« pieces ») dans le fichier.'); return err, av, st, []
    if len(pieces) > 6000: err.append('Trop de pièces (%d, 6000 au plus).' % len(pieces))
    unites = D.get('unites') if isinstance(D.get('unites'), dict) else {}
    for k, u in unites.items():
        st['unites'] += 1
        if not isinstance(u, dict) or not str(u.get('nom') or '').strip(): err.append('Unité « %s » sans nom.' % k)
        c = isinstance(u, dict) and (u.get('couleur') or u.get('trait'))
        if c and not re.match(r'^#[0-9a-fA-F]{6}$', str(c)): err.append('Unité « %s » : couleur « %s » incorrecte (format #RRGGBB).' % (k, c))
    ids, chambres, boites, formes = {}, {}, [], []
    hors, sans_geo, inconnus, sans_num = 0, [], set(), 0
    for i, p in enumerate(pieces):
        nom = 'Pièce n° %d%s' % (i + 1, ' (%s)' % p.get('id') if isinstance(p, dict) and p.get('id') else '')
        if not isinstance(p, dict): err.append(nom + ' : illisible.'); continue
        pid = str(p.get('id') or '')
        if not re.match(r'^[A-Za-z0-9_-]{1,40}$', pid): err.append(nom + ' : identifiant « id » manquant ou incorrect (lettres, chiffres, - et _).'); continue
        if pid in ids: err.append('Identifiant en double : %s.' % pid); continue
        ids[pid] = 1
        t = str(p.get('type') or 'piece')
        if t not in TYPES: inconnus.add(t)
        b, pts = None, None
        if isinstance(p.get('r'), list):
            r = p['r']
            if len(r) == 4 and all(nombre(v) for v in r) and r[2] > r[0] and r[3] > r[1]:
                b = r; pts = [(r[0], r[1]), (r[2], r[1]), (r[2], r[3]), (r[0], r[3])]
            else: err.append(nom + ' : rectangle « r » incorrect ([x0, y0, x1, y1] avec x1 > x0 et y1 > y0).'); continue
        elif isinstance(p.get('d'), str):
            d = p['d']
            if not re.match(r'^[MLHVZmlhvz0-9.,\s-]+$', d) or not re.match(r'^\s*M', d, re.I):
                err.append(nom + ' : contour « d » incorrect (commandes M, L, H, V, Z uniquement).'); continue
            pts = points_chemin(d)
            if len(pts) < 3: err.append(nom + ' : contour trop court (au moins 3 points).'); continue
            xs, ys = [q[0] for q in pts], [q[1] for q in pts]; b = [min(xs), min(ys), max(xs), max(ys)]
            if not re.search(r'[Zz]\s*$', d): av.append(nom + ' : contour non fermé (pas de « Z » final) : vérifiez la forme.')
        else: sans_geo.append(pid); continue
        st['pieces'] += 1
        if t == 'chambre':
            st['chambres'] += 1
            if p.get('chambre') in (None, ''): sans_num += 1
            else:
                c = str(p['chambre'])
                if c in chambres: av.append('Chambre %s en double (%s et %s).' % (c, chambres[c], pid))
                chambres[c] = pid
        if p.get('nom'): st['nommees'] += 1
        if p.get('unite') not in (None, '') and p.get('unite') not in unites: err.append(nom + ' : unité « %s » inconnue (absente de « unites »).' % p.get('unite'))
        if vb and (b[0] < vb[0] - 1 or b[1] < vb[1] - 1 or b[2] > vb[0] + vb[2] + 1 or b[3] > vb[1] + vb[3] + 1): hors += 1
        boites.append((pid, b)); formes.append((p, pts))
    if sans_geo: err.append('%d pièce(s) sans forme (« r » ou « d ») : %s.' % (len(sans_geo), ', '.join(sans_geo[:8])))
    if hors: av.append('%d pièce(s) dépassent du cadre « viewBox » : elles risquent d\'être coupées.' % hors)
    if inconnus: av.append('Types de pièce inconnus, affichés comme des pièces : %s.' % ', '.join(sorted(inconnus)))
    if sans_num: av.append('%d chambre(s) sans numéro.' % sans_num)
    chev = []
    tri = sorted(boites, key=lambda x: x[1][0])
    for i in range(len(tri)):
        for j in range(i + 1, len(tri)):
            A, B = tri[i][1], tri[j][1]
            if B[0] >= A[2]: break
            w, hh = min(A[2], B[2]) - max(A[0], B[0]), min(A[3], B[3]) - max(A[1], B[1])
            if w > 0 and hh > 0 and w * hh > 0.3 * min((A[2] - A[0]) * (A[3] - A[1]), (B[2] - B[0]) * (B[3] - B[1])): chev.append('%s / %s' % (tri[i][0], tri[j][0]))
    if chev: av.append('Pièces qui se chevauchent : %s.' % ', '.join(chev[:10]))
    a_nommer = st['pieces'] - st['nommees'] - st['chambres']
    if a_nommer > 0: av.append('%d pièce(s) sans nom : elles pourront être nommées dans l\'appli (rubrique Plan).' % a_nommer)
    if not st['unites']: av.append('Aucune unité : les jeux de couleurs seront masqués, les autres jeux du plan restent disponibles.')
    return err, av, st, formes

TEINTES = {'chambre': (120, 200, 140), 'couloir': (230, 225, 205), 'circulation': (190, 170, 230), 'technique': (190, 190, 190), 'terrasse': (170, 220, 160)}

def apercu(D, formes, sortie, fond=None):
    from PIL import Image, ImageDraw
    from PIL import ImageFont
    try: police = ImageFont.load_default(size=max(12, int(min(D['viewBox'][2], D['viewBox'][3]) / 60)))
    except TypeError: police = None
    vb = D['viewBox']; w, hh = int(vb[2]), int(vb[3])
    base = Image.open(fond).convert('RGB').resize((w, hh)) if fond else Image.new('RGB', (w, hh), 'white')
    calque = Image.new('RGBA', (w, hh), (0, 0, 0, 0)); g = ImageDraw.Draw(calque)
    unites = D.get('unites') or {}
    for p, pts in formes:
        q = [(x - vb[0], y - vb[1]) for x, y in pts]
        u = unites.get(p.get('unite')) if p.get('unite') else None
        c = tuple(int(u['couleur'][k:k + 2], 16) for k in (1, 3, 5)) if u and u.get('couleur') else TEINTES.get(p.get('type'), (150, 185, 235))
        g.polygon(q, fill=c + (110,), outline=(34, 59, 128, 255))
        xs, ys = [a for a, _ in q], [b for _, b in q]
        lib = str(p.get('chambre') if p.get('type') == 'chambre' else p.get('nom') or '?')
        g.text(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2), lib[:18], fill=(20, 30, 80, 255), anchor='mm', font=police)
    Image.alpha_composite(base.convert('RGBA'), calque).convert('RGB').save(sortie)

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('fichier'); ap.add_argument('--apercu'); ap.add_argument('--fond')
    a = ap.parse_args()
    try: D = json.load(open(a.fichier, encoding='utf-8'))
    except Exception: print('❌ Fichier illisible : ce n\'est pas du JSON valide.'); sys.exit(1)
    err, av, st, formes = controler(D)
    if err:
        print('❌ %d problème(s) à corriger avant l\'import :' % len(err)); [print('  - ' + e) for e in err[:40]]
    else:
        print('✅ Plan importable : %d pièces dont %d chambres, %d unité(s).' % (st['pieces'], st['chambres'], st['unites']))
    if av: print('Points à vérifier (n\'empêchent pas l\'import) :'); [print('  - ' + x) for x in av[:40]]
    if a.apercu and not err: apercu(D, formes, a.apercu, a.fond); print('Aperçu : ' + a.apercu)
    sys.exit(1 if err else 0)

if __name__ == '__main__':
    main()
