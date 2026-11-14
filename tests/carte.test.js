import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARTE_DEFAUT, SPEC, normaliser, champsPhoto, dependDeLaPhoto, modeles, surprise } from '../js/carte.js';

test('le modèle par défaut est le 108 et respecte le schéma', () => {
  assert.deepEqual(normaliser(CARTE_DEFAUT), CARTE_DEFAUT);
  assert.equal(CARTE_DEFAUT.filigrane.taille, 0.9);
  assert.equal(CARTE_DEFAUT.cadre.epaisseur, 0.022);
  for (const sec of Object.keys(SPEC)) for (const k of Object.keys(SPEC[sec].champs)) assert.ok(k in CARTE_DEFAUT[sec], `${sec}.${k} sans valeur par défaut`);
});

test('normaliser : valeurs absentes, invalides ou hors plage → valeur du 108 ou bornée', () => {
  const c = normaliser({ fond: { c1: 'rouge', type: 'inconnu', angle: 999 }, cadre: { epaisseur: -3, double: 'oui' }, texte: { contenu: 'x'.repeat(200) }, intrus: { a: 1 } });
  assert.equal(c.fond.c1, CARTE_DEFAUT.fond.c1);
  assert.equal(c.fond.type, CARTE_DEFAUT.fond.type);
  assert.equal(c.fond.angle, 360);
  assert.equal(c.cadre.epaisseur, 0);
  assert.equal(c.cadre.double, CARTE_DEFAUT.cadre.double);
  assert.equal(c.texte.contenu.length, 80);
  assert.ok(!('intrus' in c));
  assert.deepEqual(normaliser(null), CARTE_DEFAUT);
  assert.equal(normaliser({ panthere: { contour: '' } }).panthere.contour, '');   // couleur facultative vidée
});

test('champs tirés du nom de la photo', () => {
  assert.deepEqual(champsPhoto('10 - Léa Martin (Gardienne)'), { numero: '10', nom: 'Léa Martin', poste: 'Gardienne' });
  assert.deepEqual(champsPhoto('7_Lou_Exemple'), { numero: '7', nom: 'Lou Exemple', poste: '' });
  assert.deepEqual(champsPhoto('IMG_6232'), { numero: '', nom: 'IMG 6232', poste: '' });
  assert.deepEqual(champsPhoto('Jean Exemple [Pivot]'), { numero: '', nom: 'Jean Exemple', poste: 'Pivot' });
});

test('dépendance au nom de la photo', () => {
  assert.equal(dependDeLaPhoto(CARTE_DEFAUT), false);
  const c = normaliser(CARTE_DEFAUT); c.plaque.actif = true;
  assert.equal(dependDeLaPhoto(c), true);
  c.plaque.ligne1 = 'MSH'; c.plaque.ligne2 = 'Saison 2026';
  assert.equal(dependDeLaPhoto(c), false);
});

test('plus de 700 modèles distincts, valides et identiques à chaque génération', () => {
  const l = modeles();
  assert.ok(l.length >= 700, `${l.length} modèles`);
  assert.equal(new Set(l.map(x => x.id)).size, l.length);
  assert.equal(new Set(l.map(x => JSON.stringify(x.cfg))).size, l.length);
  for (const m of l) assert.deepEqual(normaliser(m.cfg), m.cfg, m.id);
  assert.deepEqual(modeles()[123], l[123]);
  assert.deepEqual(l[0].cfg, CARTE_DEFAUT);
  // chaque élément créatif apparaît dans au moins un modèle
  for (const sec of ['halo', 'grandTexte', 'panthere', 'bandeau', 'plaque', 'badge', 'contourJoueur', 'holo']) assert.ok(l.some(m => m.cfg[sec].actif), sec);
  for (const t of SPEC.motif.champs.type.options.map(([v]) => v)) assert.ok(l.some(m => m.cfg.motif.type === t), `motif ${t}`);
});

// Contexte 2D factice : enregistre les appels (pas de canvas dans Node)
function faux() {
  const appels = [];
  const ctx = new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'appels') return appels;
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return s => ({ width: String(s).length * 10 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (k === 'createPattern') return () => ({});
      return (...a) => { appels.push([k, ...a]); };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  return ctx;
}
function avecDocument(fn) {
  const avant = globalThis.document;
  globalThis.document = { createElement: () => { const c = { width: 1, height: 1 }; const x = faux(); c.getContext = () => x; return c; } };
  try { return fn(); } finally { globalThis.document = avant; }
}

test('cadre « plein » : bordure seule (le rectangle extérieur reste dans le chemin)', async () => {
  const { dessinerCarte } = await import('../js/carte.js');
  const c = normaliser(CARTE_DEFAUT); c.cadre.style = 'plein';
  const ctx = faux();
  avecDocument(() => dessinerCarte(ctx, 1000, 1400, c, {}, 'arriere', null));
  const a = ctx.appels, i = a.findIndex(x => x[0] === 'fill' && x[1] === 'evenodd');
  assert.ok(i > 0, 'fill evenodd absent');
  const debut = a.slice(0, i).map(x => x[0]).lastIndexOf('beginPath');
  assert.deepEqual(a[debut + 1], ['rect', 0, 0, 1000, 1400]);
  assert.ok(a.slice(debut + 2, i).every(x => x[0] !== 'beginPath'));
});

test('cadre « plein » d\'épaisseur nulle : rien n\'est dessiné', async () => {
  const { dessinerCarte } = await import('../js/carte.js');
  const c = normaliser(CARTE_DEFAUT); c.cadre.style = 'plein'; c.cadre.epaisseur = 0;
  const ctx = faux();
  avecDocument(() => dessinerCarte(ctx, 1000, 1400, c, {}, 'arriere', null));
  assert.ok(!ctx.appels.some(x => x[0] === 'fill' && x[1] === 'evenodd'));
});

test('motifs à la taille minimale : nombre d\'appels de dessin borné', async () => {
  const { dessinerCarte } = await import('../js/carte.js');
  const logo = { naturalWidth: 100, naturalHeight: 100, width: 100, height: 100 };
  for (const type of SPEC.motif.champs.type.options.map(([v]) => v)) {
    const c = normaliser(CARTE_DEFAUT); c.motif.type = type; c.motif.taille = SPEC.motif.champs.taille.min; c.motif.opacite = 1;
    // le motif est dessiné sur un calque : compter sur tous les contextes créés
    const avant = globalThis.document, ctxs = [];
    globalThis.document = { createElement: () => { const k = { width: 1, height: 1 }; const x = faux(); ctxs.push(x); k.getContext = () => x; return k; } };
    try { dessinerCarte(faux(), 1000, 1400, c, { logo }, 'arriere', null); } finally { globalThis.document = avant; }
    const n = ctxs.reduce((s, x) => s + x.appels.filter(y => ['arc', 'lineTo', 'fill', 'stroke', 'drawImage', 'fillRect'].includes(y[0])).length, 0);
    assert.ok(n < 150000, `${type} : ${n} appels de dessin`);
  }
});

test('« Surprends-moi » : cartes valides et variées', () => {
  const a = surprise(1), b = surprise(2);
  assert.deepEqual(normaliser(a), a);
  assert.notDeepEqual(a, b);
  assert.deepEqual(surprise(1), a);
});
