import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUST, landmarksToAnchor, maskToAnchor, headTopNear, bustFrame, subjectLimits, fullFrame, adjustFrame, clampToRegion, padAndClip, maskBBox } from '../js/frame.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

function lms(over = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
  Object.assign(lm[0], { x: 0.5, y: 0.27 });
  Object.assign(lm[2], { x: 0.47, y: 0.25 }); Object.assign(lm[5], { x: 0.53, y: 0.25 });
  Object.assign(lm[11], { x: 0.62, y: 0.40 }); Object.assign(lm[12], { x: 0.38, y: 0.40 });
  for (const [k, v] of Object.entries(over)) Object.assign(lm[k], v);
  return lm;
}

test('landmarksToAnchor : yeux, épaules, axe', () => {
  const a = landmarksToAnchor(lms(), 1000, 2000);
  close(a.eyeY, 500); close(a.shoulderY, 800); close(a.centerX, 500); close(a.shoulderWidth, 240);
});

test('landmarksToAnchor : refuse épaules invisibles ou au-dessus des yeux', () => {
  assert.equal(landmarksToAnchor(lms({ 11: { visibility: 0.1 } }), 100, 100), null);
  assert.equal(landmarksToAnchor(lms({ 11: { y: 0.1 }, 12: { y: 0.1 } }), 100, 100), null);
  assert.equal(landmarksToAnchor(null, 100, 100), null);
});

test('bustFrame : les yeux tombent à la même hauteur relative quelle que soit la distance', () => {
  for (const scale of [0.5, 1, 3]) {
    const a = { eyeY: 400 * scale, shoulderY: 600 * scale, centerX: 300 * scale };
    const f = bustFrame(a, 5 / 7);
    close((a.eyeY - f.y) / f.h, BUST.eyeAt);
    close((a.shoulderY - a.eyeY) / f.h, BUST.eyeToShoulder);
    close(f.w / f.h, 5 / 7);
    close(f.x + f.w / 2, a.centerX);
  }
});

test('bustFrame : adulte courant inchangé (yeux à 28 %, yeux → épaules 28 %)', () => {
  const a = { eyeY: 400, shoulderY: 600, centerX: 300, shoulderWidth: 1.9 * 200 };
  const f0 = bustFrame({ eyeY: 400, shoulderY: 600, centerX: 300 }, 5 / 7);
  const f = bustFrame(a, 5 / 7, { headTop: 400 - 0.18 * f0.h, limits: { bottom: 2000, left: -Infinity, right: Infinity } });
  assert.deepEqual(f, f0);
  close(bustFrame(a, 5 / 7, { zoom: 2 }).h, f0.h / 2);
});

test('bustFrame : grosse tête (enfant) → dézoome pour garder la tête entière, yeux toujours à 28 %', () => {
  const a = { eyeY: 400, shoulderY: 520, centerX: 300 };          // cou court
  const headTop = 260;                                              // cheveux hauts
  const f = bustFrame(a, 5 / 7, { headTop });
  close((a.eyeY - headTop) / f.h, BUST.maxHeadAbove);
  close((a.eyeY - f.y) / f.h, BUST.eyeAt);
  assert.ok(headTop - f.y >= BUST.headMargin * f.h - 1e-9);
});

test('bustFrame : épaules larges → cadre assez large', () => {
  const a = { eyeY: 400, shoulderY: 600, centerX: 300, shoulderWidth: 700 };
  const f = bustFrame(a, 5 / 7);
  close(f.w, 700 * BUST.shoulderSpan);
});

test('bustFrame : jamais de vide sous le buste ni sur un côté coupé, tête gardée', () => {
  const a = { eyeY: 400, shoulderY: 520, centerX: 300, shoulderWidth: 400 };
  const headTop = 260, limits = { bottom: 900, left: 0, right: 640 };   // photo serrée : sujet coupé en bas et des deux côtés
  const f = bustFrame(a, 5 / 7, { headTop, limits });
  assert.ok(f.y + f.h <= 900 + 1e-9, 'bas');
  assert.ok(f.x >= -1e-9 && f.x + f.w <= 640 + 1e-9, 'côtés');
  assert.ok(headTop - f.y >= BUST.headMargin * f.h - 1e-9, 'cheveux');
  // très serrée en bas : le cadre remonte puis rétrécit, sans couper la tête
  const g = bustFrame(a, 5 / 7, { headTop, limits: { bottom: 700, left: -Infinity, right: Infinity } });
  close(g.y + g.h, 700);
  assert.ok(headTop - g.y >= BUST.headMargin * g.h - 1e-9);
});

test('subjectLimits : bas toujours, côtés seulement si le sujet touche le bord', () => {
  assert.deepEqual(subjectLimits({ x0: 100, y0: 50, x1: 500, y1: 800 }, 1000), { bottom: 800, left: -Infinity, right: Infinity });
  assert.deepEqual(subjectLimits({ x0: 0, y0: 50, x1: 1000, y1: 800 }, 1000), { bottom: 800, left: 0, right: 1000 });
  assert.equal(subjectLimits(null, 1000), null);
});

test('adjustFrame : neutre par défaut, zoom centré, décalages', () => {
  const f = { x: 10, y: 20, w: 100, h: 200 };
  assert.deepEqual(adjustFrame(f), f);
  const z = adjustFrame(f, { zoom: 2 });
  close(z.w, 50); close(z.x + z.w / 2, 60); close(z.y + z.h / 2, 120);
  const d = adjustFrame(f, { dx: 0.1, dy: -0.1 });
  close(d.x, 0); close(d.y, 40);
});

test('clampToRegion : décale puis réduit le cadre pour rester dans la zone détourée', () => {
  const r = { x: 100, y: 100, w: 400, h: 500 };
  // dans la zone : inchangé
  assert.deepEqual(clampToRegion({ x: 150, y: 150, w: 200, h: 250 }, r, 1000, 1000), { x: 150, y: 150, w: 200, h: 250 });
  // dépasse en bas : remonté
  const b = clampToRegion({ x: 150, y: 450, w: 200, h: 250 }, r, 1000, 1000);
  close(b.y + b.h, 600); close(b.h, 250);
  // plus grand que la zone : réduit, proportions gardées
  const big = clampToRegion({ x: 0, y: 0, w: 800, h: 1000 }, r, 1000, 1000);
  close(big.w / big.h, 0.8); assert.ok(big.h <= 500 + 1e-9 && big.w <= 400 + 1e-9);
  assert.ok(big.x >= 100 && big.x + big.w <= 500 + 1e-9);
  // zone collée au bas de l'image : le bas ne contraint plus
  const edge = { x: 100, y: 100, w: 400, h: 900 };
  const e = clampToRegion({ x: 150, y: 700, w: 200, h: 400 }, edge, 1000, 1000);
  close(e.y, 700);
});

test('padAndClip borne à l’image et produit des entiers', () => {
  const r = padAndClip({ x: -10.5, y: 5.2, w: 50, h: 60 }, 0.1, 100, 50);
  assert.deepEqual(r, { x: 0, y: 0, w: 45, h: 50 });
});

test('fullFrame : le sujet tient dans le cadre, posé en bas', () => {
  const bb = { x0: 100, y0: 50, x1: 300, y1: 850 };
  const f = fullFrame(bb, 4 / 5, { fill: 0.9, place: 'bottom', imgH: 1000 });
  assert.ok(f.y <= bb.y0 && f.y + f.h >= bb.y1 && f.x <= bb.x0 && f.x + f.w >= bb.x1);
  close(f.w / f.h, 4 / 5);
});

test('maskToAnchor : silhouette synthétique tête + cou + épaules', () => {
  const w = 200, h = 400, m = new Float32Array(w * h);
  const fill = (x0, x1, y0, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1; };
  fill(85, 115, 20, 60);   // tête
  fill(93, 107, 60, 75);   // cou
  fill(50, 150, 75, 400);  // torse
  const a = maskToAnchor(m, w, h);
  assert.ok(a, 'repère trouvé');
  assert.equal(a.headTop, 20);
  assert.ok(a.eyeY > 20 && a.eyeY < 60, `yeux dans la tête (${a.eyeY})`);
  assert.ok(a.shoulderY >= 74 && a.shoulderY <= 80, `épaules (${a.shoulderY})`);
  close(a.centerX, 99.5, 1);
  assert.equal(maskToAnchor(new Float32Array(w * h), w, h), null);
});

test('headTopNear et maskBBox', () => {
  const w = 10, h = 10, m = new Float32Array(w * h);
  m[3 * w + 8] = 1; m[6 * w + 5] = 1;
  assert.equal(headTopNear(m, w, h, 5, 1), 6);
  assert.equal(headTopNear(m, w, h, 8, 1), 3);
  assert.deepEqual(maskBBox(m, w, h), { x0: 5, y0: 3, x1: 9, y1: 7 });
});

test('clampToRegion : les limites du sujet s’appliquent après un dézoom manuel', () => {
  const r = { x: 0, y: 0, w: 1000, h: 1000 };   // zone = image entière : ne contraint rien
  const f = clampToRegion({ x: 100, y: 200, w: 500, h: 900 }, r, 1000, 1000, { bottom: 1000, left: -Infinity, right: Infinity });
  close(f.y + f.h, 1000); close(f.h, 900);
});

test('bustFrame : haut des cheveux introuvable ou sous les yeux → cadre sûr, sans vide en haut', () => {
  const a = { eyeY: 400, shoulderY: 600, centerX: 300 };
  const f = bustFrame(a, 5 / 7, { headTop: null, limits: { bottom: 700, left: -Infinity, right: Infinity } });
  close(f.y + f.h, 700); close((a.eyeY - f.y) / f.h, BUST.eyeAt);   // yeux à 28 %, bas sur le sujet
  assert.ok(f.y >= 0);
  assert.deepEqual(bustFrame(a, 5 / 7, { headTop: 450 }), bustFrame(a, 5 / 7));
});

test('bustFrame : épaules d’adultes réels (écart / yeux→épaules 1,3 à 1,5) → règle des épaules inactive', () => {
  const base = bustFrame({ eyeY: 400, shoulderY: 600, centerX: 300 }, 5 / 7);
  for (const k of [1.32, 1.49]) assert.deepEqual(bustFrame({ eyeY: 400, shoulderY: 600, centerX: 300, shoulderWidth: k * 200 }, 5 / 7), base);
});

test('bustFrame : source coupée au buste → cadre le plus grand possible sans vide, bas du sujet aberrant ignoré', () => {
  const a = { eyeY: 300, shoulderY: 480, centerX: 400 };
  // bas du sujet à 700 : yeux à 28 % et bas sur 700 (h = 400 / 0,72), cheveux gardés
  const f = bustFrame(a, 5 / 7, { headTop: 180, limits: { bottom: 700, left: -Infinity, right: Infinity } });
  close(f.h, 400 / (1 - BUST.eyeAt)); close(f.y + f.h, 700); close((a.eyeY - f.y) / f.h, BUST.eyeAt);
  assert.ok(180 - f.y >= BUST.headMargin * f.h - 1e-9);
  assert.deepEqual(bustFrame(a, 5 / 7, { headTop: 180, limits: { bottom: 310, left: -Infinity, right: Infinity } }), bustFrame(a, 5 / 7, { headTop: 180 }));
});

test('bustFrame : épaules estimées depuis le masque (sans pose) → pas de règle des épaules', () => {
  const a = { eyeY: 400, shoulderY: 600, centerX: 300, shoulderWidth: 900, shoulderEstimated: true };
  assert.deepEqual(bustFrame(a, 5 / 7), bustFrame({ eyeY: 400, shoulderY: 600, centerX: 300 }, 5 / 7));
});
