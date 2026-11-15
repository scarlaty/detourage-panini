import { MODELS, RES } from './models.js';
import { detectPose } from './pose.js';
import { resizeMask } from './matte.js';
import {
  landmarksToAnchor, maskToAnchor, headTopNear, bustFrame, subjectLimits, fullFrame, adjustFrame, clampToRegion, padAndClip, maskBBox,
} from './frame.js';
import { CARTE_DEFAUT, normaliser, dessinerCarte, contourJoueur, dependDeLaPhoto, modeles, surprise, fichePhoto, nomFichier } from './carte.js';
import { construireEditeur } from './carte-ui.js';

const $ = id => document.getElementById(id);
const MAX_SIDE = 3200;   // côté max de l'image source conservée pour le traitement
const MAX_REGION = 2200; // côté max de la zone détourée (le cadre buste en occupe ~60 %)
const REGION_ZOOM = 0.6; // zone détourée = cadre buste au zoom 0,6 : marge pour zoom et retouches
const THUMB = 520, VIEW = 1000;

/* ---------------- réglages ---------------- */
const DEFAULTS = {
  model: 'ben2', framing: 'bust', format: '1000x1400', zoom: 1, place: 'bottom', fill: 90,
  keyOn: true, keyColor: '#3862bc', keyTol: 40, sharp: 10,
  preset: '', bgMode: 'gradient', g1: '#111111', g2: '#f2c500', gtype: 'linear', color: '#f2c500', blur: 0,
  logoPos: 'br', logoSize: 16, out: 'jpg',
  carte: JSON.parse(JSON.stringify(CARTE_DEFAUT)), carteId: 'C000',
};
const STORE = 'detourage-panini:v1';
const S = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
  for (const k of Object.keys(DEFAULTS)) if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) S[k] = saved[k];
  if (!MODELS[S.model]) S.model = DEFAULTS.model;
  // Valeurs d'une ancienne version absentes des listes : retour au défaut.
  for (const id of ['format', 'gtype', 'logoPos']) if (![...document.getElementById(id).options].some(o => o.value === S[id])) S[id] = DEFAULTS[id];
  for (const [id, vals] of [['framing', ['bust', 'full', 'orig']], ['place', ['bottom', 'center']], ['bgMode', ['carte', 'preset', 'gradient', 'solid', 'image', 'none']], ['out', ['jpg', 'png']]]) if (!vals.includes(S[id])) S[id] = DEFAULTS[id];
} catch { /* stockage indisponible */ }
S.carte = normaliser(S.carte);
function persist() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* idem */ } }

let bgImage = null, logoImage = null, logoVer = 0;
// Logo du club pour les cartes (remplacé par le logo ajouté dans « Logo et export », s'il y en a un)
const logoClub = new Image();
const logoClubP = new Promise(res => { logoClub.onload = () => { logoVer++; res(); changed('compose'); }; logoClub.onerror = () => res(); });
logoClub.src = 'fonds/cartes/logo-club.png';
const logoCarte = () => carteFigee ? carteFigee.logo : logoImage || (logoClub.naturalWidth ? logoClub : null);

const PRESETS = [
  ['#111111', '#f2c500'], ['#0a0a0b', '#3a3a40'], ['#f2c500', '#fff7a8'], ['#0b2a5b', '#3b82f6'],
  ['#7f1d1d', '#ef4444'], ['#064e3b', '#22c55e'], ['#3b0764', '#a855f7'], ['#ffffff', '#d4d4d8'],
];

/* ---------------- workers ---------------- */
// Les workers sont créés à la demande : un worker mort n'est recréé qu'au besoin suivant,
// jamais en boucle depuis son propre gestionnaire d'erreur (CDN injoignable, hors ligne…).
let inferW = null, matteW = null;
let reqId = 0;
const pendingInfer = new Map(), pendingMatte = new Map();
let modelLoad = null; // { name, id, promise, resolve, reject }

// Délai d'inférence adapté au backend : un WASM monothread sur un portable chargé peut
// dépasser plusieurs minutes par photo ; couper trop tôt jetterait un calcul utile.
let INFER_TIMEOUT = 900_000;
const MATTE_TIMEOUT = 120_000;
const LOAD_SILENCE = 120_000; // délai sans aucun message pendant le chargement du modèle
const MAX_RESETS = 2;         // au-delà, moteur déclaré indisponible jusqu'au rechargement
let loadSeq = 0, inferResets = 0, matteResets = 0, engineDown = null, loadTimer = 0;

function failAll(map, err) { for (const p of map.values()) p.reject(err); map.clear(); }
function getInfer() {
  if (engineDown) throw engineDown;
  if (!inferW) {
    inferW = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    inferW.onmessage = onInferMessage;
    inferW.onerror = e => { e.preventDefault?.(); resetInfer(`le moteur de détourage n'a pas pu démarrer (${e.message || 'connexion au CDN ?'})`); };
    inferW.onmessageerror = () => resetInfer('message illisible du moteur de détourage');
  }
  return inferW;
}
function getMatte() {
  if (!matteW) {
    if (matteResets > MAX_RESETS) throw new Error('le nettoyage des contours est indisponible : recharge la page');
    matteW = new Worker(new URL('./matte-worker.js', import.meta.url), { type: 'module' });
    matteW.onmessage = onMatteMessage;
    matteW.onerror = e => { e.preventDefault?.(); resetMatte(`le nettoyage des contours a planté (${e.message || 'erreur inconnue'})`); };
    matteW.onmessageerror = () => resetMatte('message illisible du nettoyage');
  }
  return matteW;
}
/** Un worker mort ou muet ne doit jamais bloquer la file : on rejette tout et on le jette. */
function resetInfer(reason) {
  const err = new Error(reason);
  clearTimeout(loadTimer);
  failAll(pendingInfer, err);
  modelLoad?.reject(err); modelLoad = null;
  inferW?.terminate(); inferW = null;
  if (++inferResets > MAX_RESETS) engineDown = new Error(`${reason}. Moteur indisponible : vérifie la connexion puis recharge la page`);
}
function resetMatte(reason) {
  failAll(pendingMatte, new Error(reason));
  matteW?.terminate(); matteW = null;
  matteResets++;
}
function armLoadTimer() {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => resetInfer('le chargement du modèle ne progresse plus'), LOAD_SILENCE);
}

function onInferMessage(e) {
  const m = e.data;
  // Messages d'un chargement abandonné (changement de modèle entre-temps) : ignorés.
  if (m.loadId != null && m.loadId !== modelLoad?.id) return;
  if (m.type === 'progress') {
    armLoadTimer();
    if (m.cached) setStatus('Modèle trouvé dans le cache.');
    else { setStatus(`Téléchargement du modèle (une seule fois) : ${Math.round(m.loaded / 1e6)} / ${Math.round(m.total / 1e6)} Mo`); setBar(m.loaded / m.total); }
  } else if (m.type === 'status') { armLoadTimer(); setStatus(m.text); }
  else if (m.type === 'ready') {
    clearTimeout(loadTimer);
    inferResets = 0;
    INFER_TIMEOUT = m.backend === 'webgpu' ? 180_000 : 900_000;
    const chip = $('backend'); chip.hidden = false;
    chip.textContent = m.backend === 'webgpu' ? 'Accélération : WebGPU' : 'Accélération : aucune (WASM, plus lent)';
    modelLoad?.resolve();
  } else if (m.type === 'mask') {
    pendingInfer.get(m.id)?.resolve(m.mask); pendingInfer.delete(m.id);
  } else if (m.type === 'error') {
    if (m.id != null && pendingInfer.has(m.id)) { pendingInfer.get(m.id).reject(new Error(m.message)); pendingInfer.delete(m.id); }
    else if (modelLoad) { clearTimeout(loadTimer); modelLoad.failed = true; modelLoad.reject(new Error(m.message)); }
  }
}
function onMatteMessage(e) {
  const { id, rgba, error } = e.data, p = pendingMatte.get(id);
  if (!p) return;
  pendingMatte.delete(id);
  matteResets = 0;
  error ? p.reject(new Error(error)) : p.resolve(rgba);
}

/**
 * Charge le modèle courant une seule fois. Un échec reste mémorisé (pas de nouveau
 * téléchargement de 219 Mo pour chaque photo de la file) jusqu'à un changement de modèle
 * ou un rechargement de la page.
 */
function ensureModel() {
  if (modelLoad && modelLoad.name === S.model) return modelLoad.promise;
  let w;
  try { w = getInfer(); } catch (e) { return Promise.reject(e); }
  const ml = { name: S.model, id: ++loadSeq };
  ml.promise = new Promise((res, rej) => { ml.resolve = res; ml.reject = rej; });
  ml.promise.catch(() => {});
  modelLoad = ml;
  armLoadTimer();
  w.postMessage({ type: 'load', model: S.model, loadId: ml.id });
  return ml.promise;
}
function request(map, worker, msg, transfer, timeout, onTimeout) {
  const id = ++reqId;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { if (map.has(id)) onTimeout(); }, timeout);
    map.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } });
    worker.postMessage({ ...msg, id }, transfer);
  });
}
function infer(pixels) {
  let w;
  try { w = getInfer(); } catch (e) { return Promise.reject(e); }
  return request(pendingInfer, w, { type: 'run', pixels }, [pixels.buffer], INFER_TIMEOUT,
    () => resetInfer('le détourage ne répond plus (délai dépassé)'));
}
/** Les pixels sont transférés (non clonés) : l'appelant ne doit plus les utiliser. */
function matte(pixels, w, h, mask, opts) {
  let wk;
  try { wk = getMatte(); } catch (e) { return Promise.reject(e); }
  return request(pendingMatte, wk, { pixels, w, h, mask, opts }, [pixels.buffer], MATTE_TIMEOUT,
    () => resetMatte('le nettoyage ne répond plus (délai dépassé)'));
}

/* ---------------- interface : liaison des réglages ---------------- */
for (const [k, m] of Object.entries(MODELS)) $('model').add(new Option(m.label, k));
PRESETS.forEach(([a, b]) => {
  const s = document.createElement('button');
  s.className = 'sw'; s.title = 'Préréglage'; s.setAttribute('aria-label', `Dégradé ${a} vers ${b}`);
  s.style.background = `linear-gradient(180deg, ${a}, ${b})`;
  s.onclick = () => { S.g1 = a; S.g2 = b; S.color = b; if (S.bgMode !== 'solid') S.bgMode = 'gradient'; changed('compose'); };
  $('presets').appendChild(s);
});

// Chaque réglage déclenche le niveau de recalcul minimal nécessaire.
const LEVEL = { model: 'analyse', framing: 'analyse', keyOn: 'refine', keyColor: 'refine', keyTol: 'refine', sharp: 'refine' };
const FMT = { zoom: v => `${Math.round(v * 100)} %`, fill: v => `${v} %`, keyTol: v => v, sharp: v => v, blur: v => v, logoSize: v => `${v} %` };

function seg(id) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || S[id] === b.dataset.v) return;
    const prevMode = S[id];
    S[id] = b.dataset.v; changed(LEVEL[id] || 'compose');
    if (id === 'bgMode' && S.bgMode === 'preset' && !S.preset) { bgModeAvantGalerie = prevMode; openGallery(); }
  });
}
['framing', 'place', 'bgMode', 'out'].forEach(seg);
for (const id of ['model', 'format', 'zoom', 'fill', 'keyColor', 'keyTol', 'sharp', 'g1', 'g2', 'gtype', 'color', 'blur', 'logoPos', 'logoSize']) {
  $(id).addEventListener('input', e => {
    const v = typeof DEFAULTS[id] === 'number' ? +e.target.value : e.target.value;
    S[id] = v; changed(LEVEL[id] || 'compose');
  });
}
$('keyOn').addEventListener('change', e => { S.keyOn = e.target.checked; changed('refine'); });

function syncUI() {
  for (const id of ['framing', 'place', 'bgMode', 'out']) [...$(id).children].forEach(b => { const on = b.dataset.v === S[id]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  for (const id of ['model', 'format', 'zoom', 'fill', 'keyColor', 'keyTol', 'sharp', 'g1', 'g2', 'gtype', 'color', 'blur', 'logoPos', 'logoSize']) {
    if ($(id).value !== String(S[id])) $(id).value = S[id];
    if (FMT[id] && $(id + 'V')) $(id + 'V').textContent = FMT[id](S[id]);
  }
  $('keyOn').checked = S.keyOn;
  $('keyRows').hidden = !S.keyOn;
  $('zoomRow').hidden = S.framing !== 'bust';
  $('fullRows').hidden = S.framing !== 'full';
  $('format').disabled = S.framing === 'orig';
  $('bgGradient').hidden = S.bgMode !== 'gradient';
  $('bgSolid').hidden = S.bgMode !== 'solid';
  $('bgImage').hidden = S.bgMode !== 'image';
  $('bgPreset').hidden = S.bgMode !== 'preset';
  $('bgCarte').hidden = S.bgMode !== 'carte';
  syncPreset();
  if (S.bgMode === 'carte') syncCarte(); else viderCarteCache();
  $('logoRows').hidden = !logoImage || S.bgMode === 'carte'; $('logoDel').hidden = !logoImage;
  $('logoCarteHint').hidden = S.bgMode !== 'carte';
  const [w, h] = S.format.split('x');
  document.documentElement.style.setProperty('--ar', S.framing === 'orig' ? '3/4' : `${w}/${h}`);
}

let composeT = 0, refineT = 0;
function changed(level) {
  syncUI(); persist();
  if (S.bgMode === 'preset' && S.preset && presetImgId !== S.preset) loadCatalogue().then(() => loadPreset(S.preset));
  if (level === 'analyse') return reanalyseAll();
  if (level === 'refine') { matteVer++; scheduleRefine(); return; }
  clearTimeout(composeT);
  composeT = setTimeout(() => { items.forEach(it => it.status === 'ok' && renderItem(it)); if (viewing) drawViewer(); }, 100);
}

/* ---------------- fichiers ---------------- */
async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); return img; }
    catch { throw new Error('format non pris en charge par ce navigateur'); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}
/**
 * Copie une image décodée dans un canvas de taille connue. Un SVG sans largeur/hauteur
 * a des dimensions nulles : on lui donne 1024 px de large (proportions carrées par défaut).
 */
function rasterize(img) {
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) { w = 1024; h = 1024; }
  const k = Math.min(1, 1600 / Math.max(w, h));
  const c = canvas(Math.round(w * k), Math.round(h * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  return c;
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function scaled(src, maxSide) {
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = canvas(Math.max(1, Math.round(src.width * k)), Math.max(1, Math.round(src.height * k)));
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
$('bgFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { bgImage = rasterize(await decode(f)); S.bgMode = 'image'; changed('compose'); } catch { toast("Impossible de lire cette image de fond."); }
  e.target.value = '';
};
$('logoFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    logoImage = rasterize(await decode(f)); logoVer++;
    changed('compose');
    toast(items.some(i => i.status === 'ok') ? 'Logo ajouté aux vignettes.' : 'Logo ajouté : il apparaîtra sur les vignettes.');
  } catch { toast('Impossible de lire ce logo.'); }
  e.target.value = '';
};
$('logoDel').onclick = () => { logoImage = null; logoVer++; changed('compose'); };

/* ---------------- traitement ---------------- */
let items = [], nextId = 1, epoch = 0, queue = Promise.resolve();
let matteVer = 0; // version des réglages de nettoyage (couleur du filet, tolérance, bords)

function addFiles(list) {
  const files = [...list].filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp|gif|avif)$/i.test(f.name));
  if (!files.length) return;
  for (const f of files) {
    const name = f.name.replace(/\.[^.]+$/, '');
    const it = { id: nextId++, name, fiche: fichePhoto(name), file: f, status: 'wait', adj: { zoom: 1, dx: 0, dy: 0 } };
    items.push(it); renderItem(it); enqueue(it);
  }
  updateCount();
}
function enqueue(it) {
  const ep = epoch;
  queue = queue.then(() => processItem(it, ep)).catch(err => console.error(err));
}
function cancelPending() {
  epoch++;
  queue = Promise.resolve();
  failAll(pendingInfer, new Error('annulé'));
}
function reanalyseAll() {
  cancelPending();
  for (const it of items) { it.status = 'wait'; it.err = null; renderItem(it); enqueue(it); }
  updateCount();
}
const alive = (it, ep) => ep === epoch && items.includes(it);
const busy = () => items.some(i => i.status === 'wait' || i.status === 'run');

async function processItem(it, ep) {
  if (!alive(it, ep)) return;
  it.status = 'run'; renderItem(it);
  try {
    const done = items.filter(i => i.status === 'ok').length;
    await ensureModel();
    if (!alive(it, ep)) return;
    setStatus(`Détourage ${done + 1} / ${items.length} — ${it.name}`); setBar(done / items.length);
    const pixels = await analyse(it, ep);
    if (!pixels || !alive(it, ep)) return;
    await refineItem(it, pixels);
    if (!alive(it, ep)) return;
    it.status = 'ok';
    // Réglages de nettoyage modifiés pendant le traitement de cette photo : on la reprend.
    if (it.matteVer !== matteVer) scheduleRefine();
  } catch (e) {
    if (!alive(it, ep)) return;
    console.error(e);
    it.status = 'err'; it.err = String(e && e.message || e);
    if (/modèle|moteur|HTTP|session|wasm|webgpu|fetch|délai/i.test(it.err)) setStatus('Erreur du moteur de détourage : ' + it.err + '. Recharge la page pour réessayer.');
  }
  renderItem(it); updateCount();
  if (!busy()) {
    setBar(null);
    const ok = items.filter(i => i.status === 'ok').length, bad = items.filter(i => i.status === 'err').length;
    setStatus(`${ok} photo${ok > 1 ? 's' : ''} prête${ok > 1 ? 's' : ''}${bad ? `, ${bad} en échec` : ''}. Clique sur une photo pour la retoucher.`);
  }
}

/** Libère la mémoire d'un canvas temporaire (WebKit plafonne la mémoire totale des canvas). */
function free(c) { if (c) { c.width = 0; c.height = 0; } }

/** Masque brut (Float32 1024²) d'une zone de l'image source. */
async function maskOf(src, r) {
  const c = canvas(RES, RES), x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, RES, RES);
  const px = x.getImageData(0, 0, RES, RES).data;
  free(c);
  return infer(px);
}

function outAspect() { const [w, h] = S.format.split('x').map(Number); return w / h; }

/** Image source décodée, réduite à MAX_SIDE. */
async function loadSource(it) {
  const bmp = await decode(it.file);
  const src = scaled(bmp, MAX_SIDE);
  bmp.close?.();
  return src;
}
/** Pixels de la zone détourée, à la résolution de travail. */
function regionPixels(src, it) {
  const rw = Math.max(1, Math.round(it.region.w * it.rk)), rh = Math.max(1, Math.round(it.region.h * it.rk));
  const rc = canvas(rw, rh), rx = rc.getContext('2d', { willReadFrequently: true });
  rx.imageSmoothingQuality = 'high';
  rx.drawImage(src, it.region.x, it.region.y, it.region.w, it.region.h, 0, 0, rw, rh);
  const data = rx.getImageData(0, 0, rw, rh);
  free(rc);
  return data;
}

/** Étape lourde : pose, choix de la zone, inférence. Renvoie les pixels de la zone. */
async function analyse(it, ep) {
  const src = await loadSource(it);
  try {
    if (!alive(it, ep)) return null;
    const W = src.width, H = src.height;
    let anchor = null, region = { x: 0, y: 0, w: W, h: H }, pose = 'aucune';
    if (S.framing === 'bust') {
      const small = scaled(src, 1024);
      anchor = landmarksToAnchor(await detectPose(small), W, H);
      free(small);
      if (anchor) pose = 'pose';
      if (!alive(it, ep)) return null;
      if (!anchor) { // secours : repère tiré du masque de l'image entière
        const m = await maskOf(src, region);
        if (!alive(it, ep)) return null;
        const gw = Math.max(8, Math.round(512 * W / Math.max(W, H))), gh = Math.max(8, Math.round(512 * H / Math.max(W, H)));
        const a = maskToAnchor(resizeMask(m, RES, RES, gw, gh), gw, gh);
        if (a) {
          const kx = W / gw, ky = H / gh;
          anchor = { eyeY: a.eyeY * ky, shoulderY: a.shoulderY * ky, centerX: a.centerX * kx, shoulderWidth: a.shoulderWidth * kx, shoulderEstimated: true };
          pose = 'masque';
        }
      }
      if (!anchor) throw new Error('joueur introuvable sur la photo');
      // Zone détourée plus large que le cadre final : marge pour le zoom et les retouches.
      // Plus haute vers le haut : une grosse tête (enfant) agrandit le cadre final vers les cheveux.
      const rf = bustFrame(anchor, Math.max(outAspect(), 0.9), { zoom: REGION_ZOOM });
      region = padAndClip({ x: rf.x, y: rf.y - 0.3 * rf.h, w: rf.w, h: 1.3 * rf.h }, 0.04, W, H);
    }
    const raw = await maskOf(src, region);
    if (!alive(it, ep)) return null;
    const rk = Math.min(1, MAX_REGION / Math.max(region.w, region.h));
    const mask = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) mask[i] = Math.round(raw[i] * 255);
    if (it.preview) free(it.preview);
    Object.assign(it, { W, H, region, rk, anchor, pose, mask, preview: scaled(src, VIEW) });
    return regionPixels(src, it);
  } finally { free(src); }
}

/**
 * Étape légère : nettoyage du masque, décontamination, puis repères dépendant de l'alpha.
 * Les pixels source ne sont pas gardés en mémoire : sans `pixels`, on relit le fichier.
 */
async function refineItem(it, pixels) {
  const seq = (it.refineSeq = (it.refineSeq || 0) + 1), ver = matteVer;
  if (!pixels) { const src = await loadSource(it); try { pixels = regionPixels(src, it); } finally { free(src); } }
  const { width: w, height: h } = pixels;
  const rgba = await matte(pixels.data, w, h, it.mask, {
    keyColor: S.keyOn ? S.keyColor : null, keyTolerance: S.keyTol, sharpness: S.sharp,
  });
  if (seq !== it.refineSeq) return false;
  const cut = await createImageBitmap(new ImageData(new Uint8ClampedArray(rgba.buffer), w, h));
  if (seq !== it.refineSeq || !items.includes(it)) { cut.close(); return false; }
  const alpha = new Float32Array(w * h);
  for (let p = 0, i = 3; p < w * h; p++, i += 4) alpha[p] = rgba[i] / 255;
  it.cut?.close?.();
  it.cut = cut; it.cutW = w; it.cutH = h; it.matteVer = ver;
  it.headTop = null; it.bbox = null;
  if (it.anchor) {
    const cx = (it.anchor.centerX - it.region.x) * it.rk, half = 0.35 * it.anchor.shoulderWidth * it.rk;
    const top = headTopNear(alpha, w, h, cx, half);
    if (top >= 0) it.headTop = it.region.y + top / it.rk;
  }
  const bb = maskBBox(alpha, w, h);
  if (bb) it.bbox = { x0: it.region.x + bb.x0 / it.rk, y0: it.region.y + bb.y0 / it.rk, x1: it.region.x + bb.x1 / it.rk, y1: it.region.y + bb.y1 / it.rk };
  return true;
}

// Une seule vague de nettoyage à la fois ; un réglage modifié pendant la vague en relance une
// à la fin (au lieu d'empiler 30 tâches périmées par mouvement de curseur).
let refining = false, refineDirty = false;
function scheduleRefine() { clearTimeout(refineT); refineT = setTimeout(refineAll, 250); }
async function refineAll() {
  if (refining) { refineDirty = true; return; }
  refining = true;
  try {
    do {
      refineDirty = false;
      const ver = matteVer;
      // La photo ouverte d'abord, puis les autres dans l'ordre de la grille.
      const list = items.filter(it => it.status === 'ok' && it.matteVer !== ver)
        .sort((a, b) => (b === viewing) - (a === viewing));
      for (const [i, it] of list.entries()) {
        if (refineDirty) break;
        if (!items.includes(it) || it.status !== 'ok') continue;
        if (!busy()) setStatus(`Nettoyage des contours : ${i + 1} / ${list.length}`);
        try { if (await refineItem(it)) { renderItem(it); if (it === viewing) drawViewer(); } }
        catch (e) { console.error(e); }
      }
    } while (refineDirty);
    if (!busy()) setStatus('Contours mis à jour.');
  } finally { refining = false; }
}

/* ---------------- composition ---------------- */
function outSize(it) {
  if (S.framing === 'orig') return [it.cutW, it.cutH]; // pas d'agrandissement flou au-delà du détourage
  return S.format.split('x').map(Number);
}
function frameOf(it) {
  const [W, H] = outSize(it), asp = W / H;
  if (S.framing === 'orig') return { x: 0, y: 0, w: it.W, h: it.H };
  let f;
  const lim = S.framing === 'bust' ? subjectLimits(it.bbox, it.W) : null;
  if (S.framing === 'bust' && it.anchor) f = bustFrame(it.anchor, asp, { zoom: S.zoom, headTop: it.headTop, limits: lim });
  else if (S.framing === 'full' && it.bbox) f = fullFrame(it.bbox, asp, { fill: S.fill / 100, place: S.place, imgH: it.H });
  else f = { x: 0, y: 0, w: it.W, h: it.H };
  return clampToRegion(adjustFrame(f, it.adj), it.region, it.W, it.H, lim);
}
function drawBackground(ctx, W, H) {
  if (S.bgMode === 'none') return;
  if (S.bgMode === 'preset') {
    const c = presetCanvas(W, H);
    if (c) { ctx.drawImage(c, 0, 0, W, H); return; }
    ctx.fillStyle = '#141417'; ctx.fillRect(0, 0, W, H); return; // visuel en cours de chargement
  }
  if (S.bgMode === 'solid') { ctx.fillStyle = S.color; ctx.fillRect(0, 0, W, H); return; }
  if (S.bgMode === 'gradient') {
    let g;
    if (S.gtype === 'radial') { g = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, Math.hypot(W, H) * 0.62); g.addColorStop(0, S.g2); g.addColorStop(1, S.g1); }
    else { g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, S.g1); g.addColorStop(1, S.g2); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); return;
  }
  if (!bgImage) { ctx.fillStyle = '#777'; ctx.fillRect(0, 0, W, H); return; }
  const k = Math.max(W / bgImage.width, H / bgImage.height), bw = bgImage.width * k, bh = bgImage.height * k;
  const blur = S.blur * Math.max(W, H) / 1000, pad = blur * 2.5;
  ctx.save(); if (blur) ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(bgImage, (W - bw) / 2 - pad, (H - bh) / 2 - pad, bw + 2 * pad, bh + 2 * pad);
  ctx.restore();
}
/** Couche arrière de la carte à la taille de sortie, partagée entre photos quand c'est possible. */
const carteCache = new Map();
// pendant un export ZIP : carte, logo et mode figés (l'éditeur reste utilisable, appliqué après)
let carteFigee = null, zipEnCours = false;
const carteCfg = () => carteFigee ? carteFigee.cfg : S.carte;
const modeFond = () => carteFigee ? carteFigee.mode : S.bgMode;
function viderCarteCache() { for (const v of carteCache.values()) free(v); carteCache.clear(); }
function carteArriere(w, h) {
  const cfg = carteCfg(), key = `${w}x${h}|${carteFigee ? carteFigee.ver : logoVer}|${JSON.stringify(cfg)}`;
  let c = carteCache.get(key);
  if (!c) {
    if (carteCache.size > 3) viderCarteCache();
    c = canvas(w, h); dessinerCarte(c.getContext('2d'), w, h, cfg, { logo: logoCarte() }, 'arriere', null);
    carteCache.set(key, c);
  }
  return c;
}
/** Vignette en mode carte : couche arrière, contour éventuel, joueur, couche avant. */
function composeCarte(it, out, f, W, H) {
  const ow = out.width, oh = out.height, ctx = out.getContext('2d'), res = { logo: logoCarte() }, c = carteCfg();
  ctx.imageSmoothingQuality = 'high';
  if (dependDeLaPhoto(c)) dessinerCarte(ctx, ow, oh, c, res, 'arriere', it.fiche);
  else ctx.drawImage(carteArriere(ow, oh), 0, 0);
  const sx = ow / f.w, sy = oh / f.h, r = it.region;
  if (c.contourJoueur.actif) {
    const p = canvas(ow, oh), px = p.getContext('2d'); px.imageSmoothingQuality = 'high';
    px.drawImage(it.cut, (r.x - f.x) * sx, (r.y - f.y) * sy, r.w * sx, r.h * sy);
    contourJoueur(ctx, p, ow, oh, c); ctx.drawImage(p, 0, 0); free(p);
  } else ctx.drawImage(it.cut, (r.x - f.x) * sx, (r.y - f.y) * sy, r.w * sx, r.h * sy);
  dessinerCarte(ctx, ow, oh, c, res, 'avant', it.fiche);
  return out;
}
/** Vignette finale, réduite pour que son plus grand côté ne dépasse pas maxDim. */
function compose(it, maxDim = Infinity, { transparent = false } = {}) {
  const [W, H] = outSize(it), f = frameOf(it);
  const k = Math.min(1, maxDim / Math.max(W, H));
  const out = canvas(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)));
  if (!transparent && modeFond() === 'carte') return composeCarte(it, out, f, W, H);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(out.width / W, out.height / H);
  if (!transparent) drawBackground(ctx, W, H);
  const sx = W / f.w, sy = H / f.h, r = it.region;
  ctx.drawImage(it.cut, (r.x - f.x) * sx, (r.y - f.y) * sy, r.w * sx, r.h * sy);
  if (logoImage && !transparent) {
    const lw = W * S.logoSize / 100, lh = lw * logoImage.height / logoImage.width, m = W * 0.035;
    ctx.drawImage(logoImage, S.logoPos.includes('r') ? W - lw - m : m, S.logoPos.includes('b') ? H - lh - m : m, lw, lh);
  }
  return out;
}
function fileType() { return S.out === 'png' || S.bgMode === 'none' ? ['image/png', 'png'] : ['image/jpeg', 'jpg']; }
/** Encode puis libère le canvas. */
function toBlob(c) { const [t] = fileType(); return new Promise((res, rej) => c.toBlob(b => { free(c); b ? res(b) : rej(new Error('export impossible')); }, t, 0.92)); }

/* ---------------- visuels de fond (catalogue) ---------------- */
// fonds/catalogue.json : graphiques (publiés). fonds/salle/catalogue.json : photos de la salle,
// présentes seulement en local (exclues de Git) ; leur absence est normale.
let catalogue = [], catalogueP = null;
let presetImg = null, presetImgId = null, presetLoading = null;
const presetRaster = new Map(); // `${W}x${H}` → canvas du visuel à la taille de sortie

function loadCatalogue() {
  if (catalogueP) return catalogueP;
  const get = url => fetch(url, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  catalogueP = Promise.all([get('fonds/catalogue.json'), get('fonds/salle/catalogue.json')]).then(([a, b]) => {
    catalogue = [...cartesCatalogue(), ...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
    // Visuel mémorisé disparu du catalogue : on revient au fond par défaut. Si le catalogue n'a pas
    // répondu (réseau), on garde le choix : il redeviendra valable au prochain chargement.
    if (Array.isArray(a) && S.preset && !presetEntry(S.preset)) {
      S.preset = ''; if (S.bgMode === 'preset') S.bgMode = DEFAULTS.bgMode;
      changed('compose');
    } else syncPreset();
    if (!Array.isArray(a)) catalogueP = null; // nouvel essai à la prochaine ouverture
    return catalogue;
  });
  return catalogueP;
}
function presetEntry(id) { return catalogue.find(x => x.id === id && !x.carte) || null; }

/* ---------------- cartes (modèles générés + éditeur) ---------------- */
let cartesListe = null;
function cartesCatalogue() {
  if (!cartesListe) cartesListe = modeles().map(m => ({ id: m.id, titre: m.titre, groupe: 'Cartes', famille: m.famille, thumb: '', carte: m.cfg }));
  return cartesListe;
}
/** Aperçu d'une carte (sans joueur), en image. */
function apercuCarte(cfg, w = 150) {
  const h = Math.round(w * 1.4), c = canvas(w, h);
  dessinerCarte(c.getContext('2d'), w, h, cfg, { logo: logoCarte() }, 'arriere', null);
  dessinerCarte(c.getContext('2d'), w, h, cfg, { logo: logoCarte() }, 'avant', null);
  return c;
}
// Vignettes des cartes générées au fil de l'eau (quelques-unes par image, sans bloquer la page)
let vignettesFile = [], vignettesT = 0;
function vignettesCartes() {
  cancelAnimationFrame(vignettesT);
  vignettesFile = [...$('gGrid').querySelectorAll('img[data-carte]')].filter(i => !i.src);
  const etape = () => {
    const t0 = performance.now();
    while (vignettesFile.length && performance.now() - t0 < 12) {
      const img = vignettesFile.shift(), e = cartesCatalogue().find(x => x.id === img.dataset.carte);
      if (!e) continue;
      if (!e.thumb || e.thumbVer !== logoVer) { const c = apercuCarte(e.carte); e.thumb = c.toDataURL('image/jpeg', 0.82); e.thumbVer = logoVer; free(c); }
      img.src = e.thumb;
    }
    if (vignettesFile.length) vignettesT = requestAnimationFrame(etape);
  };
  vignettesT = requestAnimationFrame(etape);
}
let syncEditeur = () => {};
function appliquerCarte(cfg, id = '') {
  S.carte = normaliser(JSON.parse(JSON.stringify(cfg))); S.carteId = id; S.bgMode = 'carte';
  syncEditeur(); changed('compose');
}
function syncCarte() {
  const e = cartesCatalogue().find(x => x.id === S.carteId);
  $('carteName').textContent = e ? `${e.id} · ${e.titre}` : 'Carte personnalisée';
  const th = $('carteThumb'), c = apercuCarte(S.carte, 60);
  th.getContext('2d').clearRect(0, 0, th.width, th.height); th.getContext('2d').drawImage(c, 0, 0, th.width, th.height); free(c);
}
syncEditeur = construireEditeur($('carteEditeur'), () => S.carte, () => { S.carteId = ''; changed('compose'); });
$('carteOpen').onclick = () => { galGroup = 'Cartes'; galFam = 'Toutes'; openGallery(); };
$('carteSurprise').onclick = () => { appliquerCarte(surprise()); toast('Nouvelle carte tirée au sort : modifie-la à ton goût.'); };
$('carte108').onclick = () => appliquerCarte(CARTE_DEFAUT, 'C000');

// Mes cartes : enregistrées dans ce navigateur, exportables en fichier
const MES = 'detourage-panini:cartes';
const mesCartes = () => { try { const l = JSON.parse(localStorage.getItem(MES) || '[]'); return Array.isArray(l) ? l.filter(x => x && typeof x.nom === 'string') : []; } catch { return []; } };
function renderMesCartes() {
  const l = mesCartes(), sel = $('mesCartes');
  sel.replaceChildren(...(l.length ? l.map((x, i) => new Option(x.nom, i)) : [new Option('Aucune carte enregistrée', '')]));
  sel.disabled = $('mesAppliquer').disabled = $('mesSupprimer').disabled = !l.length;
}
$('mesEnregistrer').onclick = () => {
  let n = 1; while (mesCartes().some(x => x.nom === `Ma carte ${n}`)) n++;   // premier numéro libre
  const nom = $('mesNom').value.trim() || `Ma carte ${n}`;
  const avant = mesCartes(), remplace = avant.some(x => x.nom === nom);
  const l = avant.filter(x => x.nom !== nom); l.push({ nom, cfg: S.carte });
  try { localStorage.setItem(MES, JSON.stringify(l)); toast(`Carte « ${nom} » ${remplace ? 'remplacée' : 'enregistrée'}.`); } catch { toast("Impossible d'enregistrer (stockage du navigateur indisponible)."); }
  $('mesNom').value = ''; renderMesCartes(); $('mesCartes').value = String(l.length - 1);
};
$('mesAppliquer').onclick = () => { const x = mesCartes()[+$('mesCartes').value]; if (x) { appliquerCarte(x.cfg); toast(`Carte « ${x.nom} » appliquée.`); } };
$('mesSupprimer').onclick = () => {
  const l = mesCartes(), i = +$('mesCartes').value; if (!l[i]) return;
  const [x] = l.splice(i, 1);
  try { localStorage.setItem(MES, JSON.stringify(l)); } catch { /* idem */ }
  renderMesCartes(); toast(`Carte « ${x.nom} » supprimée.`);
};
$('mesExporter').onclick = () => {
  const b = new Blob([JSON.stringify({ type: 'carte-detourage-panini', version: 1, cfg: S.carte }, null, 2)], { type: 'application/json' });
  saveBlob(b, 'carte.json');
};
$('mesImporter').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    if (f.size > 200000) throw new Error('taille');
    const j = JSON.parse(await f.text());
    if (!j || typeof j !== 'object' || j.type !== 'carte-detourage-panini' || !j.cfg || typeof j.cfg !== 'object') throw new Error('format');
    appliquerCarte(j.cfg); toast('Carte importée.');
  } catch { toast("Ce fichier n'est pas une carte valide."); }
};
renderMesCartes();

/** Charge le visuel choisi ; la composition repart dès qu'il est prêt. */
function loadPreset(id) {
  const e = presetEntry(id);
  if (!e) return Promise.resolve();
  if (presetImgId === id && presetImg) return Promise.resolve();
  const img = new Image();
  img.decoding = 'async';
  img.src = e.src;
  const p = img.decode().then(() => {
    if (S.preset !== id) return; // un autre visuel a été choisi entre-temps
    presetImg = img; presetImgId = id; clearPresetRaster();
    changed('compose');
  }).catch(() => {
    toast(`Impossible de charger le visuel ${id}.`);
    if (S.preset === id) { S.preset = presetImgId || ''; if (!S.preset && S.bgMode === 'preset') S.bgMode = DEFAULTS.bgMode; changed('compose'); }
  });
  presetLoading = p;
  return p;
}

function clearPresetRaster() { for (const v of presetRaster.values()) free(v); presetRaster.clear(); }
/**
 * Visuel converti une seule fois par proportion (un SVG avec filtres est coûteux à redessiner) :
 * rastérisé à 1400 px de haut puis redimensionné au dessin. Renvoie null tant que le visuel
 * choisi n'est pas prêt (jamais l'ancien visuel à sa place).
 */
const PRESET_REF_H = 1400;
function presetCanvas(W0, H0) {
  if (!presetImg || presetImgId !== S.preset) return null;
  const H = PRESET_REF_H, W = Math.max(1, Math.round(PRESET_REF_H * W0 / H0));
  const key = String(W);
  let c = presetRaster.get(key);
  if (!c) {
    c = canvas(W, H);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    const iw = presetImg.naturalWidth || 1000, ih = presetImg.naturalHeight || 1400;
    const k = Math.max(W / iw, H / ih), bw = iw * k, bh = ih * k;
    // Recadrage « couvrir », calé en haut : la tête du joueur reste là où le visuel l'attend.
    x.drawImage(presetImg, (W - bw) / 2, 0, bw, bh);
    if (presetRaster.size > 3) clearPresetRaster();
    presetRaster.set(key, c);
  }
  return c;
}

function syncPreset() {
  const e = presetEntry(S.preset);
  const th = $('presetThumb');
  if (e) { th.src = e.thumb; th.alt = e.titre; $('presetName').textContent = `${e.id} · ${e.titre}`; $('presetFam').textContent = `${e.groupe} · ${e.famille}`; }
  else { th.removeAttribute('src'); $('presetName').textContent = 'Choisir un visuel'; $('presetFam').textContent = catalogue.some(x => !x.carte) ? `${catalogue.filter(x => !x.carte).length} fonds aux couleurs du club` : 'Plus de 300 fonds aux couleurs du club'; }
}

const gal = $('gallery');
let galGroup = 'Tous', galFam = 'Toutes', galBuilt = false, playerUrl = null;

function famsFor(g) { return ['Toutes', ...new Set(catalogue.filter(x => (g === 'Tous' ? !x.carte : x.groupe === g)).map(x => x.famille))]; }
function chip(label, on, onclick) {
  const b = document.createElement('button');
  b.className = 'g-chip' + (on ? ' on' : ''); b.textContent = label; b.setAttribute('aria-pressed', on); b.onclick = onclick;
  return b;
}
function renderGalleryFilters() {
  const groups = ['Tous', ...new Set(catalogue.map(x => x.groupe))];
  $('gGroups').replaceChildren(...groups.map(g => chip(g, g === galGroup, () => { galGroup = g; galFam = 'Toutes'; renderGalleryFilters(); renderGalleryGrid(); })));
  const sel = $('gFams');
  sel.replaceChildren(...famsFor(galGroup).map(f => new Option(f === 'Toutes' ? 'Toutes les familles' : f, f, false, f === galFam)));
  sel.onchange = () => { galFam = sel.value; renderGalleryGrid(); };
}
function renderGalleryGrid() {
  const grid = $('gGrid'), frag = document.createDocumentFragment();
  let last = null, n = 0;
  for (const e of catalogue) {
    if (galGroup === 'Tous' ? e.carte : e.groupe !== galGroup) continue;
    if (galFam !== 'Toutes' && e.famille !== galFam) continue;
    n++;
    const sec = `${e.groupe} · ${e.famille}`;
    if (galFam === 'Toutes' && sec !== last) {
      const h = document.createElement('div'); h.className = 'g-sec'; h.textContent = sec; frag.appendChild(h); last = sec;
    }
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'g-card' + (!e.carte && S.bgMode !== 'carte' && e.id === S.preset ? ' on' : ''); b.dataset.id = e.id;
    b.innerHTML = '<div class="g-pic"><img loading="lazy" alt=""><img class="g-pl" loading="lazy" alt=""></div><div class="g-cap"><b></b><span></span></div>';
    const [bg, pl] = b.querySelectorAll('img');
    if (e.carte) { bg.dataset.carte = e.id; bg.removeAttribute('loading'); if (e.thumb && e.thumbVer === logoVer) bg.src = e.thumb; b.classList.toggle('on', S.bgMode === 'carte' && e.id === S.carteId); }
    else bg.src = e.thumb;
    if (playerUrl) pl.src = playerUrl; else pl.remove();
    b.querySelector('b').textContent = e.id; b.querySelector('span').textContent = e.titre;
    b.title = `${e.id} · ${e.titre}`;
    b.setAttribute('aria-label', `Fond ${e.id}, ${e.titre}`);
    frag.appendChild(b);
  }
  grid.replaceChildren(frag);
  grid.scrollTop = 0;
  vignettesCartes();
  $('gCount').textContent = `${n} visuel${n > 1 ? 's' : ''}`;
}
/** Image d'un joueur détouré, sans fond, pour juger les visuels en situation. */
function makePlayerOverlay() {
  if (playerUrl) { URL.revokeObjectURL(playerUrl); playerUrl = null; }
  const it = (viewing && viewing.status === 'ok') ? viewing : items.find(i => i.status === 'ok');
  if (!it || S.framing === 'orig') { $('gWithPlayer').hidden = true; return Promise.resolve(); }
  $('gWithPlayer').hidden = false;
  const c = compose(it, 300, { transparent: true });
  return new Promise(res => c.toBlob(b => { free(c); if (b) playerUrl = URL.createObjectURL(b); res(); }, 'image/png'));
}
let galOpening = false;
async function openGallery() {
  if (galOpening) return;
  galOpening = true;
  try { await openGalleryInner(); } finally { galOpening = false; }
}
async function openGalleryInner() {
  if (viewing) closeViewer();
  await loadCatalogue();
  if (galGroup !== 'Cartes' && !catalogue.some(x => !x.carte)) return toast("Aucun visuel trouvé : le dossier « fonds » est-il publié avec la page ?");
  await makePlayerOverlay();
  renderGalleryFilters(); renderGalleryGrid();
  gal.classList.toggle('noplayer', !$('gPlayer').checked);
  if (!gal.open) gal.showModal();
  gal.querySelector('.g-card.on')?.scrollIntoView({ block: 'center' });
}
$('gGrid').addEventListener('click', e => {
  const card = e.target.closest('.g-card'); if (!card) return;
  const ce = cartesCatalogue().find(x => x.id === card.dataset.id);
  if (ce) { appliquerCarte(ce.carte, ce.id); gal.close(); toast(`Carte ${ce.id} appliquée : chaque élément se règle dans « Fond ».`); return; }
  S.preset = card.dataset.id; S.bgMode = 'preset';
  for (const c of $('gGrid').querySelectorAll('.g-card.on')) c.classList.remove('on');
  card.classList.add('on');
  loadPreset(S.preset);
  changed('compose');
  gal.close();
  toast(`Fond ${S.preset} appliqué`);
});
$('gPlayer').onchange = e => gal.classList.toggle('noplayer', !e.target.checked);
$('gClose').onclick = () => gal.close();
const ouvrirVisuels = () => { if (galGroup === 'Cartes') { galGroup = 'Tous'; galFam = 'Toutes'; } openGallery(); };
$('presetOpen').onclick = ouvrirVisuels;
$('presetOpen2').onclick = ouvrirVisuels;
gal.addEventListener('click', e => { if (e.target === gal) gal.close(); }); // clic sur le fond assombri
let bgModeAvantGalerie = null;
gal.addEventListener('close', () => {
  cancelAnimationFrame(vignettesT); vignettesFile = [];
  if (S.bgMode === 'preset' && !S.preset) { S.bgMode = bgModeAvantGalerie || DEFAULTS.bgMode; changed('compose'); }
  bgModeAvantGalerie = null;
});

/** Avant un export : le fond choisi doit être réellement prêt (sinon fond provisoire exporté). */
async function backgroundReady() {
  if (S.bgMode === 'carte') { if (!logoImage) await logoClubP; return true; }
  if (S.bgMode !== 'preset') return true;
  if (!S.preset) { toast('Choisis un visuel de fond avant d’exporter.'); return false; }
  await loadCatalogue();
  await loadPreset(S.preset);
  if (presetImgId !== S.preset) { toast('Le visuel de fond n’est pas encore prêt, réessaie dans un instant.'); return false; }
  return true;
}

/* ---------------- grille ---------------- */
function renderItem(it) {
  if (!items.includes(it)) return; // photo retirée pendant un traitement asynchrone
  let el = document.getElementById('it' + it.id);
  if (!el) {
    el = document.createElement('div'); el.className = 'item'; el.id = 'it' + it.id;
    el.innerHTML = '<div class="pic" role="button" tabindex="0" aria-label="Retoucher"><img alt=""></div><div class="meta"><span></span><em class="tag" hidden></em><button title="Télécharger" aria-label="Télécharger" data-a="dl">⬇︎</button><button title="Retirer" aria-label="Retirer" data-a="rm">✕</button></div>'
      + '<div class="fiche"><input data-f="numero" inputmode="numeric" maxlength="3" placeholder="N°" aria-label="Numéro">'
      + '<input data-f="nom" maxlength="60" placeholder="Prénom Nom" aria-label="Nom">'
      + '<input data-f="poste" maxlength="40" placeholder="Poste" aria-label="Poste" list="postes"></div>';
    el.querySelector('span').textContent = it.name;
    for (const inp of el.querySelectorAll('.fiche input')) {
      inp.value = it.fiche[inp.dataset.f];
      inp.title = inp.getAttribute('aria-label'); inp.setAttribute('aria-label', `${inp.title} (${it.name})`);
      inp.addEventListener('input', () => modifierFiche(it, inp.dataset.f, inp.value));
      inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ficheSuivante(it, inp.dataset.f, e.shiftKey ? -1 : 1); } });
    }
    majNomFiche(it, el);
    el.querySelector('img').alt = it.name;
    el.addEventListener('click', e => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'rm') return removeItem(it);
      if (a === 'dl') return downloadOne(it);
      if (e.target.closest('.pic') && it.status === 'ok') openViewer(it);
    });
    el.querySelector('.pic').addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && it.status === 'ok') { e.preventDefault(); openViewer(it); }
    });
    $('grid').appendChild(el);
  }
  let w = el.querySelector('.wait');
  if (it.status !== 'ok') {
    if (!w) { w = document.createElement('div'); w.className = 'wait'; el.querySelector('.pic').appendChild(w); }   // la fiche reste saisissable pendant le détourage
    w.innerHTML = it.status === 'err' ? '' : `<div><div class="spin"></div>${it.status === 'run' ? 'Détourage…' : 'En attente…'}</div>`;
    if (it.status === 'err') w.textContent = '⚠️ ' + it.err;
    return;
  }
  w?.remove();
  const tag = el.querySelector('.tag');
  // Signale les photos cadrées sans pose détectée : à vérifier à l'œil.
  tag.hidden = !(S.framing === 'bust' && it.pose === 'masque');
  tag.textContent = 'à vérifier'; tag.title = "Aucune pose détectée : cadrage estimé d'après la silhouette";
  el.querySelector('.pic').style.setProperty('--ar', S.framing === 'orig' ? `${it.W}/${it.H}` : '');
  const thumb = compose(it, THUMB);
  thumb.toBlob(b => {
    free(thumb);
    if (!b || !el.isConnected) return;
    const img = el.querySelector('img');
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    img.dataset.url = URL.createObjectURL(b); img.src = img.dataset.url;
  }, 'image/png');
}
function removeItem(it) {
  items = items.filter(x => x !== it);
  const el = document.getElementById('it' + it.id);
  const url = el?.querySelector('img')?.dataset.url; if (url) URL.revokeObjectURL(url);
  el?.remove();
  it.cut?.close?.(); it.cut = null; free(it.preview); it.preview = null; it.mask = null;
  if (viewing === it) closeViewer();
  updateCount();
}
function updateCount() {
  const ok = items.filter(i => i.status === 'ok').length, busy = items.some(i => i.status === 'wait' || i.status === 'run');
  $('count').textContent = items.length ? `${ok} / ${items.length} photo${items.length > 1 ? 's' : ''} prête${ok > 1 ? 's' : ''}` : 'Aucune photo';
  $('zip').disabled = !ok || busy || zipEnCours; $('clear').disabled = !items.length;
  $('empty').hidden = items.length > 0;
}
$('clear').onclick = () => { cancelPending(); [...items].forEach(removeItem); setStatus(''); setBar(null); };

/* ---------------- téléchargements ---------------- */
/** Nom de fichier valide partout (Windows : caractères interdits, noms réservés, point ou espace final). */
function safeName(n) {
  let s = n.replace(/[\x00-\x1f\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120).replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s = '_' + s;
  return s || 'joueur';
}
/** Nom du fichier téléchargé : « 10 - Léa Martin (Gardienne) », ou le nom d'origine si la fiche est vide. */
const nomExport = it => safeName(nomFichier(it.fiche, it.name));
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function downloadOne(it) {
  if (it.status !== 'ok') { if (it.status !== 'err') toast('Photo pas encore prête : détourage en cours.'); return; }
  if (!(await backgroundReady())) return;
  try { saveBlob(await toBlob(compose(it)), `${nomExport(it)}.${fileType()[1]}`); }
  catch (e) { toast("L'export a échoué : " + e.message); }
}
$('zip').onclick = async () => {
  const ok = items.filter(i => i.status === 'ok');
  if (!ok.length) return;
  if (typeof JSZip === 'undefined') return toast("La bibliothèque ZIP n'a pas pu se charger : télécharge les photos une par une.");
  if (zipEnCours) return;
  zipEnCours = true; $('zip').disabled = true;   // verrou avant toute attente (double clic)
  try {
    if (!(await backgroundReady())) return;
    carteFigee = { cfg: structuredClone(S.carte), logo: logoCarte(), ver: logoVer, mode: S.bgMode };
    const zip = new JSZip(), used = new Set(), ext = fileType()[1];
    for (const [i, it] of ok.entries()) {
      if (!items.includes(it) || !it.cut) continue; // retirée pendant l'export
      setStatus(`Préparation du ZIP : ${i + 1} / ${ok.length}`); setBar((i + 1) / ok.length);
      const base = nomExport(it); let n = base, k = 2;
      while (used.has(n.toLowerCase())) n = `${base} (${k++})`;   // « (2) » : ignoré à la relecture
      used.add(n.toLowerCase());
      zip.file(`${n}.${ext}`, await toBlob(compose(it)));
    }
    saveBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), 'vignettes.zip');
    setStatus(`ZIP prêt : ${ok.length} photo${ok.length > 1 ? 's' : ''}.`);
  } catch (e) { toast('Le ZIP a échoué : ' + e.message); }
  finally {
    const fige = carteFigee; carteFigee = null; zipEnCours = false; setBar(null); updateCount();
    // modifications faites pendant l'export : on les affiche maintenant
    if (fige && (fige.mode !== S.bgMode || fige.ver !== logoVer || JSON.stringify(fige.cfg) !== JSON.stringify(S.carte))) changed('compose');
  }
};

/* ---------------- fiche joueur (numéro, nom, poste) ---------------- */
// Les photos arrivent le plus souvent avec le nom de l'appareil (DC29430RE) : la fiche se remplit
// à la main, sert aux textes de la carte et au nom du fichier téléchargé.
const ficheT = new Map();
function modifierFiche(it, champ, valeur) {
  if (champ === 'numero') valeur = valeur.replace(/\D/g, '').slice(0, 3);
  it.fiche[champ] = valeur;
  majNomFiche(it);
  const g = document.querySelector(`#it${it.id} .fiche input[data-f="${champ}"]`); if (g && g.value !== valeur) g.value = valeur;   // aussi pour retirer une lettre tapée dans le N°
  if (viewing === it) { const v = document.querySelector(`#vFiche input[data-f="${champ}"]`); if (v && v.value !== valeur) v.value = valeur; }
  // la vignette ne change que si la carte affiche ces champs
  if (modeFond() !== 'carte' || !dependDeLaPhoto(carteCfg()) || it.status !== 'ok') return;
  clearTimeout(ficheT.get(it.id));
  ficheT.set(it.id, setTimeout(() => { ficheT.delete(it.id); renderItem(it); if (viewing === it) drawViewer(); }, 250));
}
function majNomFiche(it, el = document.getElementById('it' + it.id)) {
  const n = nomExport(it);
  if (el) { const s = el.querySelector('.meta span'); s.textContent = n; s.title = `Fichier : ${n}.${fileType()[1]} (photo d'origine : ${it.name})`; }
  if (viewing === it) $('vName').textContent = n;
}
/** Entrée : même champ de la photo suivante (Maj+Entrée : précédente), pour saisir l'équipe d'affilée. */
function ficheSuivante(it, champ, sens) {
  const i = items.indexOf(it), nx = items[i + sens];
  document.querySelector(`#it${nx?.id} .fiche input[data-f="${champ}"]`)?.focus();
}
for (const inp of document.querySelectorAll('#vFiche input')) {
  inp.addEventListener('input', () => { if (viewing) modifierFiche(viewing, inp.dataset.f, inp.value); });
}

/* ---------------- visionneuse et retouche ---------------- */
let viewing = null;
const dlg = $('viewer');
function okItems() { return items.filter(i => i.status === 'ok'); }
function openViewer(it) {
  viewing = it; majNomFiche(it);
  for (const inp of document.querySelectorAll('#vFiche input')) { inp.value = it.fiche[inp.dataset.f]; inp.title = inp.getAttribute('aria-label'); }
  syncAdj(); drawViewer();
  if (!dlg.open) dlg.showModal();
}
function closeViewer() { if (dlg.open) dlg.close(); }
dlg.addEventListener('close', () => { viewing = null; });
function syncAdj() {
  $('aZoom').value = viewing.adj.zoom; $('aX').value = viewing.adj.dx; $('aY').value = viewing.adj.dy;
  const locked = S.framing === 'orig';
  for (const id of ['aZoom', 'aX', 'aY', 'aReset']) $(id).disabled = locked;
}
function drawViewer() {
  if (!viewing || viewing.status !== 'ok') return;
  const c = compose(viewing, VIEW), v = $('vCanvas');
  v.width = c.width; v.height = c.height; v.getContext('2d').drawImage(c, 0, 0); free(c);
  const p = viewing.preview, s = $('vSrc');
  s.width = p.width; s.height = p.height; s.getContext('2d').drawImage(p, 0, 0);
}
let adjT = 0;
for (const [id, key] of [['aZoom', 'zoom'], ['aX', 'dx'], ['aY', 'dy']]) {
  $(id).addEventListener('input', e => {
    if (!viewing) return;
    viewing.adj[key] = +e.target.value; drawViewer();
    const it = viewing; clearTimeout(adjT); adjT = setTimeout(() => renderItem(it), 150);
  });
}
$('aReset').onclick = () => { if (!viewing) return; viewing.adj = { zoom: 1, dx: 0, dy: 0 }; syncAdj(); drawViewer(); renderItem(viewing); };
$('vClose').onclick = closeViewer;
$('vDl').onclick = () => viewing && downloadOne(viewing);
function step(d) {
  const list = okItems(); if (!viewing || !list.length) return;
  const i = list.indexOf(viewing);
  openViewer(list[(i + d + list.length) % list.length]);
}
$('vPrev').onclick = () => step(-1);
$('vNext').onclick = () => step(1);
dlg.addEventListener('keydown', e => {
  if (e.target.matches('input')) return;
  if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
});
// Pipette : prélève la couleur du filet sur la photo d'origine (moyenne 5×5).
$('vSrc').addEventListener('click', e => {
  const s = $('vSrc'), r = s.getBoundingClientRect();
  // object-fit: contain → retrouver la zone réellement occupée par l'image dans l'élément
  const k = Math.min(r.width / s.width, r.height / s.height), ox = (r.width - s.width * k) / 2, oy = (r.height - s.height * k) / 2;
  const x = Math.round((e.clientX - r.left - ox) / k), y = Math.round((e.clientY - r.top - oy) / k);
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return;
  const x0 = Math.max(0, x - 2), y0 = Math.max(0, y - 2);
  const d = s.getContext('2d').getImageData(x0, y0, Math.min(5, s.width - x0), Math.min(5, s.height - y0)).data;
  let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
  const hex = '#' + [R, G, B].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
  S.keyColor = hex; S.keyOn = true;
  toast(`Couleur du filet : ${hex}`);
  changed('refine');
});

/* ---------------- divers ---------------- */
function setBar(p) {
  $('bar').hidden = p == null;
  if (p != null) { const v = Math.min(1, p) * 100; $('barI').style.width = v.toFixed(1) + '%'; $('bar').setAttribute('aria-valuenow', Math.round(v)); }
}
function setStatus(t) { $('status').textContent = t; }
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3200); }

const drop = $('drop');
$('files').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
// Déposer des photos n'importe où sur la page.
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { if (!drop.contains(e.target)) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

syncUI(); updateCount();
loadCatalogue().then(() => { if (S.bgMode === 'preset' && S.preset) loadPreset(S.preset); });
// Accès pour les tests automatisés.
window.__detourage = { get items() { return items; }, S, compose, addFiles, frameOf, get presetPret() { return presetImgId; } };
