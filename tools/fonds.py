"""Génère les fonds « style club » en SVG (viewBox 1000×1400, vignette 5:7).

La panthère est celle redessinée pour les maillots (mshb-refonte/maillots/panthere.py) :
interprétation vectorielle du logo, à valider par le club.
Usage : python tools/fonds.py <dossier_sortie>
"""
import sys
from pathlib import Path

NOIR, CARBONE, ARDOISE, LIGNE = "#0A0A0B", "#141417", "#1E1E22", "#2E2E35"
JAUNE, JAUNE_VIF, JAUNE_FONCE = "#FDF103", "#FEF75C", "#6E6200"
W, H = 1000, 1400

# --- panthère (copie de maillots/panthere.py) ---
CORE = [(62, 126), (300, 86), (540, 48), (562, 56), (566, 80), (790, 96), (796, 122), (766, 290),
        (724, 298), (694, 384), (678, 304), (560, 314), (505, 335), (478, 372), (482, 408), (515, 440),
        (552, 470), (592, 448), (612, 438), (600, 472), (578, 500), (520, 548),
        (440, 500), (400, 452), (345, 352), (240, 214), (108, 166)]
NECK = [(62, 126), (108, 166), (240, 214), (345, 352), (400, 452), (440, 500),
        (300, 610), (140, 900), (-400, 900), (-400, 360)]
EYE = [(425, 202), (442, 168), (482, 146), (548, 134), (522, 150), (472, 164), (442, 192)]
BROW = [(483, 98), (537, 104), (523, 121), (492, 118)]


def pts(p):
    return " ".join(f"{x},{y}" for x, y in p)


def panthere(s=1.1, tx=-398, ty=43, miroir=True, corps="", oeil="", contour=None):
    """Tête de panthère placée à droite, museau vers le joueur, œil visible en haut à droite."""
    t = f"translate({W},0) scale(-1,1) " if miroir else ""
    t += f"translate({tx},{ty}) scale({s})"
    out = [f'<g transform="{t}">']
    if contour:
        col, ep = contour
        out.append(f'<polygon points="{pts(NECK)}" {corps} stroke="{col}" stroke-width="{ep / s:.2f}" stroke-linejoin="miter"/>')
        out.append(f'<polygon points="{pts(CORE)}" {corps} stroke="{col}" stroke-width="{ep / s:.2f}" stroke-linejoin="miter"/>')
        # la jonction tête/cou ne doit pas être tracée : on la recouvre
        out.append(f'<polygon points="{pts(CORE)}" {corps}/>')
        out.append(f'<polygon points="{pts(NECK)}" {corps}/>')
    else:
        out.append(f'<polygon points="{pts(NECK)}" {corps}/>')
        out.append(f'<polygon points="{pts(CORE)}" {corps}/>')
    out.append(f'<polygon points="{pts(EYE)}" {oeil}/>')
    out.append(f'<polygon points="{pts(BROW)}" {oeil}/>')
    out.append("</g>")
    return "\n".join(out)


def svg(defs, body, titre):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<title>{titre}</title>
<defs>{defs}</defs>
{body}
</svg>
'''


def grain(op=0.06):
    """Léger grain de texture (évite l'aspect « aplat numérique » à l'impression)."""
    d = ('<filter id="grain" x="0" y="0" width="100%" height="100%">'
         '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/>'
         '<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter>')
    return d, f'<rect width="{W}" height="{H}" filter="url(#grain)" opacity="{op}"/>'


FONDS = {}


def fond(nom, titre):
    def deco(f):
        FONDS[nom] = (titre, f)
        return f
    return deco


@fond("1-panthere-fantome", "Panthère fantôme")
def _():
    gd, gb = grain()
    defs = f'''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{ARDOISE}"/><stop offset="1" stop-color="{NOIR}"/></linearGradient>
<linearGradient id="pf" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#3A3A42"/><stop offset="1" stop-color="{CARBONE}"/></linearGradient>
<radialGradient id="sol" cx="0.5" cy="1.05" r="0.6"><stop offset="0" stop-color="{JAUNE}" stop-opacity=".22"/>
  <stop offset="1" stop-color="{JAUNE}" stop-opacity="0"/></radialGradient>{gd}'''
    body = (f'<rect width="{W}" height="{H}" fill="url(#bg)"/>'
            + panthere(corps='fill="url(#pf)"', oeil=f'fill="{JAUNE}"')
            + f'<rect width="{W}" height="{H}" fill="url(#sol)"/>' + gb)
    return defs, body


@fond("2-panthere-detouree", "Panthère détourée jaune")
def _():
    gd, gb = grain()
    defs = f'''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{CARBONE}"/><stop offset="1" stop-color="{NOIR}"/></linearGradient>{gd}'''
    body = (f'<rect width="{W}" height="{H}" fill="url(#bg)"/>'
            + panthere(corps=f'fill="{NOIR}"', oeil=f'fill="{JAUNE}"', contour=(JAUNE, 9))
            + gb)
    return defs, body


@fond("3-jaune-panthere-noire", "Jaune, panthère noire XXL")
def _():
    gd, gb = grain(0.05)
    defs = f'''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{JAUNE}"/><stop offset="1" stop-color="#E9D800"/></linearGradient>{gd}'''
    body = (f'<rect width="{W}" height="{H}" fill="url(#bg)"/>'
            + panthere(corps=f'fill="{NOIR}"', oeil=f'fill="{JAUNE}"', contour=(NOIR, 1))
            + gb)
    return defs, body


@fond("4-projecteur", "Projecteur")
def _():
    gd, gb = grain()
    defs = f'''<radialGradient id="spot" cx="0.5" cy="0.3" r="0.75">
  <stop offset="0" stop-color="{JAUNE}"/><stop offset=".35" stop-color="#8A8300"/>
  <stop offset=".75" stop-color="{CARBONE}"/><stop offset="1" stop-color="{NOIR}"/></radialGradient>{gd}'''
    body = (f'<rect width="{W}" height="{H}" fill="url(#spot)"/>'
            + panthere(corps=f'fill="{NOIR}" fill-opacity=".28"', oeil=f'fill="{NOIR}" fill-opacity=".5"')
            + gb)
    return defs, body


@fond("5-griffes", "Griffes")
def _():
    gd, gb = grain()
    defs = f'''<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="{ARDOISE}"/><stop offset="1" stop-color="{NOIR}"/></linearGradient>{gd}'''
    # trois griffures effilées aux deux bouts, légèrement courbes, en haut à droite (hors visage)
    g = []
    for i in range(3):
        o = i * 70
        x0, y0, x1, y1 = 40 + o, 90 + o * .3, 330 + o, 700 + o * .3  # haut gauche, zone libre
        mx, my = (x0 + x1) / 2 + 40, (y0 + y1) / 2 - 30
        e = 26 - i * 4
        g.append(f'<path d="M{x0:.0f},{y0:.0f} Q{mx + e:.0f},{my - e * .6:.0f} {x1:.0f},{y1:.0f} '
                 f'Q{mx - e:.0f},{my + e * .6:.0f} {x0:.0f},{y0:.0f} Z" fill="{JAUNE}" opacity="{1 - i * .12:.2f}"/>')
    body = (f'<rect width="{W}" height="{H}" fill="url(#bg)"/>'
            + panthere(corps=f'fill="#26262C"', oeil=f'fill="#3A3A42"') + "".join(g) + gb)
    return defs, body


@fond("6-vitesse", "Traînées vitesse")
def _():
    gd, gb = grain()
    import random
    rnd = random.Random(4)
    lines = []
    for _ in range(140):
        y = rnd.uniform(0, H); x = rnd.uniform(-200, W); ln = rnd.uniform(60, 420); h = rnd.choice([3, 4, 6, 8])
        jaune = rnd.random() < 0.18
        col, op = (JAUNE, rnd.uniform(.5, .95)) if jaune else ("#9A9AA3", rnd.uniform(.08, .35))
        lines.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{ln:.0f}" height="{h}" rx="{h / 2}" fill="{col}" opacity="{op:.2f}"/>')
    defs = f'''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{CARBONE}"/><stop offset="1" stop-color="{NOIR}"/></linearGradient>
<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".5" stop-color="#fff" stop-opacity=".25"/>
  <stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>
<mask id="m"><rect width="{W}" height="{H}" fill="url(#fade)"/></mask>{gd}'''
    body = (f'<rect width="{W}" height="{H}" fill="url(#bg)"/>'
            f'<g mask="url(#m)">{"".join(lines)}</g>' + gb)
    return defs, body


@fond("7-ecusson-halo", "Halo écusson")
def _():
    gd, gb = grain()
    defs = f'''<radialGradient id="bg" cx="0.5" cy="0.32" r="0.8">
  <stop offset="0" stop-color="#2A2A30"/><stop offset="1" stop-color="{NOIR}"/></radialGradient>{gd}'''
    cx, cy, r = 500, 420, 330  # anneau du logo, centré sur la tête du joueur
    body = (f'<rect width="{W}" height="{H}" fill="url(#bg)"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{JAUNE}" stroke-width="46"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r - 38}" fill="none" stroke="{NOIR}" stroke-width="10"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r + 36}" fill="none" stroke="{JAUNE}" stroke-width="4" opacity=".5"/>'
            + panthere(corps=f'fill="#ffffff" fill-opacity=".05"', oeil=f'fill="{JAUNE}" fill-opacity=".8"')
            + gb)
    return defs, body


@fond("8-diagonale", "Diagonale noir et jaune")
def _():
    gd, gb = grain()
    defs = f'''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{CARBONE}"/><stop offset="1" stop-color="{NOIR}"/></linearGradient>
<clipPath id="bas"><polygon points="0,{H} 0,860 {W},520 {W},{H}"/></clipPath>{gd}'''
    body = (f'<rect width="{W}" height="{H}" fill="url(#bg)"/>'
            f'<polygon points="0,{H} 0,860 {W},520 {W},{H}" fill="{JAUNE}"/>'
            f'<polygon points="0,820 {W},480 {W},500 0,840" fill="{JAUNE}" opacity=".6"/>'
            f'<g clip-path="url(#bas)">'
            + panthere(corps=f'fill="{NOIR}" fill-opacity=".12"', oeil='fill="none"') + '</g>'
            + panthere(corps='fill="#ffffff" fill-opacity=".05"', oeil=f'fill="{JAUNE}"')
            + gb)
    return defs, body


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "fonds")
    out.mkdir(parents=True, exist_ok=True)
    for nom, (titre, f) in FONDS.items():
        d, b = f()
        (out / f"{nom}.svg").write_text(svg(d, b, titre), encoding="utf-8")
        print(nom)
