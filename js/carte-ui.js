// Éditeur de carte : un panneau repliable par élément, construit à partir du schéma SPEC de
// carte.js. Les modèles générés utilisent exactement ces réglages : tout est recréable.

import { SPEC, CARTE_DEFAUT } from './carte.js';

/**
 * Construit l'éditeur dans `box`. `get()` renvoie la configuration courante (modifiée en place),
 * `change()` est appelé après chaque modification. Renvoie `sync()`, qui recopie la configuration
 * dans les champs (après le choix d'un modèle).
 */
export function construireEditeur(box, get, change) {
  const champs = [];
  box.replaceChildren();
  for (const [sec, { titre, champs: defs }] of Object.entries(SPEC)) {
    const det = document.createElement('details'); det.className = 'c-sec'; det.dataset.sec = sec;
    const sum = document.createElement('summary'); sum.textContent = titre; det.appendChild(sum);
    if (defs.actif) {
      const pastille = document.createElement('i'); pastille.className = 'c-on'; pastille.setAttribute('aria-hidden', 'true'); sum.prepend(pastille);
      const etat = document.createElement('span'); etat.className = 'sr-only'; sum.append(etat);   // « activé » lu par les lecteurs d'écran
    }
    for (const [k, f] of Object.entries(defs)) {
      const row = document.createElement('div'); row.className = 'row';
      const id = `c_${sec}_${k}`;
      const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = f.label;
      let el, out = null, coche = null;
      if (f.t === 'enum') { el = document.createElement('select'); for (const [v, t] of f.options) el.add(new Option(t, v)); }
      else if (f.t === 'bool') { el = document.createElement('input'); el.type = 'checkbox'; row.classList.add('row-check'); }
      else if (f.t === 'color') { el = document.createElement('input'); el.type = 'color'; }
      else if (f.t === 'colorOpt') {
        coche = document.createElement('input'); coche.type = 'checkbox'; coche.setAttribute('aria-label', `${f.label} : activer`);
        el = document.createElement('input'); el.type = 'color'; el.value = '#000000';
      } else if (f.t === 'text') { el = document.createElement('input'); el.type = 'text'; el.maxLength = 80; el.placeholder = CARTE_DEFAUT[sec][k] || '{nom}'; el.className = 'c-text'; }
      else { el = document.createElement('input'); el.type = 'range'; el.min = f.min; el.max = f.max; el.step = f.step; out = document.createElement('output'); out.id = id + '_v'; }
      el.id = id;
      if (out) el.setAttribute('aria-describedby', out.id);
      const appliquer = () => {
        const v = f.t === 'bool' ? el.checked : f.t === 'num' ? +el.value : f.t === 'colorOpt' ? (coche.checked ? el.value.toUpperCase() : '') : f.t === 'color' ? el.value.toUpperCase() : el.value;
        get()[sec][k] = v;
        if (out) out.textContent = f.fmt(v);
        if (k === 'actif') marquer(det, v);
        visibilite();
        change(sec, k);
      };
      el.addEventListener(f.t === 'num' || f.t === 'color' || f.t === 'text' ? 'input' : 'change', appliquer);
      if (coche) { coche.addEventListener('change', appliquer); el.addEventListener('input', () => { coche.checked = true; appliquer(); }); }
      row.append(lab); if (coche) row.append(coche); row.append(el); if (out) row.append(out);
      det.appendChild(row);
      champs.push({ sec, k, f, el, out, coche, det, row });
    }
    if (sec === 'texte' || sec === 'plaque' || sec === 'badge' || sec === 'grandTexte') {
      const p = document.createElement('p'); p.className = 'hint';
      p.textContent = '{nom}, {numero} et {poste} viennent du nom de chaque photo, ex. « 10 - Léa Martin (Gardienne).jpg ».';
      det.appendChild(p);
    }
    box.appendChild(det);
  }
  function marquer(det, on) { det.classList.toggle('on', on); const e = det.querySelector('summary .sr-only'); if (e) e.textContent = on ? ' (activé)' : ' (désactivé)'; }
  // champs conditionnels (ex. « Couleur 3 » seulement pour le dégradé 3 couleurs)
  const visibilite = () => { const cfg = get(); for (const c of champs) if (c.f.si) c.row.hidden = !c.f.si(cfg[c.sec]); };
  const sync = () => {
    const cfg = get();
    for (const c of champs) {
      const v = cfg[c.sec][c.k];
      if (c.f.t === 'bool') c.el.checked = !!v;
      else if (c.f.t === 'colorOpt') { c.coche.checked = !!v; if (v) c.el.value = v.toLowerCase(); }
      else if (c.f.t === 'color') c.el.value = v.toLowerCase();
      else if (String(c.el.value) !== String(v)) c.el.value = v;
      if (c.out) c.out.textContent = c.f.fmt(+v);
      if (c.k === 'actif') marquer(c.det, !!v);
    }
    visibilite();
  };
  sync();
  return sync;
}
