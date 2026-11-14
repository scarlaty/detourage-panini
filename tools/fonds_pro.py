"""Générateur de fonds « matchday » style club pro (SVG autonomes, viewBox 1000×1400).

Chaque fond est un SVG sans ressource externe (le logo est embarqué en data URI) : il peut
donc servir d'image de fond dans l'appli (un SVG chargé comme image n'a pas accès au réseau).

Usage : python tools/fonds_pro.py <logo.png> <dossier_sortie>
Le logo officiel n'est pas versionné ici : il est fourni par le club.
"""
import base64, io, json, math, random, sys
from pathlib import Path
from PIL import Image

W, H = 1000, 1400
NOIR, CARBONE, ARDOISE, LIGNE = "#0A0A0B", "#141417", "#1E1E22", "#2E2E35"
JAUNE, JAUNE_VIF, JAUNE_PROF, JAUNE_FONCE = "#FDF103", "#FEF75C", "#E6D200", "#6E6200"
BLANC, GRIS = "#F5F5F4", "#A1A1AA"
# Le joueur occupe le bas-centre ; la tête est autour de (500, 330).
TETE = (500, 330)

LOGO = None  # data URI, rempli au lancement


# ---------------------------------------------------------------- briques SVG
class Svg:
    def __init__(self):
        self.defs, self.body, self.n = [], [], 0

    def id(self, p="d"):
        self.n += 1
        return f"{p}{self.n}"

    def d(self, s): self.defs.append(s)
    def b(self, s): self.body.append(s)

    def lin(self, stops, x1=0, y1=0, x2=0, y2=1):
        i = self.id("g")
        self.d(f'<linearGradient id="{i}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">' + stops_(stops) + '</linearGradient>')
        return f"url(#{i})"

    def rad(self, stops, cx=.5, cy=.5, r=.7, fx=None, fy=None):
        i = self.id("r")
        f = f' fx="{fx}" fy="{fy}"' if fx is not None else ""
        self.d(f'<radialGradient id="{i}" cx="{cx}" cy="{cy}" r="{r}"{f}>' + stops_(stops) + '</radialGradient>')
        return f"url(#{i})"

    def rect(self, fill, op=1, extra=""):
        self.b(f'<rect width="{W}" height="{H}" fill="{fill}" opacity="{op}" {extra}/>')

    def mask_lin(self, stops, x1=0, y1=0, x2=0, y2=1):
        """Masque dégradé (blanc = visible)."""
        g = self.lin(stops, x1, y1, x2, y2)
        i = self.id("m")
        self.d(f'<mask id="{i}"><rect width="{W}" height="{H}" fill="{g}"/></mask>')
        return f'mask="url(#{i})"'

    def mask_rad(self, stops, cx=.5, cy=.5, r=.7):
        g = self.rad(stops, cx, cy, r)
        i = self.id("m")
        self.d(f'<mask id="{i}"><rect width="{W}" height="{H}" fill="{g}"/></mask>')
        return f'mask="url(#{i})"'

    def grain(self, op=.07, freq=.85):
        i = self.id("n")
        self.d(f'<filter id="{i}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" '
               f'baseFrequency="{freq}" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter>')
        self.b(f'<rect width="{W}" height="{H}" filter="url(#{i})" opacity="{op}"/>')

    def vignette(self, op=.55):
        self.rect(self.rad([(0, NOIR, 0), (.65, NOIR, 0), (1, NOIR, op)], .5, .45, .85))

    def logo(self, cx, cy, size, mode="couleur", color=JAUNE, op=1, rot=0, extra=""):
        """Écusson. mode : couleur | clair (parties claires en `color`) | sombre (parties noires en `color`)."""
        x, y = cx - size / 2, cy - size / 2
        f = ""
        if mode != "couleur":
            i = self.id("f")
            if mode == "clair":
                m = "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .2126 .7152 .0722 0 0"
            else:
                m = "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.2126 -.7152 -.0722 0 1"
            self.d(f'<filter id="{i}" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" values="{m}" result="l"/>'
                   f'<feComposite in="l" in2="SourceAlpha" operator="in" result="la"/><feFlood flood-color="{color}"/>'
                   f'<feComposite in2="la" operator="in"/></filter>')
            f = f' filter="url(#{i})"'
        t = f' transform="rotate({rot} {cx} {cy})"' if rot else ""
        self.b(f'<g opacity="{op}"{t} {extra}><image href="{LOGO}" x="{x:.0f}" y="{y:.0f}" width="{size:.0f}" height="{size:.0f}"{f}/></g>')

    def text(self, txt, x, y, size, fill="none", stroke=None, sw=0, op=1, anchor="middle", rot=0, ls=0, extra=""):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        t = f' transform="rotate({rot} {x} {y})"' if rot else ""
        self.b(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="\'Archivo Black\',\'Arial Black\',Impact,sans-serif" '
               f'font-weight="900" font-size="{size}" letter-spacing="{ls}" fill="{fill}"{st} opacity="{op}"{t} {extra}>{txt}</text>')

    def svg(self, titre):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">\n'
                f'<title>{titre}</title>\n<defs>{"".join(self.defs)}</defs>\n' + "\n".join(self.body) + "\n</svg>\n")


def stops_(stops):
    out = []
    for s in stops:
        o, c, a = (s + (1,))[:3] if len(s) == 2 else s
        out.append(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>')
    return "".join(out)


# ---------------------------------------------------------------- bases
def base(s, kind):
    """Fonds de départ réutilisés par les familles."""
    if kind == "noir":
        s.rect(s.lin([(0, ARDOISE), (1, NOIR)]))
    elif kind == "noir-spot":
        s.rect(NOIR); s.rect(s.rad([(0, "#34343C"), (1, NOIR, 0)], .5, .25, .7))
    elif kind == "jaune":
        s.rect(s.lin([(0, JAUNE_VIF), (.5, JAUNE), (1, JAUNE_PROF)]))
    elif kind == "jaune-noir":
        s.rect(s.lin([(0, NOIR), (.55, "#3B3800"), (1, JAUNE)]))
    elif kind == "noir-jaune":
        s.rect(s.lin([(0, JAUNE), (.5, "#5A5500"), (1, NOIR)]))
    elif kind == "blanc":
        s.rect(s.lin([(0, "#FFFFFF"), (1, "#DEDEDA")]))
    elif kind == "anthracite":
        s.rect(s.lin([(0, "#2B2B31"), (1, "#101012")], 0, 0, 1, 1))


FONDS = []  # (nom, famille, titre, fonction)


def fond(famille, titre):
    def deco(f):
        FONDS.append((famille, titre, f))
        return f
    return deco


def variantes(famille, items):
    """Enregistre une fonction paramétrée pour plusieurs jeux de paramètres."""
    def deco(f):
        for titre, kw in items:
            FONDS.append((famille, titre, (lambda kw=kw: lambda s: f(s, **kw))()))
        return f
    return deco


# ================================================================ A. Dégradés
@variantes("Dégradés", [
    ("Nuit", dict(stops=[(0, ARDOISE), (1, NOIR)], a=(0, 0, 0, 1))),
    ("Éclipse jaune", dict(stops=[(0, NOIR), (.6, "#2A2800"), (1, JAUNE)], a=(0, 0, 0, 1))),
    ("Aube jaune", dict(stops=[(0, JAUNE), (.55, "#4A4600"), (1, NOIR)], a=(0, 0, 0, 1))),
    ("Diagonale feu", dict(stops=[(0, JAUNE_VIF), (.45, JAUNE_PROF), (1, "#191900")], a=(0, 0, 1, 1))),
    ("Diagonale ombre", dict(stops=[(0, NOIR), (.5, CARBONE), (1, "#45421A")], a=(1, 0, 0, 1))),
    ("Citron", dict(stops=[(0, JAUNE_VIF), (1, JAUNE_PROF)], a=(0, 0, 0, 1))),
    ("Acier", dict(stops=[(0, "#3A3A42"), (.5, "#18181C"), (1, "#050506")], a=(0, 0, 0, 1))),
    ("Blanc studio", dict(stops=[(0, "#FFFFFF"), (1, "#CFCFCB")], a=(0, 0, 0, 1))),
])
def _(s, stops, a):
    s.rect(s.lin(stops, *a)); s.grain(.05)


@variantes("Dégradés", [
    ("Projecteur jaune", dict(c=JAUNE, bg=NOIR, cy=.28, r=.7)),
    ("Projecteur blanc", dict(c="#5A5A62", bg=NOIR, cy=.25, r=.65)),
    ("Soleil noir", dict(c=NOIR, bg=JAUNE, cy=.3, r=.9, inv=True)),
    ("Lueur basse", dict(c=JAUNE, bg=NOIR, cy=1.05, r=.75)),
])
def _(s, c, bg, cy, r, inv=False):
    s.rect(bg)
    s.rect(s.rad([(0, c, .9 if not inv else .0), (1, c, 0 if not inv else .85)], .5, cy, r))
    s.grain(.06)


@fond("Dégradés", "Aurores")
def _(s):
    s.rect(NOIR)
    for cx, cy, r, c, a in [(.1, .1, .6, JAUNE, .55), (.95, .35, .55, JAUNE_PROF, .35), (.3, .95, .6, "#5A5600", .6)]:
        s.rect(s.rad([(0, c, a), (1, c, 0)], cx, cy, r))
    s.grain(.07)


@fond("Dégradés", "Aurores claires")
def _(s):
    s.rect(JAUNE)
    for cx, cy, r, c, a in [(.0, .0, .7, "#FFFFFF", .7), (1, .6, .6, "#C9B800", .6), (.4, 1, .55, NOIR, .35)]:
        s.rect(s.rad([(0, c, a), (1, c, 0)], cx, cy, r))
    s.grain(.05)


# ================================================================ B. Écusson en filigrane
POS = {
    "centre": (500, 380, 900),          # derrière la tête, auréole
    "géant-droite": (900, 520, 1300),   # coupé par le bord droit
    "géant-gauche": (80, 300, 1200),
    "bas-droite": (820, 1150, 950),
    "haut": (500, 120, 1100),
}


@variantes("Écusson filigrane", [
    (f"{p.capitalize()} · {b} · {m}", dict(pos=p, b=b, mode=m, color=c, op=o, rot=r))
    for p, b, m, c, o, r in [
        ("centre", "noir", "clair", "#FFFFFF", .07, 0),
        ("centre", "noir-spot", "clair", JAUNE, .16, 0),
        ("centre", "jaune", "sombre", NOIR, .12, 0),
        ("géant-droite", "noir", "clair", JAUNE, .12, -12),
        ("géant-droite", "jaune", "sombre", NOIR, .1, -12),
        ("géant-droite", "anthracite", "clair", "#FFFFFF", .06, 8),
        ("géant-gauche", "noir", "clair", JAUNE, .1, 15),
        ("géant-gauche", "jaune-noir", "clair", JAUNE, .14, 15),
        ("bas-droite", "noir", "couleur", None, .18, -8),
        ("bas-droite", "blanc", "sombre", NOIR, .07, -8),
        ("haut", "noir", "clair", "#FFFFFF", .05, 0),
        ("haut", "noir-jaune", "sombre", NOIR, .15, 0),
        ("centre", "blanc", "clair", "#C8C8C4", .25, 0),
        ("géant-droite", "noir-spot", "couleur", None, .09, -18),
    ]])
def _(s, pos, b, mode, color, op, rot):
    base(s, b)
    cx, cy, size = POS[pos]
    s.logo(cx, cy, size, mode, color or JAUNE, op, rot)
    s.vignette(.4 if b not in ("jaune", "blanc") else .15); s.grain(.06)


@fond("Écusson filigrane", "Double écusson croisé")
def _(s):
    base(s, "noir")
    s.logo(140, 260, 900, "clair", JAUNE, .09, 20)
    s.logo(900, 1050, 900, "clair", "#FFFFFF", .05, -20)
    s.vignette(.4); s.grain(.06)


@fond("Écusson filigrane", "Écusson néon")
def _(s):
    base(s, "noir")
    i = s.id("glow")
    s.d(f'<filter id="{i}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>')
    s.b(f'<circle cx="500" cy="380" r="400" fill="none" stroke="{JAUNE}" stroke-width="30" opacity=".55" filter="url(#{i})"/>')
    s.b(f'<circle cx="500" cy="380" r="400" fill="none" stroke="{JAUNE_VIF}" stroke-width="6"/>')
    s.logo(500, 380, 760, "clair", JAUNE, .07)
    s.grain(.06)


# ================================================================ C. Motif d'écussons répétés
@variantes("Motif écusson", [
    ("Damier d'écussons · noir", dict(b="noir", c="#FFFFFF", op=.06, size=120, rot=-15, fade="haut")),
    ("Damier d'écussons · jaune", dict(b="jaune", c=NOIR, op=.09, size=120, rot=-15, fade="haut")),
    ("Petits écussons · noir", dict(b="noir", c=JAUNE, op=.1, size=70, rot=0, fade="centre")),
    ("Petits écussons · anthracite", dict(b="anthracite", c="#FFFFFF", op=.07, size=80, rot=20, fade="bas")),
    ("Grands écussons · noir", dict(b="noir-spot", c=JAUNE, op=.07, size=220, rot=-10, fade="haut")),
    ("Grands écussons · blanc", dict(b="blanc", c=NOIR, op=.06, size=200, rot=10, fade="haut")),
    ("Écussons jaunes sur jaune", dict(b="jaune", c="#FFFFFF", op=.25, size=150, rot=-25, fade="centre")),
    ("Trame d'écussons dégradée", dict(b="jaune-noir", c=JAUNE, op=.12, size=100, rot=-15, fade="haut")),
])
def _(s, b, c, op, size, rot, fade):
    base(s, b)
    pid, fid = s.id("p"), s.id("f")
    m = "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .2126 .7152 .0722 0 0"
    s.d(f'<filter id="{fid}" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" values="{m}" result="l"/>'
        f'<feComposite in="l" in2="SourceAlpha" operator="in" result="la"/><feFlood flood-color="{c}"/><feComposite in2="la" operator="in"/></filter>')
    step = size * 1.5
    s.d(f'<pattern id="{pid}" width="{step}" height="{step}" patternUnits="userSpaceOnUse" patternTransform="rotate({rot})">'
        f'<image href="{LOGO}" x="{(step - size) / 2}" y="{(step - size) / 2}" width="{size}" height="{size}" filter="url(#{fid})"/>'
        f'<image href="{LOGO}" x="{step - size / 2}" y="{step - size / 2}" width="{size}" height="{size}" filter="url(#{fid})"/>'
        f'<image href="{LOGO}" x="{-size / 2}" y="{-size / 2}" width="{size}" height="{size}" filter="url(#{fid})"/></pattern>')
    mk = {"haut": s.mask_lin([(0, "#fff"), (.75, "#fff", 0)]),
          "bas": s.mask_lin([(.3, "#fff", 0), (1, "#fff")]),
          "centre": s.mask_rad([(0, "#fff", .1), (.5, "#fff", .6), (1, "#fff")], .5, .3, .8)}[fade]
    s.b(f'<rect x="-500" y="-500" width="2000" height="2400" fill="url(#{pid})" opacity="{op / .1 * .1:.3f}" {mk}/>')
    s.vignette(.35 if b not in ("jaune", "blanc") else .1); s.grain(.05)


# ================================================================ D. Typographie géante
@variantes("Typographie", [
    ("MSH contour géant", dict(b="noir", txt="MSH", size=560, y=560, stroke=JAUNE, sw=4, op=.35, rot=0)),
    ("MSH plein ton sur ton", dict(b="noir", txt="MSH", size=560, y=560, fill="#1F1F24", op=1, rot=0)),
    ("MSH jaune sur jaune", dict(b="jaune", txt="MSH", size=560, y=560, fill="#FFFA7A", op=.8, rot=0)),
    ("MSH vertical", dict(b="noir", txt="MSH", size=430, y=150, x=150, stroke=JAUNE, sw=3, op=.4, rot=90, anchor="start")),
    ("HANDBALL vertical", dict(b="noir-spot", txt="HANDBALL", size=250, y=60, x=110, stroke="#FFFFFF", sw=2, op=.18, rot=90, anchor="start")),
    ("HANDBALL bandeau", dict(b="jaune", txt="HANDBALL", size=210, y=640, fill=NOIR, op=.09, rot=-8)),
    ("Saison 26/27", dict(b="noir", txt="26/27", size=420, y=520, stroke=JAUNE, sw=3, op=.3, rot=0)),
    ("MSH incliné", dict(b="anthracite", txt="MSH", size=620, y=640, stroke="#FFFFFF", sw=3, op=.12, rot=-12)),
])
def _(s, b, txt, size, y, op, rot, x=500, fill="none", stroke=None, sw=0, anchor="middle"):
    base(s, b)
    s.text(txt, x, y, size, fill, stroke, sw, op, anchor, rot, ls=-10)
    s.vignette(.35 if b != "jaune" else .1); s.grain(.06)


@fond("Typographie", "MSH répété en rangées")
def _(s):
    base(s, "noir")
    for i, y in enumerate(range(140, 1500, 190)):
        off = -150 if i % 2 else 0
        s.text("MSH MSH MSH", 500 + off, y, 200, "none", JAUNE if i % 3 == 0 else "#FFFFFF", 2, .14 if i % 3 == 0 else .06, ls=4)
    s.vignette(.45); s.grain(.06)


@fond("Typographie", "Mon'S'port")
def _(s):
    base(s, "jaune")
    s.text("MON'S'PORT", 500, 300, 150, NOIR, None, 0, .08, rot=-90 + 90, ls=-2)
    s.text("HANDBALL", 500, 460, 175, NOIR, None, 0, .08, ls=-2)
    s.grain(.05)


# ================================================================ E. Rayons
@variantes("Rayons", [
    ("Rayons jaunes", dict(b="noir", c=JAUNE, n=24, op=.16)),
    ("Rayons blancs", dict(b="noir-spot", c="#FFFFFF", n=32, op=.06)),
    ("Rayons sur jaune", dict(b="jaune", c="#FFFFFF", n=20, op=.35)),
    ("Rayons noirs sur jaune", dict(b="jaune", c=NOIR, n=28, op=.08)),
    ("Éclat serré", dict(b="noir", c=JAUNE, n=60, op=.1)),
    ("Rayons dorés diffus", dict(b="jaune-noir", c=JAUNE_VIF, n=18, op=.2)),
])
def _(s, b, c, n, op):
    base(s, b)
    cx, cy, R = TETE[0], TETE[1], 2000
    path = []
    for i in range(n):
        a0 = 2 * math.pi * i / n; a1 = a0 + math.pi / n
        path.append(f"M{cx},{cy} L{cx + R * math.cos(a0):.0f},{cy + R * math.sin(a0):.0f} L{cx + R * math.cos(a1):.0f},{cy + R * math.sin(a1):.0f}Z")
    mk = s.mask_rad([(0, "#fff", .2), (.25, "#fff"), (1, "#fff", 0)], .5, TETE[1] / H, .9)
    s.b(f'<path d="{" ".join(path)}" fill="{c}" opacity="{op}" {mk}/>')
    s.vignette(.4 if b != "jaune" else .1); s.grain(.06)


# ================================================================ F. Projecteurs de stade
@variantes("Projecteurs", [
    ("Deux projecteurs", dict(b="noir", c="#FFFFFF", srcs=[(150, -50), (850, -50)], op=.16)),
    ("Trois projecteurs jaunes", dict(b="noir", c=JAUNE, srcs=[(100, -60), (500, -80), (900, -60)], op=.18)),
    ("Projecteur latéral", dict(b="noir", c=JAUNE, srcs=[(1050, -50)], op=.25)),
    ("Faisceaux croisés", dict(b="anthracite", c="#FFFFFF", srcs=[(-50, -50), (1050, -50), (500, -100)], op=.1)),
    ("Projecteurs sur jaune", dict(b="jaune", c="#FFFFFF", srcs=[(200, -50), (800, -50)], op=.45)),
    ("Plafonnier", dict(b="noir", c=JAUNE_VIF, srcs=[(500, -120)], op=.28, wide=True)),
])
def _(s, b, c, srcs, op, wide=False):
    base(s, b)
    i = s.id("bl")
    s.d(f'<filter id="{i}"><feGaussianBlur stdDeviation="22"/></filter>')
    for sx, sy in srcs:
        tx = TETE[0] + (sx - TETE[0]) * .15
        ang = math.atan2(TETE[1] + 300 - sy, tx - sx)
        spread = .32 if wide else .16
        L = 2200
        p1 = (sx + L * math.cos(ang - spread), sy + L * math.sin(ang - spread))
        p2 = (sx + L * math.cos(ang + spread), sy + L * math.sin(ang + spread))
        g = s.rad([(0, c, op * 2.2), (.6, c, op * .6), (1, c, 0)], (sx + 200) / W if sx < W / 2 else (sx - 200) / W, max(0, sy) / H, 1.1)
        s.b(f'<polygon points="{sx},{sy} {p1[0]:.0f},{p1[1]:.0f} {p2[0]:.0f},{p2[1]:.0f}" fill="{g}" filter="url(#{i})"/>')
        s.b(f'<circle cx="{sx}" cy="{max(sy, -10) + 20}" r="60" fill="{c}" opacity=".5" filter="url(#{i})"/>')
    s.grain(.07)


# ================================================================ G. Trame de points
@variantes("Trame", [
    ("Trame jaune montante", dict(b="noir", c=JAUNE, step=22, mask="bas", op=.9)),
    ("Trame blanche descendante", dict(b="noir", c="#FFFFFF", step=18, mask="haut", op=.35)),
    ("Trame noire sur jaune", dict(b="jaune", c=NOIR, step=20, mask="haut", op=.35)),
    ("Trame en halo", dict(b="noir", c=JAUNE, step=16, mask="halo", op=.7)),
    ("Trame diagonale", dict(b="anthracite", c=JAUNE, step=24, mask="diag", op=.6)),
    ("Grosse trame", dict(b="jaune-noir", c=JAUNE, step=40, mask="haut", op=.35)),
])
def _(s, b, c, step, mask, op):
    base(s, b)
    pid = s.id("p")
    s.d(f'<pattern id="{pid}" width="{step}" height="{step}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
        f'<circle cx="{step / 2}" cy="{step / 2}" r="{step * .3}" fill="{c}"/></pattern>')
    mk = {"bas": s.mask_lin([(.35, "#fff", 0), (1, "#fff")]),
          "haut": s.mask_lin([(0, "#fff"), (.6, "#fff", 0)]),
          "halo": s.mask_rad([(0, "#fff", 0), (.25, "#fff", .1), (.45, "#fff"), (.8, "#fff", 0)], .5, TETE[1] / H, .7),
          "diag": s.mask_lin([(0, "#fff"), (.55, "#fff", 0)], 1, 0, 0, 1)}[mask]
    s.b(f'<rect x="-400" y="-400" width="1800" height="2200" fill="url(#{pid})" opacity="{op}" {mk}/>')
    s.vignette(.3 if b != "jaune" else .1); s.grain(.05)


# ================================================================ H. Rayures, bandes, chevrons
@variantes("Bandes", [
    ("Fines rayures", dict(b="noir", c="#FFFFFF", w=3, gap=26, rot=-35, op=.06)),
    ("Rayures jaunes", dict(b="noir", c=JAUNE, w=10, gap=60, rot=-35, op=.18)),
    ("Rayures noires sur jaune", dict(b="jaune", c=NOIR, w=16, gap=64, rot=-35, op=.08)),
    ("Bandes larges", dict(b="noir", c="#25252B", w=90, gap=180, rot=-25, op=1)),
    ("Bandes verticales", dict(b="anthracite", c="#FFFFFF", w=2, gap=40, rot=0, op=.07)),
    ("Rayures croisées", dict(b="noir", c=JAUNE, w=2, gap=34, rot=45, op=.12, cross=True)),
])
def _(s, b, c, w, gap, rot, op, cross=False):
    base(s, b)
    for r in ([rot, -rot] if cross else [rot]):
        pid = s.id("p")
        s.d(f'<pattern id="{pid}" width="{gap}" height="{gap}" patternUnits="userSpaceOnUse" patternTransform="rotate({r})">'
            f'<rect width="{w}" height="{gap}" fill="{c}"/></pattern>')
        s.b(f'<rect x="-500" y="-500" width="2000" height="2400" fill="url(#{pid})" opacity="{op}"/>')
    s.vignette(.45 if b != "jaune" else .12); s.grain(.05)


@variantes("Bandes", [
    ("Chevrons jaunes", dict(b="noir", c=JAUNE, n=4, y0=120, op=.85, th=34)),
    ("Chevrons fins", dict(b="noir", c="#FFFFFF", n=7, y0=60, op=.12, th=10)),
    ("Chevrons noirs sur jaune", dict(b="jaune", c=NOIR, n=5, y0=100, op=.9, th=26)),
    ("Grand chevron", dict(b="noir-spot", c=JAUNE, n=1, y0=320, op=1, th=80)),
    ("Chevrons dégradés", dict(b="anthracite", c=JAUNE, n=6, y0=40, op=.5, th=20, fade=True)),
])
def _(s, b, c, n, y0, op, th, fade=False):
    base(s, b)
    for i in range(n):
        y = y0 + i * (th * 2.4)
        o = op * (1 - i / max(1, n)) if fade else op
        s.b(f'<polyline points="-60,{y + 420} 500,{y} 1060,{y + 420}" fill="none" stroke="{c}" stroke-width="{th}" stroke-linejoin="miter" opacity="{o:.2f}"/>')
    s.vignette(.35 if b != "jaune" else .1); s.grain(.05)


@variantes("Bandes", [
    ("Écharpe diagonale", dict(b="noir", bands=[(JAUNE, 140, 1)], ang=-30, y=700)),
    ("Double écharpe", dict(b="noir", bands=[(JAUNE, 110, 1), ("#FFFFFF", 22, .9)], ang=-30, y=620)),
    ("Écharpe noire", dict(b="jaune", bands=[(NOIR, 170, 1), (NOIR, 20, .6)], ang=-25, y=680)),
    ("Triple bande", dict(b="anthracite", bands=[(JAUNE, 60, 1), (JAUNE, 30, .7), (JAUNE, 12, .5)], ang=-35, y=520)),
])
def _(s, b, bands, ang, y):
    base(s, b)
    yy = y
    for c, t, o in bands:
        s.b(f'<rect x="-600" y="{yy}" width="2200" height="{t}" fill="{c}" opacity="{o}" transform="rotate({ang} 500 {y})"/>')
        yy += t + 28
    s.vignette(.3 if b != "jaune" else .1); s.grain(.05)


# ================================================================ I. Géométrie
def hexagones(s, r, c, op, sw, mk="", fill="none"):
    pts = []
    dx, dy = r * math.sqrt(3), r * 1.5
    for j in range(-1, int(H / dy) + 2):
        for i in range(-1, int(W / dx) + 2):
            cx = i * dx + (dx / 2 if j % 2 else 0); cy = j * dy
            p = " ".join(f"{cx + r * math.cos(math.radians(60 * k + 30)):.1f},{cy + r * math.sin(math.radians(60 * k + 30)):.1f}" for k in range(6))
            pts.append(f'<polygon points="{p}"/>')
    s.b(f'<g fill="{fill}" stroke="{c}" stroke-width="{sw}" opacity="{op}" {mk}>{"".join(pts)}</g>')


@variantes("Géométrie", [
    ("Nid d'abeille", dict(b="noir", r=60, c=JAUNE, op=.25, sw=2, fade="haut")),
    ("Nid d'abeille fin", dict(b="anthracite", r=34, c="#FFFFFF", op=.1, sw=1.5, fade="haut")),
    ("Nid d'abeille sur jaune", dict(b="jaune", r=70, c=NOIR, op=.12, sw=3, fade="haut")),
    ("Hexagones en halo", dict(b="noir", r=46, c=JAUNE, op=.5, sw=2, fade="halo")),
])
def _(s, b, r, c, op, sw, fade):
    base(s, b)
    mk = s.mask_lin([(0, "#fff"), (.7, "#fff", 0)]) if fade == "haut" else \
        s.mask_rad([(0, "#fff", 0), (.3, "#fff", .1), (.5, "#fff"), (.9, "#fff", 0)], .5, TETE[1] / H, .7)
    hexagones(s, r, c, op, sw, mk)
    s.vignette(.35 if b != "jaune" else .1); s.grain(.05)


@variantes("Géométrie", [
    ("Éclats low-poly", dict(pal=["#141417", "#1B1B20", "#222228", "#101013", "#2A2A31"], acc=JAUNE, seed=1)),
    ("Éclats low-poly jaunes", dict(pal=[JAUNE, JAUNE_VIF, JAUNE_PROF, "#F7EA00", "#FFF45A"], acc=NOIR, seed=2)),
    ("Éclats mixtes", dict(pal=["#141417", "#1B1B20", "#222228", "#2E2B10", "#3D3A0A"], acc=JAUNE, seed=3)),
    ("Éclats acier", dict(pal=["#26262C", "#303037", "#1C1C21", "#3A3A42", "#16161A"], acc="#FFFFFF", seed=4)),
])
def _(s, pal, acc, seed):
    rnd = random.Random(seed)
    cols, rows = 7, 10
    pts = [[(i * W / (cols - 1) + (rnd.uniform(-60, 60) if 0 < i < cols - 1 else 0),
             j * H / (rows - 1) + (rnd.uniform(-60, 60) if 0 < j < rows - 1 else 0)) for i in range(cols)] for j in range(rows)]
    out = []
    for j in range(rows - 1):
        for i in range(cols - 1):
            a, b_, c, d = pts[j][i], pts[j][i + 1], pts[j + 1][i], pts[j + 1][i + 1]
            for tri in ((a, b_, d), (a, d, c)):
                col = rnd.choice(pal)
                if rnd.random() < .04: col = acc
                out.append(f'<polygon points="{" ".join(f"{x:.0f},{y:.0f}" for x, y in tri)}" fill="{col}" stroke="{col}" stroke-width="1"/>')
    s.b("".join(out))
    s.vignette(.3); s.grain(.05)


@variantes("Géométrie", [
    ("Sol en perspective", dict(b="noir", c=JAUNE, op=.4)),
    ("Grille blanche", dict(b="anthracite", c="#FFFFFF", op=.15)),
    ("Grille sur jaune", dict(b="jaune", c=NOIR, op=.15)),
])
def _(s, b, c, op):
    base(s, b)
    hz, vx = 760, 500
    lines = []
    for i in range(-14, 15):
        lines.append(f'<line x1="{vx}" y1="{hz}" x2="{vx + i * 160}" y2="{H + 400}"/>')
    y = hz
    for k in range(1, 18):
        y = hz + (k ** 1.9) * 2.4
        lines.append(f'<line x1="-100" y1="{y:.0f}" x2="1100" y2="{y:.0f}"/>')
    mk = s.mask_lin([(hz / H, "#fff", 0), (1, "#fff")])
    s.b(f'<g stroke="{c}" stroke-width="2" opacity="{op}" {mk}>{"".join(lines)}</g>')
    s.rect(s.rad([(0, c, .25), (1, c, 0)], .5, hz / H, .4))
    s.grain(.06)


@variantes("Géométrie", [
    ("Cercles concentriques", dict(b="noir", c=JAUNE, n=14, gap=70, op=.2)),
    ("Ondes blanches", dict(b="noir-spot", c="#FFFFFF", n=22, gap=45, op=.06)),
    ("Cibles sur jaune", dict(b="jaune", c=NOIR, n=12, gap=80, op=.08)),
])
def _(s, b, c, n, gap, op):
    base(s, b)
    rings = "".join(f'<circle cx="{TETE[0]}" cy="{TETE[1]}" r="{220 + i * gap}"/>' for i in range(n))
    s.b(f'<g fill="none" stroke="{c}" stroke-width="3" opacity="{op}">{rings}</g>')
    s.vignette(.35 if b != "jaune" else .1); s.grain(.05)


# ================================================================ J. Ondes et vitesse
@variantes("Ondes", [
    ("Lignes topographiques", dict(b="noir", c=JAUNE, n=26, amp=60, op=.25, seed=1)),
    ("Topo blanc", dict(b="anthracite", c="#FFFFFF", n=34, amp=45, op=.08, seed=2)),
    ("Topo sur jaune", dict(b="jaune", c=NOIR, n=24, amp=70, op=.1, seed=3)),
    ("Vagues amples", dict(b="noir", c=JAUNE, n=12, amp=140, op=.3, seed=4)),
])
def _(s, b, c, n, amp, op, seed):
    base(s, b)
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]
    paths = []
    for k in range(n):
        y0 = -100 + k * (H + 200) / n
        pts = []
        for x in range(-50, W + 60, 25):
            y = y0 + amp * (math.sin(x / 180 + ph[0] + k * .15) * .6 + math.sin(x / 90 + ph[1]) * .25 + math.sin(x / 47 + ph[2] + k * .3) * .15)
            pts.append(f"{x},{y:.1f}")
        paths.append(f'<polyline points="{" ".join(pts)}"/>')
    s.b(f'<g fill="none" stroke="{c}" stroke-width="2.2" opacity="{op}">{"".join(paths)}</g>')
    s.vignette(.35 if b != "jaune" else .1); s.grain(.05)


@variantes("Ondes", [
    ("Traînées horizontales", dict(b="noir", seed=4, ang=0, jaune=.18)),
    ("Traînées obliques", dict(b="noir", seed=5, ang=-20, jaune=.25)),
    ("Traînées blanches", dict(b="anthracite", seed=6, ang=0, jaune=0)),
    ("Traînées sur jaune", dict(b="jaune", seed=7, ang=-15, jaune=0, dark=True)),
    ("Hypervitesse", dict(b="noir", seed=8, ang=0, jaune=.4, dense=True)),
])
def _(s, b, seed, ang, jaune, dark=False, dense=False):
    base(s, b)
    rnd = random.Random(seed)
    out = []
    for _ in range(260 if dense else 140):
        y = rnd.uniform(-200, H + 200); x = rnd.uniform(-300, W); ln = rnd.uniform(80, 520); h = rnd.choice([2, 3, 4, 6, 9])
        if dark: col, op = NOIR, rnd.uniform(.05, .2)
        elif rnd.random() < jaune: col, op = JAUNE, rnd.uniform(.4, .95)
        else: col, op = "#A0A0A8", rnd.uniform(.05, .3)
        out.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{ln:.0f}" height="{h}" rx="{h / 2}" fill="{col}" opacity="{op:.2f}"/>')
    mk = s.mask_lin([(0, "#fff"), (.5, "#fff", .3), (1, "#fff")], 0, 0, 1, 0)
    s.b(f'<g transform="rotate({ang} 500 700)" {mk}>{"".join(out)}</g>')
    s.vignette(.35 if b != "jaune" else .1); s.grain(.05)


# ================================================================ K. Cadre carte
def cadre(s, c=JAUNE, ep=22, marge=28, coins=True, bandeau=None):
    s.b(f'<rect x="{marge}" y="{marge}" width="{W - 2 * marge}" height="{H - 2 * marge}" fill="none" stroke="{c}" stroke-width="{ep}" rx="18"/>')
    if coins:
        L = 120
        for (x, y, sx, sy) in [(marge, marge, 1, 1), (W - marge, marge, -1, 1), (marge, H - marge, 1, -1), (W - marge, H - marge, -1, -1)]:
            s.b(f'<polyline points="{x + sx * L},{y + sy * ep * 2.2} {x + sx * ep * 2.2},{y + sy * ep * 2.2} {x + sx * ep * 2.2},{y + sy * L}" '
                f'fill="none" stroke="{c}" stroke-width="6"/>')
    if bandeau:
        s.b(f'<path d="M{marge},{H - 260} L{W - marge},{H - 330} L{W - marge},{H - marge} L{marge},{H - marge} Z" fill="{bandeau}" opacity=".92"/>')


@variantes("Cadre carte", [
    ("Carte noire liseré jaune", dict(fn="noir", c=JAUNE)),
    ("Carte jaune liseré noir", dict(fn="jaune", c=NOIR)),
    ("Carte projecteur", dict(fn="noir-spot", c=JAUNE, bandeau=JAUNE)),
    ("Carte écusson", dict(fn="ecusson", c=JAUNE)),
    ("Carte rayons", dict(fn="rayons", c=JAUNE, bandeau=NOIR)),
    ("Carte blanche", dict(fn="blanc", c=JAUNE, bandeau=NOIR)),
    ("Carte trame", dict(fn="trame", c=JAUNE)),
    ("Carte double liseré", dict(fn="noir", c=JAUNE, double=True)),
    ("Carte jaune bandeau noir", dict(fn="jaune", c=NOIR, bandeau=NOIR)),
    ("Carte or et noir", dict(fn="jaune-noir", c=JAUNE_VIF, bandeau=NOIR)),
])
def _(s, fn, c, bandeau=None, double=False):
    if fn == "ecusson":
        base(s, "noir"); s.logo(500, 380, 900, "clair", JAUNE, .1)
    elif fn == "rayons":
        base(s, "noir")
        n, cx, cy, R = 24, TETE[0], TETE[1], 2000
        path = " ".join(f"M{cx},{cy} L{cx + R * math.cos(2 * math.pi * i / n):.0f},{cy + R * math.sin(2 * math.pi * i / n):.0f} "
                        f"L{cx + R * math.cos(2 * math.pi * i / n + math.pi / n):.0f},{cy + R * math.sin(2 * math.pi * i / n + math.pi / n):.0f}Z" for i in range(n))
        s.b(f'<path d="{path}" fill="{JAUNE}" opacity=".1"/>')
    elif fn == "trame":
        base(s, "noir")
        pid = s.id("p")
        s.d(f'<pattern id="{pid}" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="10" cy="10" r="6" fill="{JAUNE}"/></pattern>')
        s.b(f'<rect x="-400" y="-400" width="1800" height="2200" fill="url(#{pid})" opacity=".6" {s.mask_lin([(.4, "#fff", 0), (1, "#fff")])}/>')
    else:
        base(s, fn)
    s.vignette(.3 if fn not in ("jaune", "blanc") else .08)
    cadre(s, c, bandeau=bandeau)
    if double:
        s.b(f'<rect x="64" y="64" width="{W - 128}" height="{H - 128}" fill="none" stroke="{c}" stroke-width="3" rx="12" opacity=".7"/>')
    s.logo(860, 150, 170, "couleur", op=1)
    s.grain(.05)


# ================================================================ L. Néons et effets
@variantes("Néon", [
    ("Anneau néon", dict(shape="cercle", c=JAUNE)),
    ("Triangle néon", dict(shape="triangle", c=JAUNE)),
    ("Losange néon", dict(shape="losange", c=JAUNE)),
    ("Hexagone néon", dict(shape="hexagone", c=JAUNE)),
    ("Anneau blanc", dict(shape="cercle", c="#FFFFFF")),
])
def _(s, shape, c):
    base(s, "noir")
    cx, cy = TETE
    if shape == "cercle":
        el = f'<circle cx="{cx}" cy="{cy}" r="360"/>'
    else:
        k = {"triangle": 3, "losange": 4, "hexagone": 6}[shape]
        r = 420 if k == 3 else 380
        off = -90
        el = '<polygon points="' + " ".join(f"{cx + r * math.cos(math.radians(off + 360 * i / k)):.0f},{cy + 40 + r * math.sin(math.radians(off + 360 * i / k)):.0f}" for i in range(k)) + '"/>'
    i = s.id("gl")
    s.d(f'<filter id="{i}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>')
    s.b(f'<g fill="none" stroke="{c}" stroke-width="34" opacity=".6" filter="url(#{i})">{el}</g>')
    s.b(f'<g fill="none" stroke="{c}" stroke-width="10">{el}</g>')
    s.b(f'<g fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".8">{el}</g>')
    s.rect(s.rad([(0, c, .12), (1, c, 0)], .5, cy / H, .5))
    s.grain(.07)


@fond("Néon", "Glitch")
def _(s):
    base(s, "noir")
    rnd = random.Random(9)
    for _ in range(40):
        y = rnd.uniform(0, 900); h = rnd.uniform(4, 40); x = rnd.uniform(-200, 600); w = rnd.uniform(200, 900)
        c = rnd.choice([JAUNE, "#FFFFFF", "#2E2E35"])
        s.b(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" fill="{c}" opacity="{rnd.uniform(.05, .35):.2f}"/>')
    s.text("MSH", 500, 560, 520, "none", JAUNE, 3, .25, ls=-10)
    s.text("MSH", 512, 552, 520, "none", "#FFFFFF", 2, .12, ls=-10)
    s.grain(.08)


@fond("Néon", "Éclair")
def _(s):
    base(s, "noir")
    i = s.id("gl")
    s.d(f'<filter id="{i}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>')
    pts = "880,0 700,420 820,430 560,900 640,910 380,1400"
    s.b(f'<polyline points="{pts}" fill="none" stroke="{JAUNE}" stroke-width="40" opacity=".6" filter="url(#{i})"/>')
    s.b(f'<polyline points="{pts}" fill="none" stroke="{JAUNE_VIF}" stroke-width="12"/>')
    s.grain(.07)


@fond("Néon", "Fumée jaune")
def _(s):
    base(s, "noir")
    i = s.id("sm")
    s.d(f'<filter id="{i}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.008" numOctaves="4" seed="11"/>'
        f'<feColorMatrix values="0 0 0 0 0.99  0 0 0 0 0.94  0 0 0 0 0.01  0 0 0 1.6 -0.6"/></filter>')
    s.b(f'<rect width="{W}" height="{H}" filter="url(#{i})" opacity=".55"/>')
    s.vignette(.6); s.grain(.06)


@fond("Néon", "Fumée blanche")
def _(s):
    base(s, "anthracite")
    i = s.id("sm")
    s.d(f'<filter id="{i}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.005 0.01" numOctaves="4" seed="21"/>'
        f'<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.4 -0.55"/></filter>')
    s.b(f'<rect width="{W}" height="{H}" filter="url(#{i})" opacity=".35"/>')
    s.logo(500, 380, 820, "clair", JAUNE, .08)
    s.vignette(.6); s.grain(.06)


# ================================================================ M. Panthère
# Panthère redessinée pour les maillots (mshb-refonte/maillots/panthere.py) : interprétation
# vectorielle du logo, à valider par le club. Repère natif : tête x 62..796, y 48..548, museau à droite.
P_CORE = [(62, 126), (300, 86), (540, 48), (562, 56), (566, 80), (790, 96), (796, 122), (766, 290),
          (724, 298), (694, 384), (678, 304), (560, 314), (505, 335), (478, 372), (482, 408), (515, 440),
          (552, 470), (592, 448), (612, 438), (600, 472), (578, 500), (520, 548),
          (440, 500), (400, 452), (345, 352), (240, 214), (108, 166)]
P_NECK = [(62, 126), (108, 166), (240, 214), (345, 352), (400, 452), (440, 500),
          (300, 610), (140, 900), (-400, 900), (-400, 360)]
P_EYE = [(425, 202), (442, 168), (482, 146), (548, 134), (522, 150), (472, 164), (442, 192)]
P_BROW = [(483, 98), (537, 104), (523, 121), (492, 118)]
# Silhouette d'un seul tenant (tête + cou) : contour extérieur sans la diagonale de nuque.
P_SIL = P_CORE[:22] + [(440, 500), (300, 610), (140, 900), (-400, 900), (-400, 360), (62, 126)]

PLACES = {
    # nom : (échelle, tx, ty, miroir) ; œil visible au-dessus de l'épaule, museau vers le joueur
    "droite": (1.1, -398, 43, True),
    "droite-géante": (1.6, -620, -60, True),
    "gauche": (1.1, -398, 43, False),
    "haut-droite": (.8, -80, -10, True),
    "centre-haut": (1.25, -220, -40, False),
}


def pts_(p): return " ".join(f"{x},{y}" for x, y in p)


def p_transform(place):
    s_, tx, ty, mir = PLACES[place]
    t = f"translate({W},0) scale(-1,1) " if mir else ""
    return t + f"translate({tx},{ty}) scale({s_})", s_


def panthere(s, place="droite", fill=NOIR, op=1, eye=JAUNE, eye_op=1, stroke=None, sw=8, glow=None, extra=""):
    t, sc = p_transform(place)
    if glow:
        i = s.id("pg")
        s.d(f'<filter id="{i}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="{glow / sc:.1f}"/></filter>')
        s.b(f'<g transform="{t}"><polygon points="{pts_(P_SIL)}" fill="none" stroke="{stroke or JAUNE}" stroke-width="{sw * 3 / sc:.1f}" opacity=".6" filter="url(#{i})"/></g>')
    st = f' stroke="{stroke}" stroke-width="{sw / sc:.2f}" stroke-linejoin="miter"' if stroke else ""
    s.b(f'<g transform="{t}" {extra}><polygon points="{pts_(P_SIL)}" fill="{fill}" fill-opacity="{op}"{st}/>'
        f'<polygon points="{pts_(P_EYE)}" fill="{eye}" opacity="{eye_op}"/><polygon points="{pts_(P_BROW)}" fill="{eye}" opacity="{eye_op}"/></g>')


def panthere_lignes(s, place, c, n=6, gap=14, op=.8):
    """Contours concentriques (effet « onde » autour de la silhouette)."""
    t, sc = p_transform(place)
    for k in range(n, 0, -1):
        s.b(f'<g transform="{t}"><polygon points="{pts_(P_SIL)}" fill="none" stroke="{c}" stroke-width="{(2.5 + k * gap * 2) / sc:.1f}" '
            f'stroke-linejoin="round" opacity="{op * (1 - k / (n + 1)) * .35:.3f}"/></g>')


@variantes("Panthère", [
    ("Panthère fantôme", dict(b="noir", place="droite", fill="#2C2C33", eye=JAUNE)),
    ("Panthère fantôme géante", dict(b="noir-spot", place="droite-géante", fill="#26262C", eye=JAUNE)),
    ("Panthère détourée jaune", dict(b="noir", place="droite", fill=NOIR, stroke=JAUNE, sw=9)),
    ("Panthère néon", dict(b="noir", place="droite", fill=NOIR, stroke=JAUNE_VIF, sw=6, glow=20)),
    ("Panthère noire sur jaune", dict(b="jaune", place="droite", fill=NOIR, eye=JAUNE)),
    ("Panthère XXL sur jaune", dict(b="jaune", place="droite-géante", fill=NOIR, eye=JAUNE)),
    ("Panthère jaune sur noir", dict(b="noir", place="droite", fill=JAUNE, eye=NOIR)),
    ("Panthère gauche fantôme", dict(b="anthracite", place="gauche", fill="#3A3A42", op=.6, eye=JAUNE)),
    ("Panthère gauche détourée", dict(b="noir", place="gauche", fill=NOIR, stroke=JAUNE, sw=9)),
    ("Panthère au-dessus", dict(b="noir", place="centre-haut", fill="#24242A", eye=JAUNE)),
    ("Panthère en coin", dict(b="noir-spot", place="haut-droite", fill=NOIR, stroke=JAUNE, sw=7)),
    ("Panthère ton sur ton jaune", dict(b="jaune", place="droite-géante", fill="#FFFFFF", op=.35, eye=NOIR, eye_op=.5)),
    ("Panthère blanche", dict(b="noir", place="droite", fill="#FFFFFF", op=.07, eye="#FFFFFF", eye_op=.6)),
    ("Panthère sur blanc", dict(b="blanc", place="droite", fill=NOIR, eye=JAUNE)),
    ("Panthère sur dégradé feu", dict(b="jaune-noir", place="droite", fill=NOIR, stroke=JAUNE, sw=6)),
])
def _(s, b, place, fill, eye=JAUNE, op=1, eye_op=1, stroke=None, sw=8, glow=None):
    base(s, b)
    panthere(s, place, fill, op, eye, eye_op, stroke, sw, glow)
    s.vignette(.3 if b not in ("jaune", "blanc") else .08); s.grain(.05)


@variantes("Panthère", [
    ("Panthère en ondes jaunes", dict(b="noir", place="droite", c=JAUNE)),
    ("Panthère en ondes blanches", dict(b="anthracite", place="droite-géante", c="#FFFFFF")),
    ("Panthère en ondes sur jaune", dict(b="jaune", place="droite", c=NOIR)),
])
def _(s, b, place, c):
    base(s, b)
    panthere_lignes(s, place, c)
    panthere(s, place, NOIR if b != "jaune" else NOIR, 1, JAUNE)
    s.vignette(.3 if b != "jaune" else .08); s.grain(.05)


@variantes("Panthère", [
    ("Panthère tramée", dict(b="noir", place="droite-géante", c=JAUNE, step=18)),
    ("Panthère tramée sur jaune", dict(b="jaune", place="droite-géante", c=NOIR, step=16)),
    ("Panthère rayée", dict(b="noir", place="droite", c=JAUNE, step=0)),
])
def _(s, b, place, c, step):
    base(s, b)
    pid = s.id("p")
    if step:
        s.d(f'<pattern id="{pid}" width="{step}" height="{step}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
            f'<circle cx="{step / 2}" cy="{step / 2}" r="{step * .32}" fill="{c}"/></pattern>')
    else:
        s.d(f'<pattern id="{pid}" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="9" height="24" fill="{c}"/></pattern>')
    t, sc = p_transform(place)
    cid = s.id("c")
    s.d(f'<clipPath id="{cid}"><polygon points="{pts_(P_SIL)}" transform="{t}"/></clipPath>')
    s.b(f'<rect width="{W}" height="{H}" fill="url(#{pid})" clip-path="url(#{cid})" opacity=".55"/>')
    s.b(f'<g transform="{t}"><polygon points="{pts_(P_EYE)}" fill="{c}"/><polygon points="{pts_(P_BROW)}" fill="{c}"/></g>')
    s.vignette(.3 if b != "jaune" else .08); s.grain(.05)


@fond("Panthère", "Face à face")
def _(s):
    base(s, "noir")
    t1, sc = p_transform("droite"); t2, _ = p_transform("gauche")
    for t in (t1, t2):
        s.b(f'<g transform="{t}"><polygon points="{pts_(P_SIL)}" fill="#24242A" stroke="{JAUNE}" stroke-width="{4 / sc:.1f}" stroke-opacity=".6"/>'
            f'<polygon points="{pts_(P_EYE)}" fill="{JAUNE}"/><polygon points="{pts_(P_BROW)}" fill="{JAUNE}"/></g>')
    s.vignette(.35); s.grain(.05)


@fond("Panthère", "Regard dans l'ombre")
def _(s):
    """Noir profond : seuls l'œil et l'arcade de la panthère ressortent."""
    s.rect(s.lin([(0, "#121214"), (1, "#050506")]))
    i = s.id("gl")
    s.d(f'<filter id="{i}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>')
    t, sc = p_transform("droite-géante")
    s.b(f'<g transform="{t}"><polygon points="{pts_(P_SIL)}" fill="#141417"/>'
        f'<polygon points="{pts_(P_EYE)}" fill="{JAUNE}" filter="url(#{i})" opacity=".9"/><polygon points="{pts_(P_EYE)}" fill="{JAUNE_VIF}"/>'
        f'<polygon points="{pts_(P_BROW)}" fill="{JAUNE}"/></g>')
    s.grain(.06)


# ================================================================ N. Griffures
def griffe(*a, **k):
    """Une griffure en chemin SVG."""
    p = griffe_pts(*a, **k)
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in p) + "Z"


def griffe_pts(x0, y0, x1, y1, w, courbe=.12, seed=0, dent=.25, n=40):
    """Une griffure : trait effilé aux deux bouts, légèrement courbe, bords déchiquetés (liste de points)."""
    rnd = random.Random(seed)
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy); nx, ny = -dy / L, dx / L
    gauche, droite = [], []
    for i in range(n + 1):
        t = i / n
        prof = math.sin(math.pi * t) ** .7 * (1 - .35 * t)           # plus large au début du geste
        bx = x0 + dx * t + nx * courbe * L * math.sin(math.pi * t)
        by = y0 + dy * t + ny * courbe * L * math.sin(math.pi * t)
        e = w / 2 * prof
        j1 = 1 + rnd.uniform(-dent, dent); j2 = 1 + rnd.uniform(-dent, dent)
        gauche.append((bx + nx * e * j1, by + ny * e * j1)); droite.append((bx - nx * e * j2, by - ny * e * j2))
    return gauche + droite[::-1]


def griffes(x0, y0, x1, y1, w=60, k=3, ecart=70, courbe=.1, seed=0, pts=False):
    """k griffures parallèles (chemins SVG, ou listes de points si pts=True)."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy); nx, ny = -dy / L, dx / L
    out = []
    for i in range(k):
        o = (i - (k - 1) / 2) * ecart
        dec = (i - (k - 1) / 2) * 25  # décalage le long du geste, comme de vrais doigts
        ux, uy = dx / L * dec, dy / L * dec
        out.append((griffe_pts if pts else griffe)(x0 + nx * o + ux, y0 + ny * o + uy, x1 + nx * o + ux, y1 + ny * o + uy, w * (1 - abs(o) / (ecart * k) * .5), courbe, seed + i))
    return out


ZONES = {
    # zones où les griffures restent visibles autour du joueur
    "haut-gauche": (40, 60, 360, 720),
    "haut-droite": (960, 60, 640, 720),
    "traversante": (1060, -60, -60, 1100),
    "gauche": (60, 200, 300, 1300),
    "droite": (940, 200, 700, 1300),
}


def dechirure(s, d, fond_haut, op=1):
    """Griffure façon déchirure : on voit la couche du dessous, avec une ombre portée."""
    i = s.id("sh")
    s.d(f'<filter id="{i}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".7"/></filter>')
    s.b(f'<path d="{d}" fill="{fond_haut}" opacity="{op}" filter="url(#{i})"/>')


@variantes("Griffures", [
    ("Griffures jaunes", dict(b="noir", zone="haut-gauche", c=JAUNE, k=3, w=60)),
    ("Griffures jaunes droite", dict(b="noir", zone="haut-droite", c=JAUNE, k=3, w=60)),
    ("Grandes griffures", dict(b="noir", zone="traversante", c=JAUNE, k=3, w=95, ecart=120)),
    ("Griffures noires sur jaune", dict(b="jaune", zone="haut-gauche", c=NOIR, k=3, w=60)),
    ("Grandes griffures noires", dict(b="jaune", zone="traversante", c=NOIR, k=3, w=95, ecart=120)),
    ("Griffures blanches", dict(b="anthracite", zone="haut-droite", c="#FFFFFF", k=4, w=40, ecart=55, op=.85)),
    ("Quatre griffures", dict(b="noir-spot", zone="haut-gauche", c=JAUNE, k=4, w=50, ecart=58)),
    ("Griffures discrètes", dict(b="noir", zone="traversante", c="#2E2E35", k=3, w=95, ecart=120)),
    ("Griffures latérales", dict(b="noir", zone="gauche", c=JAUNE, k=3, w=55, ecart=60)),
    ("Griffures des deux côtés", dict(b="noir", zone="gauche", c=JAUNE, k=3, w=50, ecart=55, double=True)),
])
def _(s, b, zone, c, k, w, ecart=70, op=1, double=False):
    base(s, b)
    zs = [zone] + (["droite"] if double else [])
    for zi, z in enumerate(zs):
        for d in griffes(*ZONES[z], w=w, k=k, ecart=ecart, seed=7 + zi * 5):
            s.b(f'<path d="{d}" fill="{c}" opacity="{op}"/>')
    s.vignette(.3 if b != "jaune" else .08); s.grain(.06)


@variantes("Griffures", [
    ("Déchirure jaune", dict(b="noir", zone="traversante", dessous=JAUNE, w=100, ecart=125)),
    ("Déchirure sur le côté", dict(b="noir", zone="haut-droite", dessous=JAUNE, w=70, ecart=80)),
    ("Déchirure noire", dict(b="jaune", zone="traversante", dessous=NOIR, w=100, ecart=125)),
    ("Déchirure blanche", dict(b="noir", zone="haut-gauche", dessous="#F2F2F0", w=70, ecart=80)),
])
def _(s, b, zone, dessous, w, ecart):
    base(s, b)
    for d in griffes(*ZONES[zone], w=w, k=3, ecart=ecart, seed=21):
        dechirure(s, d, dessous)
    s.vignette(.3 if b != "jaune" else .08); s.grain(.06)


@variantes("Griffures", [
    ("Griffures néon", dict(zone="haut-gauche", c=JAUNE)),
    ("Griffures néon traversantes", dict(zone="traversante", c=JAUNE)),
    ("Griffures néon blanches", dict(zone="haut-droite", c="#FFFFFF")),
])
def _(s, zone, c):
    base(s, "noir")
    i = s.id("gl")
    s.d(f'<filter id="{i}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>')
    ds = griffes(*ZONES[zone], w=50 if zone != "traversante" else 70, k=3, ecart=70 if zone != "traversante" else 110, seed=33)
    for d in ds: s.b(f'<path d="{d}" fill="{c}" opacity=".7" filter="url(#{i})"/>')
    for d in ds: s.b(f'<path d="{d}" fill="{c}"/>')
    s.grain(.07)


@fond("Griffures", "Griffures sur trame")
def _(s):
    base(s, "noir")
    pid = s.id("p")
    s.d(f'<pattern id="{pid}" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="9" cy="9" r="5" fill="{JAUNE}"/></pattern>')
    for d in griffes(*ZONES["traversante"], w=110, k=3, ecart=130, seed=41):
        s.b(f'<path d="{d}" fill="url(#{pid})"/>')
    s.vignette(.3); s.grain(.06)


@fond("Griffures", "Griffures en filigrane d'écusson")
def _(s):
    base(s, "noir-spot")
    s.logo(500, 380, 900, "clair", JAUNE, .08)
    for d in griffes(*ZONES["haut-gauche"], w=60, k=3, seed=51):
        s.b(f'<path d="{d}" fill="{JAUNE}"/>')
    s.vignette(.35); s.grain(.06)


# ================================================================ O. Panthère et griffures
@variantes("Panthère et griffures", [
    ("Panthère et griffures", dict(b="noir", place="droite", pfill="#2C2C33", zone="haut-gauche", c=JAUNE)),
    ("Panthère détourée et griffures", dict(b="noir", place="droite", pfill=NOIR, stroke=JAUNE, zone="haut-gauche", c=JAUNE)),
    ("Panthère noire, griffures noires", dict(b="jaune", place="droite", pfill=NOIR, zone="haut-gauche", c=NOIR)),
    ("Panthère géante griffée", dict(b="noir-spot", place="droite-géante", pfill="#26262C", zone="traversante", c=JAUNE, w=90, ecart=115)),
    ("Panthère gauche, griffures droite", dict(b="noir", place="gauche", pfill="#2C2C33", zone="haut-droite", c=JAUNE)),
    ("Panthère néon griffée", dict(b="noir", place="droite", pfill=NOIR, stroke=JAUNE_VIF, glow=18, zone="haut-gauche", c=JAUNE)),
    ("Panthère déchirée", dict(b="noir", place="droite", pfill="#2C2C33", zone="traversante", dessous=JAUNE, w=95, ecart=120)),
    ("Panthère XXL et déchirure", dict(b="jaune", place="droite-géante", pfill=NOIR, zone="haut-gauche", dessous=NOIR, w=65, ecart=75)),
    ("Panthère blanche griffée", dict(b="anthracite", place="droite", pfill="#FFFFFF", pop=.07, zone="haut-gauche", c="#FFFFFF")),
    ("Panthère tramée griffée", dict(b="noir", place="droite-géante", trame=True, zone="haut-gauche", c=JAUNE)),
])
def _(s, b, place, zone, c=JAUNE, pfill=NOIR, pop=1, stroke=None, glow=None, w=60, ecart=70, dessous=None, trame=False):
    base(s, b)
    if trame:
        pid = s.id("p")
        s.d(f'<pattern id="{pid}" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="9" cy="9" r="5.5" fill="{JAUNE}"/></pattern>')
        t, sc = p_transform(place); cid = s.id("c")
        s.d(f'<clipPath id="{cid}"><polygon points="{pts_(P_SIL)}" transform="{t}"/></clipPath>')
        s.b(f'<rect width="{W}" height="{H}" fill="url(#{pid})" clip-path="url(#{cid})" opacity=".5"/>')
        s.b(f'<g transform="{t}"><polygon points="{pts_(P_EYE)}" fill="{JAUNE}"/><polygon points="{pts_(P_BROW)}" fill="{JAUNE}"/></g>')
    else:
        panthere(s, place, pfill, pop, JAUNE if b != "jaune" else JAUNE, 1, stroke, 8, glow)
    for d in griffes(*ZONES[zone], w=w, k=3, ecart=ecart, seed=61):
        if dessous: dechirure(s, d, dessous)
        else: s.b(f'<path d="{d}" fill="{c}"/>')
    s.vignette(.3 if b != "jaune" else .08); s.grain(.06)


# ---------------------------------------------------------------- main
def logo_data_uri(path, size=420):
    im = Image.open(path).convert("RGBA")
    im.thumbnail((size, size), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


if __name__ == "__main__":
    logo_path, out = sys.argv[1], Path(sys.argv[2])
    LOGO = logo_data_uri(logo_path)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.svg"): old.unlink()
    index = []
    for n, (famille, titre, f) in enumerate(FONDS, 1):
        s = Svg(); f(s)
        nom = f"{n:03d}.svg"
        (out / nom).write_text(s.svg(f"{n:03d} · {titre}"), encoding="utf-8")
        index.append({"n": n, "fichier": nom, "famille": famille, "titre": titre})
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(index), "fonds")
