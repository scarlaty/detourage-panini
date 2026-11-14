"""Fonds floutés tirés des photos de la salle (JPG 1000×1400, vignette 5:7).

Les photos sources peuvent montrer des personnes (enfants à l'entraînement) : vérifier le
droit à l'image avant toute publication. Le flou (sigma 4 à 10) garde la salle reconnaissable.

Usage : python tools/fonds_salle.py <dossier_photos> <logo.png> <dossier_sortie>
"""
import glob, json, math, random, sys
from pathlib import Path
import numpy as np, cv2
from PIL import Image, ImageOps, ImageFilter

W, H = 1000, 1400
JAUNE = np.array([253, 241, 3], np.float32) / 255
NOIR = np.array([10, 10, 11], np.float32) / 255
TETE = (500, 330)


def charger(path, maxside=2200):
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    im.thumbnail((maxside, maxside), Image.LANCZOS)
    return im


def cadrer(im, cx=.5, cy=.5, zoom=1.0):
    """Fenêtre 5:7 dans une photo paysage. zoom > 1 resserre."""
    iw, ih = im.size
    h = ih / zoom; w = h * W / H
    if w > iw: w = iw; h = w * H / W
    x = min(max(0, cx * iw - w / 2), iw - w); y = min(max(0, cy * ih - h / 2), ih - h)
    return im.crop((int(x), int(y), int(x + w), int(y + h))).resize((W, H), Image.LANCZOS)


def arr(im): return np.asarray(im, np.float32) / 255
def img(a): return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def flou(a, sigma):
    """Flou gaussien, sigma en px sur la vignette 1000×1400. 4 à 7 : salle reconnaissable,
    effet de profondeur de champ ; au-delà de 12 on ne reconnaît plus le lieu."""
    return cv2.GaussianBlur(a, (0, 0), sigma)


def flou_mouvement(a, L=90, ang=0):
    k = np.zeros((L, L), np.float32); k[L // 2, :] = 1
    M = cv2.getRotationMatrix2D((L / 2 - .5, L / 2 - .5), ang, 1)
    k = cv2.warpAffine(k, M, (L, L)); k /= k.sum()
    small = cv2.resize(a, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    small = cv2.filter2D(small, -1, k)
    return cv2.resize(small, (W, H), interpolation=cv2.INTER_CUBIC)


def lum(a): return a @ np.array([.2126, .7152, .0722], np.float32)
def gris(a): return np.repeat(lum(a)[..., None], 3, 2)
def duotone(a, c0, c1, gamma=1.0):
    l = np.clip(lum(a), 0, 1) ** gamma
    return c0 * (1 - l[..., None]) + c1 * l[..., None]
def contraste(a, k=1.2, pivot=.5): return (a - pivot) * k + pivot
def melange(a, b, t): return a * (1 - t) + b * t


def radial(cx, cy, r):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - cx) / W) ** 2 + ((yy - cy) / H) ** 2 * (H / W) ** 2) / r
    return np.clip(1 - d, 0, 1)


def vignette(a, force=.6):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H * .42) / (H / 2)) ** 2)
    return a * (1 - force * np.clip((d - .55) / .9, 0, 1) ** 1.5)[..., None]


def degrade_v(a, c, y0, y1, op=1):
    t = np.clip((np.arange(H, dtype=np.float32) - y0 * H) / ((y1 - y0) * H), 0, 1)[:, None, None]
    return melange(a, c, t * op)


def grain(a, force=.035, seed=0):
    rnd = np.random.default_rng(seed)
    n = rnd.normal(0, force, (H // 2, W // 2, 1)).astype(np.float32)
    return a + cv2.resize(n, (W, H))[..., None]


def bokeh(a, seed=0, n=40):
    """Boules lumineuses sur les zones claires (éclairage de salle)."""
    rnd = random.Random(seed)
    l = lum(cv2.resize(a, (W // 10, H // 10)))
    ys, xs = np.where(l > np.percentile(l, 88))
    over = np.zeros((H, W, 3), np.float32)
    for _ in range(n):
        if not len(xs): break
        i = rnd.randrange(len(xs)); x, y = xs[i] * 10, ys[i] * 10
        r = rnd.uniform(18, 60)
        col = a[min(H - 1, y), min(W - 1, x)] * .6 + .4
        cv2.circle(over, (int(x), int(y)), int(r), tuple(float(c) for c in col * rnd.uniform(.25, .6)), -1, cv2.LINE_AA)
    over = cv2.GaussianBlur(over, (0, 0), 2.5)
    return 1 - (1 - a) * (1 - over)  # mode « écran »


LOGO = None
def logo(a, cx, cy, size, op=.12, mode="clair", couleur=None):
    lg = LOGO.resize((int(size), int(size)), Image.LANCZOS)
    la = np.asarray(lg, np.float32) / 255
    rgb, al = la[..., :3], la[..., 3]
    if mode == "clair": al = al * lum(rgb); rgb = np.ones_like(rgb) * (couleur if couleur is not None else 1)
    elif mode == "sombre": al = al * (1 - lum(rgb)); rgb = np.ones_like(rgb) * (couleur if couleur is not None else NOIR)
    x0, y0 = int(cx - size / 2), int(cy - size / 2)
    xs, ys = max(0, x0), max(0, y0); xe, ye = min(W, x0 + lg.width), min(H, y0 + lg.height)
    if xe <= xs or ye <= ys: return a
    sub = (slice(ys - y0, ye - y0), slice(xs - x0, xe - x0))
    t = (al[sub] * op)[..., None]
    a = a.copy(); a[ys:ye, xs:xe] = a[ys:ye, xs:xe] * (1 - t) + rgb[sub] * t
    return a


def rayons(a, n=24, op=.15, c=JAUNE):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ang = np.arctan2(yy - TETE[1], xx - TETE[0])
    m = ((np.floor(ang / (2 * math.pi / n) * 2) % 2) == 0).astype(np.float32)
    m = cv2.GaussianBlur(m, (0, 0), 1.2) * radial(TETE[0], TETE[1], 1.1) ** .7
    return melange(a, c, (m * op)[..., None])


def trame(a, step=22, c=JAUNE, op=.8, bas=True):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u, v = (xx + yy) / math.sqrt(2), (xx - yy) / math.sqrt(2)
    du, dv = (u % step) - step / 2, (v % step) - step / 2
    t = np.clip((np.arange(H, dtype=np.float32) / H - .35) / .65, 0, 1)[:, None] if bas else np.clip(1 - np.arange(H, dtype=np.float32) / H / .6, 0, 1)[:, None]
    r = step * .42 * t
    m = np.clip(r - np.sqrt(du ** 2 + dv ** 2) + .5, 0, 1)
    return melange(a, c, (m * op)[..., None])


def bandes(a, c=JAUNE, ang=-30, y=700, ep=(120, 22), op=1):
    m = np.zeros((H, W), np.float32)
    yy = y
    for e in ep:
        pts = cv2.boxPoints(((W / 2, yy + e / 2), (W * 3, e), ang)).astype(np.int32)
        cv2.fillPoly(m, [pts], 1.0, cv2.LINE_AA); yy += e + 30
    return melange(a, c, (m * op)[..., None])


def cadre(a, c=JAUNE, ep=22, marge=28):
    m = np.zeros((H, W), np.float32)
    cv2.rectangle(m, (marge, marge), (W - marge, H - marge), 1.0, ep, cv2.LINE_AA)
    for (x, y, sx, sy) in [(marge, marge, 1, 1), (W - marge, marge, -1, 1), (marge, H - marge, 1, -1), (W - marge, H - marge, -1, -1)]:
        o = int(ep * 2.2)
        cv2.polylines(m, [np.array([(x + sx * 120, y + sy * o), (x + sx * o, y + sy * o), (x + sx * o, y + sy * 120)], np.int32)], False, 1.0, 6, cv2.LINE_AA)
    a = melange(a, c, m[..., None])
    return logo(a, 860, 150, 170, 1, "couleur")


def logo_couleur(a, cx, cy, size):
    return logo(a, cx, cy, size, 1, "couleur")


# ------------------------------------------------------------- traitements
# (titre, fonction(a, seed) -> a). Le flou est toujours appliqué en premier.
def T(titre, r, f):
    return (titre, r, f)

TRAITEMENTS = [
    T("Naturel flou", 5, lambda a, s: vignette(contraste(a, 1.05), .45)),
    T("Naturel flou prononcé, bas sombre", 8, lambda a, s: degrade_v(vignette(a, .4), NOIR, .45, 1, .85)),
    T("Noir et blanc", 5, lambda a, s: vignette(contraste(gris(a), 1.15), .55)),
    T("Noir et blanc, halo jaune", 5, lambda a, s: melange(vignette(contraste(gris(a) * .8, 1.1), .5), JAUNE, (radial(*TETE, .55) ** 1.6 * .55)[..., None])),
    T("Duotone noir et jaune", 4, lambda a, s: vignette(duotone(contraste(a, 1.2), NOIR, JAUNE, 1.1), .35)),
    T("Duotone acier", 4, lambda a, s: vignette(duotone(a, NOIR, np.array([.78, .8, .84], np.float32), 1.2), .45)),
    T("Teinte club", 4, lambda a, s: vignette(melange(gris(a), duotone(a, NOIR, JAUNE, .9), .55) * 1.02, .45)),
    T("Cinéma sombre", 6, lambda a, s: vignette(contraste(a * .55, 1.25, .3), .7)),
    T("Bokeh lumières", 10, lambda a, s: vignette(bokeh(a * .75, s, 25), .5)),
    T("Écusson en filigrane", 6, lambda a, s: vignette(logo(a * .65, 500, 380, 900, .14, "clair", JAUNE), .5)),
    T("Rayons jaunes", 5, lambda a, s: vignette(rayons(gris(a) * .55, 24, .22), .45)),
    T("Trame de points", 5, lambda a, s: trame(vignette(a * .6, .5), 22, JAUNE, .85)),
    T("Fondu au noir", 5, lambda a, s: degrade_v(a * .9, NOIR, .25, .85, 1)),
    T("Fondu jaune", 5, lambda a, s: degrade_v(gris(a), JAUNE, .55, 1.0, .9)),
    T("Flou de mouvement", 0, lambda a, s: vignette(contraste(flou_mouvement(a, 22, 0), 1.1) * .85, .45)),
    T("Mouvement oblique duotone", 0, lambda a, s: vignette(duotone(flou_mouvement(a, 26, -20), NOIR, JAUNE, 1.2), .35)),
    T("Cadre carte", 4, lambda a, s: cadre(vignette(a * .7, .45))),
    T("Écharpe jaune", 5, lambda a, s: bandes(vignette(gris(a) * .6, .45), JAUNE, -30, 760)),
]

# ------------------------------------------------------------- panthère et griffures
# Mêmes formes que les fonds graphiques (tools/fonds_pro.py).
import fonds_pro as FP


def _poly_mask(points):
    m = np.zeros((H, W), np.float32)
    cv2.fillPoly(m, [np.round(np.array(points) * 4).astype(np.int32)], 1.0, cv2.LINE_AA, shift=2)
    return m


def _place(points, place):
    sc, tx, ty, mir = FP.PLACES[place]
    out = [(tx + x * sc, ty + y * sc) for x, y in points]
    return [(W - x, y) for x, y in out] if mir else out


def panthere_r(a, place="droite", c=NOIR, op=1.0, oeil=JAUNE, contour=None, ep=8):
    sil = _poly_mask(_place(FP.P_SIL, place))
    if contour is not None:
        k = np.ones((ep, ep), np.uint8)
        bord = np.clip(cv2.dilate(sil, k) - sil, 0, 1)
        a = melange(a, contour, bord[..., None])
    a = melange(a, c, (sil * op)[..., None])
    yeux = np.clip(_poly_mask(_place(FP.P_EYE, place)) + _poly_mask(_place(FP.P_BROW, place)), 0, 1)
    return melange(a, oeil, yeux[..., None])


def griffes_r(a, zone="haut-gauche", c=JAUNE, w=60, ecart=70, ombre=False, seed=7):
    m = np.zeros((H, W), np.float32)
    for p in FP.griffes(*FP.ZONES[zone], w=w, k=3, ecart=ecart, seed=seed, pts=True):
        m = np.maximum(m, _poly_mask(p))
    if ombre:  # effet déchirure : ombre portée sous la couche révélée
        sh = cv2.GaussianBlur(np.roll(m, 6, axis=0), (0, 0), 6)
        a = a * (1 - .7 * sh)[..., None]
    return melange(a, c, m[..., None])


# Ajoutés après coup : numérotés à la suite (S109…) pour ne pas décaler les fonds existants.
EXTRAS = [
    T("N&B, panthère fantôme", 5, lambda a, s: vignette(panthere_r(contraste(gris(a), 1.1) * .7, "droite", NOIR, .55, JAUNE), .5)),
    T("Duotone, panthère détourée", 4, lambda a, s: vignette(panthere_r(duotone(contraste(a, 1.15), NOIR, JAUNE, 1.1) * .9, "droite", NOIR, 1, JAUNE, JAUNE, 9), .35)),
    T("Salle sombre, griffures jaunes", 5, lambda a, s: griffes_r(vignette(a * .55, .5), "haut-gauche", JAUNE)),
    T("N&B, déchirure jaune", 5, lambda a, s: griffes_r(vignette(gris(a) * .6, .5), "traversante", JAUNE, 95, 120, True)),
    T("Panthère et griffures", 5, lambda a, s: griffes_r(vignette(panthere_r(melange(gris(a), duotone(a, NOIR, JAUNE, .9), .5) * .65, "droite", NOIR, .6, JAUNE), .45), "haut-gauche", JAUNE)),
]

# cadrages : (cx, cy, zoom) ; variés d'un traitement à l'autre pour ne pas répéter les mêmes vues
CADRAGES = [(.5, .45, 1.0), (.3, .4, 1.15), (.7, .45, 1.1), (.5, .3, 1.35), (.2, .5, 1.0), (.8, .4, 1.25), (.42, .55, 1.5)]


if __name__ == "__main__":
    src, logo_path, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    LOGO = Image.open(logo_path).convert("RGBA")
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.jpg"): old.unlink()
    photos = sorted(glob.glob(str(src / "*.jp*g")))
    index, n = [], 0
    for pi, p in enumerate(photos):
        im = charger(p)
        for ti, (titre, r, f) in enumerate(TRAITEMENTS):
            n += 1
            cx, cy, z = CADRAGES[(ti + pi * 3) % len(CADRAGES)]
            a = arr(cadrer(im, cx, cy, z))
            if r: a = flou(a, r)
            a = grain(np.clip(f(a, n), 0, 1), .03, n)
            nom = f"S{n:03d}.jpg"
            img(a).save(out / nom, quality=88, optimize=True)
            index.append({"n": n, "label": f"S{n:03d}", "fichier": nom, "famille": titre,
                          "titre": f"{titre} · photo {pi + 1}", "groupe": "Salle"})
        print(f"photo {pi + 1}/{len(photos)}")
    for ei, (titre, r, f) in enumerate(EXTRAS):
        for pi, p in enumerate(photos):
            n += 1
            im = charger(p)
            cx, cy, z = CADRAGES[(ei + pi * 2) % len(CADRAGES)]
            a = arr(cadrer(im, cx, cy, z))
            if r: a = flou(a, r)
            a = grain(np.clip(f(a, n), 0, 1), .03, n)
            nom = f"S{n:03d}.jpg"
            img(a).save(out / nom, quality=88, optimize=True)
            index.append({"n": n, "label": f"S{n:03d}", "fichier": nom, "famille": titre,
                          "titre": f"{titre} · photo {pi + 1}", "groupe": "Salle"})
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(n, "fonds")
