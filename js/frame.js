// Calcul du cadrage. Fonctions pures, testées sous Node.
//
// Un « repère » décrit le joueur en pixels de l'image source :
//   { eyeY, shoulderY, centerX }  (hauteur des yeux, ligne des épaules, axe du cou)
// Un « cadre » est le rectangle de l'image source qui deviendra la vignette :
//   { x, y, w, h }

/** Proportions de la vignette buste : identiques pour tous les joueurs. */
export const BUST = {
  eyeAt: 0.28,         // les yeux à 28 % de la hauteur, depuis le haut
  eyeToShoulder: 0.28, // distance yeux → épaules (articulations MediaPipe) = 28 % de la hauteur
  headMargin: 0.035,  // marge minimale au-dessus des cheveux
};

/**
 * Repère depuis les points MediaPipe Pose (coordonnées normalisées 0..1).
 * Indices : 2/5 yeux, 0 nez, 11/12 épaules. Renvoie null si les points sont peu fiables.
 */
export function landmarksToAnchor(lm, imgW, imgH, minVisibility = 0.5) {
  if (!lm || lm.length < 13) return null;
  const pick = i => lm[i] && (lm[i].visibility ?? 1) >= minVisibility ? lm[i] : null;
  const eL = pick(2), eR = pick(5), nose = pick(0), sL = pick(11), sR = pick(12);
  if (!sL || !sR || (!eL && !eR && !nose)) return null;
  const eyes = [eL, eR].filter(Boolean);
  const eyeY = eyes.length ? avg(eyes.map(p => p.y)) : nose.y - 0.02;
  const shoulderY = (sL.y + sR.y) / 2;
  const shoulderX = (sL.x + sR.x) / 2;
  const headX = eyes.length === 2 ? (eL.x + eR.x) / 2 : (nose ? nose.x : shoulderX);
  if (shoulderY <= eyeY) return null; // tête en bas, pose aberrante
  return {
    eyeY: eyeY * imgH,
    shoulderY: shoulderY * imgH,
    centerX: (0.5 * headX + 0.5 * shoulderX) * imgW,
    shoulderWidth: Math.abs(sL.x - sR.x) * imgW,
  };
}

/**
 * Repère de secours depuis le masque (w*h, valeurs 0..1) quand aucune pose n'est détectée :
 * haut du crâne, cou (ligne la plus étroite sous la tête), épaules (largeur > 2× le cou).
 */
export function maskToAnchor(mask, w, h) {
  const left = new Int32Array(h).fill(-1), right = new Int32Array(h).fill(-1);
  let top = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) if (mask[row + x] > 0.5) { if (left[y] < 0) left[y] = x; right[y] = x; }
    if (left[y] >= 0) { if (top < 0) top = y; bottom = y; }
  }
  if (top < 0) return null;
  const width = y => (left[y] < 0 ? 0 : right[y] - left[y] + 1);
  const H = bottom - top + 1;
  // La tête occupe environ 1/8 d'un corps entier : on cherche le cou entre 6 % et 30 % de la hauteur.
  let neckY = -1, neckW = Infinity, headW = 0;
  for (let y = top + Math.round(H * 0.03); y < top + Math.round(H * 0.1); y++) headW = Math.max(headW, width(y));
  for (let y = top + Math.round(H * 0.06); y < top + Math.round(H * 0.3) && y < h; y++) {
    const wd = width(y); if (wd > 0 && wd < neckW) { neckW = wd; neckY = y; }
  }
  if (neckY < 0) return null;
  let shoulderY = -1;
  for (let y = neckY; y < Math.min(h, top + Math.round(H * 0.45)); y++) if (width(y) > 2.2 * neckW) { shoulderY = y; break; }
  if (shoulderY < 0) shoulderY = neckY + (neckY - top) * 0.5;
  const eyeY = top + (neckY - top) * 0.45;
  const centerX = (left[neckY] + right[neckY]) / 2;
  return { eyeY, shoulderY, centerX, shoulderWidth: Math.max(headW * 2.5, neckW * 3), headTop: top };
}

/** Haut du crâne (première ligne opaque) dans une bande verticale autour de l'axe du joueur. */
export function headTopNear(mask, w, h, cx, halfWidth) {
  const x0 = Math.max(0, Math.floor(cx - halfWidth)), x1 = Math.min(w - 1, Math.ceil(cx + halfWidth));
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = x0; x <= x1; x++) if (mask[row + x] > 0.5) return y;
  }
  return -1;
}

/**
 * Cadre buste dans l'image source pour un format de sortie (aspect = largeur/hauteur).
 * `zoom` > 1 resserre le cadre ; `headTop` (optionnel) garantit que les cheveux ne sont pas coupés.
 */
export function bustFrame(anchor, aspect, { zoom = 1, headTop = null } = {}) {
  const d = Math.max(1, anchor.shoulderY - anchor.eyeY);
  const h = d / BUST.eyeToShoulder / zoom;
  const w = h * aspect;
  let y = anchor.eyeY - BUST.eyeAt * h;
  if (headTop != null && headTop < y + BUST.headMargin * h) y = headTop - BUST.headMargin * h;
  return { x: anchor.centerX - w / 2, y, w, h };
}

/** Cadre « corps entier » : la boîte englobante du sujet, posée en bas ou centrée. */
export function fullFrame(bbox, aspect, { fill = 0.9, place = 'bottom', imgH = Infinity } = {}) {
  const bw = bbox.x1 - bbox.x0, bh = bbox.y1 - bbox.y0;
  let h = Math.max(bh / fill, bw / fill / aspect);
  const w = h * aspect;
  const x = (bbox.x0 + bbox.x1) / 2 - w / 2;
  let y;
  const cutBottom = bbox.y1 >= imgH - 2;
  if (place === 'bottom') y = cutBottom ? bbox.y1 - h : bbox.y1 - h + (h - bh) / 3;
  else y = (bbox.y0 + bbox.y1) / 2 - h / 2;
  return { x, y, w, h };
}

/** Applique les retouches manuelles d'une photo : zoom autour du centre, décalages en % du cadre. */
export function adjustFrame(f, { zoom = 1, dx = 0, dy = 0 } = {}) {
  const w = f.w / zoom, h = f.h / zoom;
  return { x: f.x + (f.w - w) / 2 - dx * w, y: f.y + (f.h - h) / 2 - dy * h, w, h };
}

/**
 * Garde le cadre à l'intérieur de la zone détourée, sinon le sujet s'arrêterait sur un bord
 * net au milieu de la vignette. Un côté de la zone qui touche le bord de l'image source ne
 * contraint rien (au-delà, il n'y a de toute façon rien à montrer). Si le cadre est plus
 * grand que la zone, il est réduit (zoom) en gardant son centre et ses proportions.
 */
export function clampToRegion(f, r, imgW, imgH) {
  const minX = r.x > 0 ? r.x : -Infinity, maxX = r.x + r.w < imgW ? r.x + r.w : Infinity;
  const minY = r.y > 0 ? r.y : -Infinity, maxY = r.y + r.h < imgH ? r.y + r.h : Infinity;
  let { x, y, w, h } = f;
  const k = Math.min(1, (maxX - minX) / w, (maxY - minY) / h);
  if (k < 1) { const cx = x + w / 2, cy = y + h / 2; w *= k; h *= k; x = cx - w / 2; y = cy - h / 2; }
  if (x < minX) x = minX; if (x + w > maxX) x = maxX - w;
  if (y < minY) y = minY; if (y + h > maxY) y = maxY - h;
  return { x, y, w, h };
}

/** Agrandit un rectangle d'une marge relative, puis le borne à l'image. Coordonnées entières. */
export function padAndClip(f, pad, imgW, imgH) {
  const x0 = Math.max(0, Math.floor(f.x - f.w * pad)), y0 = Math.max(0, Math.floor(f.y - f.h * pad));
  const x1 = Math.min(imgW, Math.ceil(f.x + f.w * (1 + pad))), y1 = Math.min(imgH, Math.ceil(f.y + f.h * (1 + pad)));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** Boîte englobante (pixels) des valeurs > seuil d'un masque. */
export function maskBBox(mask, w, h, thr = 0.5) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x] > thr) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

function avg(a) { return a.reduce((s, v) => s + v, 0) / a.length; }
