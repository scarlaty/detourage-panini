"""Construit les catalogues de fonds utilisés par l'appli.

- fonds/catalogue.json : fonds graphiques (fonds/pro/*.svg, vignettes fonds/pro/vignettes/*.webp)
- fonds/salle/catalogue.json : fonds tirés des photos de la salle (copiés depuis un dossier local,
  exclus de Git : photos d'un lieu avec des personnes)

Usage : python tools/catalogue.py [<dossier_fonds_salle>]
Les vignettes des fonds graphiques sont produites par le navigateur (rendu SVG identique à l'appli),
voir README, section « Fonds ».
"""
import json, shutil, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FONDS = ROOT / "fonds"
TW, TH = 200, 280


def pro():
    idx = json.loads((FONDS / "pro" / "index.json").read_text(encoding="utf-8"))
    out = [{"id": f'{x["n"]:03d}', "groupe": "Graphiques", "famille": x["famille"], "titre": x["titre"],
            "src": f'fonds/pro/{x["fichier"]}', "thumb": f'fonds/pro/vignettes/{x["n"]:03d}.webp'} for x in idx]
    manquantes = [o["thumb"] for o in out if not (ROOT / o["thumb"]).exists()]
    if manquantes: print(f"attention : {len(manquantes)} vignettes graphiques manquantes")
    (FONDS / "catalogue.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(out), "fonds graphiques")


def salle(src):
    src = Path(src); dst = FONDS / "salle"; vg = dst / "vignettes"
    vg.mkdir(parents=True, exist_ok=True)
    idx = json.loads((src / "index.json").read_text(encoding="utf-8"))
    out = []
    for x in idx:
        shutil.copy2(src / x["fichier"], dst / x["fichier"])
        im = Image.open(src / x["fichier"]).convert("RGB"); im.thumbnail((TW, TH), Image.LANCZOS)
        th = vg / (Path(x["fichier"]).stem + ".webp"); im.save(th, "WEBP", quality=72)
        out.append({"id": x["label"], "groupe": "Salle", "famille": x["famille"], "titre": x["titre"],
                    "src": f'fonds/salle/{x["fichier"]}', "thumb": f'fonds/salle/vignettes/{th.name}'})
    (dst / "catalogue.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(out), "fonds salle")


if __name__ == "__main__":
    pro()
    if len(sys.argv) > 1: salle(sys.argv[1])
