"""Galerie locale de choix des fonds.
Usage : python tools/galerie.py <joueur.png> <sortie.html> <dossier_fonds> [<dossier_fonds> ...]
Chaque dossier contient un index.json (champs n, fichier, famille, titre, et optionnels label, groupe)."""
import json, os, sys
from pathlib import Path

joueur, out = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
rel = lambda p: Path(os.path.relpath(p, out.resolve().parent)).as_posix()  # relatif : marche en file:// et en http
index = []
for d in map(Path, sys.argv[3:]):
    for x in json.loads((d / "index.json").read_text(encoding="utf-8")):
        x["src"] = rel(d.resolve() / x["fichier"])
        x.setdefault("label", f'{x["n"]:03d}')
        x.setdefault("groupe", "Graphiques")
        index.append(x)

html = """<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Choix des fonds</title>
<style>
:root{--bg:#0a0a0b;--card:#141417;--ink:#f5f5f4;--muted:#a1a1aa;--line:#2e2e35;--acc:#fdf103}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,"Segoe UI",sans-serif}
header{position:sticky;top:0;z-index:5;background:rgba(10,10,11,.94);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:12px 16px}
h1{margin:0 0 8px;font-size:20px}h1 b{color:var(--acc)}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.chip{border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.chip.grp{font-weight:700}.chip.on{background:var(--acc);color:#0a0a0b;border-color:var(--acc);font-weight:600}
.sp{flex:1}label{font-size:13px;color:var(--muted);display:flex;gap:6px;align-items:center}
.btn{background:var(--acc);color:#0a0a0b;border:0;border-radius:10px;padding:9px 14px;font:inherit;font-weight:700;cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line);font-weight:500}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--w,220px),1fr));gap:14px;padding:16px}
.c{position:relative;border-radius:12px;overflow:hidden;background:var(--card);border:2px solid transparent;cursor:pointer}
.c.sel{border-color:var(--acc);box-shadow:0 0 0 3px rgba(253,241,3,.25)}
.v{position:relative;aspect-ratio:5/7}.v img{position:absolute;inset:0;width:100%;height:100%;display:block}
body.nojoueur .j{display:none}
.m{display:flex;gap:8px;align-items:center;padding:7px 10px;font-size:12px}
.n{font-weight:800;color:var(--acc);font-variant-numeric:tabular-nums}.t{flex:1;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tick{width:22px;height:22px;border-radius:50%;border:2px solid var(--line);display:grid;place-items:center;font-size:13px;color:transparent}
.c.sel .tick{background:var(--acc);border-color:var(--acc);color:#0a0a0b}
.fam{grid-column:1/-1;margin:10px 0 -4px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
#toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--acc);color:#0a0a0b;padding:10px 16px;border-radius:10px;font-weight:600;opacity:0;transition:.2s}
#toast.show{opacity:1}
</style></head><body>
<header>
  <h1>Choix des fonds <b>MSH</b> — <span id="cnt">0</span> sélectionné(s) sur __N__</h1>
  <div class="bar" id="grps"></div>
  <div class="bar" id="fams" style="margin-top:6px"></div>
  <div class="bar" style="margin-top:8px">
    <label><input type="checkbox" id="pj" checked> Afficher le joueur</label>
    <label>Taille <input type="range" id="sz" min="150" max="420" value="220"></label>
    <label><input type="checkbox" id="only"> Seulement ma sélection</label>
    <span class="sp"></span>
    <button class="btn ghost" id="clr">Tout désélectionner</button>
    <button class="btn" id="cp">Copier ma sélection</button>
  </div>
</header>
<main id="g"></main>
<div id="toast"></div>
<script>
const D = __DATA__, J = __JOUEUR__;
const KEY = 'fonds-msh-selection-v2';
let sel = new Set(); try { sel = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch {}
let fam = 'Toutes', grp = 'Tous';
const grps = ['Tous', ...new Set(D.map(x => x.groupe))];
const famsOf = g => ['Toutes', ...new Set(D.filter(x => g === 'Tous' || x.groupe === g).map(x => x.famille))];
const $ = id => document.getElementById(id);
grps.forEach(g => { const b = document.createElement('button'); b.className = 'chip grp'; b.textContent = g; b.onclick = () => { grp = g; fam = 'Toutes'; chips(); render(); }; $('grps').appendChild(b); });
function chips() {
  [...$('grps').children].forEach(b => b.classList.toggle('on', b.textContent === grp));
  $('fams').innerHTML = '';
  famsOf(grp).forEach(f => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = f; b.onclick = () => { fam = f; render(); }; $('fams').appendChild(b); });
}
chips();
function save() { try { localStorage.setItem(KEY, JSON.stringify([...sel])); } catch {} $('cnt').textContent = sel.size; }
function render() {
  [...$('fams').children].forEach(b => b.classList.toggle('on', b.textContent === fam));
  window.scrollTo(0, 0);
  const g = $('g'); g.innerHTML = '';
  let last = null;
  for (const x of D) {
    if (grp !== 'Tous' && x.groupe !== grp) continue;
    if (fam !== 'Toutes' && x.famille !== fam) continue;
    if ($('only').checked && !sel.has(x.label)) continue;
    const sec = x.groupe + ' · ' + x.famille;
    if (sec !== last && fam === 'Toutes') { const h = document.createElement('div'); h.className = 'fam'; h.textContent = sec; g.appendChild(h); last = sec; }
    const c = document.createElement('div'); c.className = 'c' + (sel.has(x.label) ? ' sel' : '');
    c.innerHTML = `<div class="v"><img loading="lazy" src="${x.src}" alt=""><img class="j" loading="lazy" src="${J}" alt=""></div><div class="m"><span class="n">${x.label}</span><span class="t"></span><span class="tick">✓</span></div>`;
    c.querySelector('.t').textContent = x.titre; c.title = x.titre;
    c.onclick = () => { sel.has(x.label) ? sel.delete(x.label) : sel.add(x.label); c.classList.toggle('sel'); save(); };
    g.appendChild(c);
  }
  save();
}
$('pj').onchange = e => document.body.classList.toggle('nojoueur', !e.target.checked);
$('sz').oninput = e => document.documentElement.style.setProperty('--w', e.target.value + 'px');
$('only').onchange = render;
$('clr').onclick = () => { sel.clear(); render(); };
$('cp').onclick = async () => {
  const t = [...sel].map(String).sort().join(', ');
  try { await navigator.clipboard.writeText(t); toast('Copié : ' + (t || 'rien')); } catch { prompt('Ta sélection :', t); }
};
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2200); }
render();
</script></body></html>
"""
html = (html.replace("__DATA__", json.dumps(index, ensure_ascii=False))
        .replace("__JOUEUR__", json.dumps(rel(joueur)))
        .replace("__N__", str(len(index))))
out.write_text(html, encoding="utf-8")
print(out)
