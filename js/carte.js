// Cartes paramétrables, dessinées au canvas à n'importe quelle taille.
//
// Une carte = une configuration d'éléments (fond, halo, motif, écusson en filigrane, grand numéro,
// panthère, cadre, coins, bandeau, plaque nominative, badge, logo, texte, contour du joueur, effet
// holographique, effets). Le modèle 108 « Carte écusson » est la configuration par défaut ; les
// centaines de modèles proposés et les cartes créées par l'utilisateur utilisent ce même moteur :
// tout ce qui est proposé peut être recréé et modifié dans l'éditeur (même schéma, SPEC).
//
// Repère : x et y en fraction de la largeur / hauteur de la carte ; tailles et épaisseurs en
// fraction de la largeur (carte 1000×1400 : 0,022 = 22 px).
//
// Textes : {nom}, {numero}, {poste} sont tirés du nom de chaque photo, par exemple
// « 10 - Léa Martin (Gardienne).jpg » → numéro 10, nom Léa Martin, poste Gardienne.

const pct = v => `${Math.round(v * 100)} %`, deg = v => `${Math.round(v)}°`, fois = v => `× ${v.toFixed(2)}`;
const MODES = [['couleur', 'Couleurs du logo'], ['clair', 'Parties claires teintées'], ['sombre', 'Parties sombres teintées'], ['silhouette', 'Silhouette unie']];
const FONDUS = [['aucun', 'Aucun'], ['haut', 'Visible en haut'], ['bas', 'Visible en bas'], ['centre', 'Visible au centre'], ['bords', 'Visible sur les bords']];

const N = (label, min, max, step, fmt = pct) => ({ t: 'num', label, min, max, step, fmt });
const C = label => ({ t: 'color', label });
const CO = label => ({ t: 'colorOpt', label });   // couleur facultative ('' = aucune)
const B = label => ({ t: 'bool', label });
const E = (label, options) => ({ t: 'enum', label, options });
const T = label => ({ t: 'text', label });
/** Champ affiché seulement si `si(section)` est vrai (ex. « Couleur 3 » pour le dégradé 3 couleurs). */
const si = (f, cond) => ({ ...f, si: cond });

/** Schéma : sections, champs (type, bornes, libellés). Sert à normaliser et à construire l'éditeur. */
export const SPEC = {
  fond: { titre: 'Fond', champs: {
    type: E('Type', [['degrade', 'Dégradé'], ['trois', 'Dégradé 3 couleurs'], ['radial', 'Projecteur'], ['uni', 'Uni'], ['diagonale', 'Deux tons (diagonale)']]),
    c1: C('Couleur 1'), c2: si(C('Couleur 2'), s => s.type !== 'uni'), c3: si(C('Couleur 3'), s => s.type === 'trois'),
    angle: si(N('Angle', 0, 360, 1, deg), s => ['degrade', 'trois', 'diagonale'].includes(s.type)),
    centreY: si(N('Centre / coupure', 0, 1, 0.01), s => ['trois', 'radial', 'diagonale'].includes(s.type)) } },
  halo: { titre: 'Halo lumineux', champs: {
    actif: B('Afficher'), couleur: C('Couleur'), opacite: N('Intensité', 0, 1, 0.01), taille: N('Taille', 0.1, 1.6, 0.01), y: N('Hauteur', 0, 1, 0.005) } },
  motif: { titre: 'Motif', champs: {
    type: E('Motif', [['aucun', 'Aucun'], ['rayons', 'Rayons'], ['eclats', 'Éclats'], ['trame', 'Trame de points'], ['trame-degrade', 'Points dégradés (BD)'], ['lignes', 'Lignes'],
      ['bandes', 'Bandes sport'], ['carbone', 'Carbone'], ['chevrons', 'Chevrons'], ['losanges', 'Losanges'], ['hexagones', 'Hexagones'], ['cercles', 'Cercles'], ['vagues', 'Vagues'],
      ['etoiles', 'Étoiles'], ['damier-logos', "Damier d'écussons"], ['griffures', 'Griffures']]),
    couleur: C('Couleur'), opacite: N('Intensité', 0, 1, 0.01), taille: N('Taille', 0.01, 0.3, 0.005), angle: N('Angle', -180, 180, 1, deg),
    fondu: E('Fondu', FONDUS), graine: si(N('Tirage', 0, 999, 1, v => Math.round(v)), s => ['griffures', 'etoiles', 'eclats', 'bandes'].includes(s.type)) } },
  filigrane: { titre: 'Écusson en filigrane', champs: {
    actif: B('Afficher'), mode: E('Rendu', MODES), couleur: C('Couleur'), opacite: N('Intensité', 0, 1, 0.01), taille: N('Taille', 0.1, 2.5, 0.01),
    x: N('Horizontal', -0.5, 1.5, 0.005), y: N('Vertical', -0.5, 1.5, 0.005), rotation: N('Rotation', -180, 180, 1, deg) } },
  grandTexte: { titre: 'Grand numéro / initiales', champs: {
    actif: B('Afficher'), contenu: T('Texte'), rendu: E('Rendu', [['plein', 'Plein'], ['contour', 'Contour seul']]), couleur: C('Couleur'), opacite: N('Intensité', 0, 1, 0.01),
    taille: N('Taille', 0.1, 1.4, 0.01), epaisseur: si(N('Épaisseur du contour', 0.001, 0.03, 0.001), s => s.rendu === 'contour'), x: N('Horizontal', -0.2, 1.2, 0.005), y: N('Vertical', -0.2, 1.2, 0.005),
    rotation: N('Rotation', -90, 90, 1, deg) } },
  panthere: { titre: 'Panthère', champs: {
    actif: B('Afficher'), couleur: C('Couleur'), opacite: N('Intensité', 0, 1, 0.01), oeil: C('Œil'), taille: N('Taille', 0.3, 3, 0.01, fois),
    x: N('Horizontal', -0.5, 1.5, 0.005), y: N('Vertical', -0.5, 1, 0.005), miroir: B('Museau vers la gauche'), contour: CO('Contour'), contourEp: si(N('Épaisseur du contour', 0, 0.03, 0.001), s => !!s.contour) } },
  cadre: { titre: 'Cadre', champs: {
    actif: B('Afficher'), style: E('Style', [['trait', 'Liseré'], ['plein', 'Bordure pleine (vignette rétro)']]), forme: E('Forme', [['arrondi', 'Coins arrondis'], ['chanfrein', 'Coins coupés']]),
    couleur: C('Couleur'), epaisseur: N('Épaisseur', 0, 0.06, 0.001), marge: N('Marge', 0, 0.12, 0.001), rayon: N('Arrondi / coupe', 0, 0.15, 0.001),
    double: B('Second liseré'), couleur2: si(C('Couleur du liseré'), s => s.double), devant: B('Devant le joueur') } },
  coins: { titre: 'Coins', champs: {
    actif: B('Afficher'), style: E('Style', [['equerre', 'Équerres'], ['double', 'Doubles équerres'], ['triangle', 'Triangles'], ['point', 'Points']]),
    couleur: C('Couleur'), longueur: N('Longueur', 0.02, 0.4, 0.005), epaisseur: N('Épaisseur', 0.001, 0.03, 0.001), retrait: N('Retrait', 0, 0.2, 0.002) } },
  bandeau: { titre: 'Bandeau', champs: {
    actif: B('Afficher'), position: E('Position', [['bas', 'En bas'], ['haut', 'En haut']]), couleur: C('Couleur'), opacite: N('Intensité', 0, 1, 0.01),
    hauteur: N('Hauteur', 0.02, 0.5, 0.005), pente: N('Pente', -0.3, 0.3, 0.005), devant: B('Devant le joueur') } },
  plaque: { titre: 'Plaque nominative', champs: {
    actif: B('Afficher'), forme: E('Forme', [['rectangle', 'Rectangle'], ['ruban', 'Ruban'], ['onglet', 'Onglet'], ['pilule', 'Pilule'], ['biseau', 'Biseau']]),
    couleur: C('Couleur'), bord: CO('Bordure'), largeur: N('Largeur', 0.2, 1.1, 0.005), hauteur: N('Hauteur', 0.03, 0.3, 0.002), y: N('Vertical', 0, 1, 0.005),
    ligne1: T('Ligne 1'), couleur1: C('Couleur ligne 1'), ligne2: T('Ligne 2'), couleur2: C('Couleur ligne 2'), devant: B('Devant le joueur') } },
  badge: { titre: 'Badge (numéro)', champs: {
    actif: B('Afficher'), forme: E('Forme', [['cercle', 'Cercle'], ['bouclier', 'Bouclier'], ['hexagone', 'Hexagone'], ['losange', 'Losange'], ['carre', 'Carré']]),
    couleur: C('Couleur'), bord: CO('Bordure'), contenu: T('Texte'), texteCouleur: C('Couleur du texte'), taille: N('Taille', 0.05, 0.35, 0.005),
    x: N('Horizontal', 0, 1, 0.005), y: N('Vertical', 0, 1, 0.005), devant: B('Devant le joueur') } },
  logo: { titre: 'Logo', champs: {
    actif: B('Afficher'), mode: E('Rendu', MODES), couleur: si(C('Couleur (rendus teintés)'), s => s.mode !== 'couleur'), taille: N('Taille', 0.03, 0.8, 0.005),
    x: N('Horizontal', 0, 1, 0.005), y: N('Vertical', 0, 1, 0.005), opacite: N('Intensité', 0, 1, 0.01), ombre: B('Ombre portée'), devant: B('Devant le joueur') } },
  texte: { titre: 'Texte libre', champs: {
    actif: B('Afficher'), contenu: T('Texte'), couleur: C('Couleur'), contour: CO('Contour'), taille: N('Taille', 0.02, 0.2, 0.001),
    x: N('Horizontal', 0, 1, 0.005), y: N('Vertical', 0, 1, 0.005), rotation: N('Rotation', -90, 90, 1, deg), opacite: N('Intensité', 0, 1, 0.01),
    majuscules: B('Majuscules'), devant: B('Devant le joueur') } },
  contourJoueur: { titre: 'Contour du joueur (autocollant)', champs: {
    actif: B('Afficher'), couleur: C('Couleur'), epaisseur: N('Épaisseur', 0, 0.03, 0.001), lueur: CO('Lueur'), lueurTaille: si(N('Taille de la lueur', 0, 0.08, 0.002), s => !!s.lueur) } },
  holo: { titre: 'Effet holographique', champs: {
    actif: B('Afficher'), opacite: N('Intensité', 0, 0.8, 0.01), angle: N('Angle', -90, 90, 1, deg), taille: N('Largeur des reflets', 0.05, 1, 0.01) } },
  effets: { titre: 'Effets', champs: { vignette: N('Vignettage', 0, 1, 0.01), grain: N('Grain', 0, 0.3, 0.005) } },
};

/** Le modèle 108 « Carte écusson », élément par élément (les nouveaux éléments sont éteints). */
export const CARTE_DEFAUT = {
  fond: { type: 'degrade', c1: '#1E1E22', c2: '#0A0A0B', c3: '#FDF103', angle: 180, centreY: 0.3 },
  halo: { actif: false, couleur: '#FDF103', opacite: 0.35, taille: 0.7, y: 0.28 },
  motif: { type: 'aucun', couleur: '#FDF103', opacite: 0.1, taille: 0.06, angle: 45, fondu: 'aucun', graine: 1 },
  filigrane: { actif: true, mode: 'clair', couleur: '#FDF103', opacite: 0.1, taille: 0.9, x: 0.5, y: 0.271, rotation: 0 },
  grandTexte: { actif: false, contenu: '{numero}', rendu: 'contour', couleur: '#FDF103', opacite: 0.35, taille: 0.75, epaisseur: 0.006, x: 0.5, y: 0.33, rotation: 0 },
  panthere: { actif: false, couleur: '#0A0A0B', opacite: 1, oeil: '#FDF103', taille: 1.1, x: 1, y: 0.03, miroir: true, contour: '', contourEp: 0.008 },
  cadre: { actif: true, style: 'trait', forme: 'arrondi', couleur: '#FDF103', epaisseur: 0.022, marge: 0.028, rayon: 0.018, double: false, couleur2: '#FDF103', devant: false },
  coins: { actif: true, style: 'equerre', couleur: '#FDF103', longueur: 0.12, epaisseur: 0.006, retrait: 0.048 },
  bandeau: { actif: false, position: 'bas', couleur: '#0A0A0B', opacite: 0.92, hauteur: 0.19, pente: 0.05, devant: false },
  plaque: { actif: false, forme: 'rectangle', couleur: '#FDF103', bord: '', largeur: 0.8, hauteur: 0.1, y: 0.9, ligne1: '{nom}', couleur1: '#0A0A0B', ligne2: '{poste}', couleur2: '#0A0A0B', devant: true },
  badge: { actif: false, forme: 'cercle', couleur: '#FDF103', bord: '#0A0A0B', contenu: '{numero}', texteCouleur: '#0A0A0B', taille: 0.13, x: 0.15, y: 0.1, devant: true },
  logo: { actif: true, mode: 'couleur', couleur: '#FDF103', taille: 0.17, x: 0.86, y: 0.107, opacite: 1, ombre: false, devant: false },
  texte: { actif: false, contenu: 'Saison 2026-2027', couleur: '#FDF103', contour: '', taille: 0.04, x: 0.5, y: 0.05, rotation: 0, opacite: 1, majuscules: true, devant: true },
  contourJoueur: { actif: false, couleur: '#F5F5F4', epaisseur: 0.008, lueur: '', lueurTaille: 0.03 },
  holo: { actif: false, opacite: 0.25, angle: 30, taille: 0.35 },
  effets: { vignette: 0.3, grain: 0.05 },
};

const clone = o => JSON.parse(JSON.stringify(o));

/**
 * Configuration complète et sûre à partir de n'importe quel objet (stockage local, fichier importé,
 * ancienne version) : chaque valeur absente, du mauvais type ou hors plage reprend celle du 108.
 */
export function normaliser(cfg) {
  const src = cfg && typeof cfg === 'object' ? cfg : {}, o = {};
  for (const [sec, { champs }] of Object.entries(SPEC)) {
    const s = src[sec] && typeof src[sec] === 'object' ? src[sec] : {}, d = CARTE_DEFAUT[sec], r = (o[sec] = {});
    for (const [k, f] of Object.entries(champs)) {
      const v = s[k];
      if (f.t === 'num') r[k] = typeof v === 'number' && Number.isFinite(v) ? Math.min(f.max, Math.max(f.min, v)) : d[k];
      else if (f.t === 'color') r[k] = typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : d[k];
      else if (f.t === 'colorOpt') r[k] = v === '' ? '' : typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : d[k];
      else if (f.t === 'bool') r[k] = typeof v === 'boolean' ? v : d[k];
      else if (f.t === 'enum') r[k] = f.options.some(([x]) => x === v) ? v : d[k];
      else r[k] = typeof v === 'string' ? v.slice(0, 80) : d[k];
    }
  }
  return o;
}

/* ------------------------------------------------------------------ textes */
/**
 * Champs d'une photo à partir de son nom de fichier (sans extension) :
 * « 10 - Léa Martin (Gardienne) » → { numero: '10', nom: 'Léa Martin', poste: 'Gardienne' }.
 */
export function champsPhoto(nomFichier) {
  let s = String(nomFichier || '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(), numero = '', poste = '';
  let m = s.match(/^#?(\d{1,3})\s*[-–._ ]\s*(.+)$/);
  if (m) { numero = m[1]; s = m[2].trim(); }
  m = s.match(/^(.*?)\s*[([]([^)\]]+)[)\]]\s*$/);
  if (m) { s = m[1].trim(); poste = m[2].trim(); }
  return { nom: s, numero, poste };
}
const EXEMPLE = { nom: 'Prénom Nom', numero: '10', poste: 'Arrière gauche' };
function remplir(modele, ch) {
  return modele.replace(/\{(nom|numero|poste)\}/g, (_, k) => (ch ? ch[k] : EXEMPLE[k]) || '').replace(/\s+/g, ' ').trim();
}
/** La carte affiche-t-elle des champs propres à chaque photo ? */
export function dependDeLaPhoto(c) {
  const a = s => /\{(nom|numero|poste)\}/.test(s);
  return (c.texte.actif && a(c.texte.contenu)) || (c.grandTexte.actif && a(c.grandTexte.contenu)) || (c.badge.actif && a(c.badge.contenu))
    || (c.plaque.actif && (a(c.plaque.ligne1) || a(c.plaque.ligne2)));
}

/* ------------------------------------------------------------------ ressources */
/** Logo recoloré (mode clair / sombre / silhouette), mis en cache par couleur. */
const teintes = new WeakMap();
export function logoTeinte(logo, mode, couleur) {
  if (!logo || mode === 'couleur') return logo;
  let m = teintes.get(logo); if (!m) teintes.set(logo, m = new Map());
  const key = mode + couleur;
  if (m.has(key)) { const v = m.get(key); m.delete(key); m.set(key, v); return v; }   // LRU
  while (m.size >= 6) { const [k0, v0] = m.entries().next().value; m.delete(k0); libere(v0); }
  const w = logo.naturalWidth || logo.width, h = logo.naturalHeight || logo.height;
  const c = mkCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(logo, 0, 0, w, h);
  const im = x.getImageData(0, 0, w, h), d = im.data;
  const [r, g, b] = rgb(couleur);
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    const a = d[i + 3] / 255 * (mode === 'clair' ? l : mode === 'sombre' ? 1 - l : 1);
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(255 * a);
  }
  x.putImageData(im, 0, 0);
  m.set(key, c);
  return c;
}
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgba = (h, a) => `rgba(${rgb(h).join(',')},${a})`;

let grainTuile = null;
function grain() {
  if (grainTuile) return grainTuile;
  const n = 256, c = mkCanvas(n, n), x = c.getContext('2d'), im = x.createImageData(n, n);
  const r = alea(7);
  for (let i = 0; i < im.data.length; i += 4) { im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.floor(r() * 160); }
  x.putImageData(im, 0, 0);
  return (grainTuile = c);
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function libere(c) { c.width = 0; c.height = 0; }

/** Générateur pseudo-aléatoire déterministe (mêmes griffures, étoiles… pour une même graine). */
export function alea(seed) {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* ------------------------------------------------------------------ panthère */
// Panthère redessinée (interprétation vectorielle du logo, à valider par le club) : repère natif,
// tête x 62..796, y 48..548, museau à droite ; cou prolongé vers le bas à gauche.
const P_SIL = [[62, 126], [300, 86], [540, 48], [562, 56], [566, 80], [790, 96], [796, 122], [766, 290], [724, 298], [694, 384], [678, 304], [560, 314],
  [505, 335], [478, 372], [482, 408], [515, 440], [552, 470], [592, 448], [612, 438], [600, 472], [578, 500], [520, 548], [440, 500], [300, 610], [140, 900], [-400, 900], [-400, 360]];
const P_EYE = [[425, 202], [442, 168], [482, 146], [548, 134], [522, 150], [472, 164], [442, 192]];
const P_BROW = [[483, 98], [537, 104], [523, 121], [492, 118]];

/* ------------------------------------------------------------------ dessin */
/**
 * Dessine une couche de la carte. `couche` : 'arriere' (sous le joueur) ou 'avant' (par-dessus :
 * éléments « devant » et effet holographique). `res` = { logo } ; `photo` = nom de fichier de la
 * photo (champs {nom}, {numero}, {poste}) ou null pour un aperçu.
 */
export function dessinerCarte(ctx, W, H, c, res = {}, couche = 'arriere', photo = null) {
  const u = W / 1000, av = couche === 'avant', ch = photo == null ? null : champsPhoto(photo);
  ctx.save();
  if (!av) {
    fond(ctx, W, H, c.fond);
    if (c.halo.actif && c.halo.opacite > 0) halo(ctx, W, H, c.halo);
    if (c.motif.type !== 'aucun' && c.motif.opacite > 0) motif(ctx, W, H, u, c.motif, res);
    if (c.filigrane.actif && res.logo) logoA(ctx, res.logo, c.filigrane.mode, c.filigrane.couleur, c.filigrane.x * W, c.filigrane.y * H, c.filigrane.taille * W, c.filigrane.opacite, c.filigrane.rotation);
    if (c.grandTexte.actif) grandTexte(ctx, W, H, c.grandTexte, ch);
    if (c.panthere.actif) panthere(ctx, W, u, c.panthere);
    if (c.effets.vignette > 0) vignette(ctx, W, H, c.effets.vignette);
    if (c.effets.grain > 0) { ctx.save(); ctx.globalAlpha = c.effets.grain; ctx.fillStyle = ctx.createPattern(grain(), 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }
  if (c.bandeau.actif && c.bandeau.devant === av) bandeau(ctx, W, H, c.bandeau);
  if (c.cadre.actif && c.cadre.devant === av) { cadre(ctx, W, H, u, c.cadre); if (c.coins.actif) coins(ctx, W, H, c.cadre, c.coins); }
  if (c.plaque.actif && c.plaque.devant === av) plaque(ctx, W, H, u, c.plaque, ch);
  if (c.badge.actif && c.badge.devant === av) badge(ctx, W, H, u, c.badge, ch);
  if (c.logo.actif && c.logo.devant === av && res.logo) {
    if (c.logo.ombre) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 6 * u; }
    logoA(ctx, res.logo, c.logo.mode, c.logo.couleur, c.logo.x * W, c.logo.y * H, c.logo.taille * W, c.logo.opacite, 0);
    if (c.logo.ombre) ctx.restore();
  }
  if (c.texte.actif && c.texte.devant === av) ecrire(ctx, W, H, c.texte, ch);
  if (av && c.holo.actif && c.holo.opacite > 0) holo(ctx, W, H, c.holo);
  ctx.restore();
}

/**
 * Contour « autocollant » et lueur autour du joueur. `calque` = canvas W×H contenant le joueur
 * détouré seul ; dessine le contour (sous le joueur) dans ctx.
 */
export function contourJoueur(ctx, calque, W, H, c) {
  const k = c.contourJoueur; if (!k.actif) return;
  const e = k.epaisseur * W, g = k.lueur ? k.lueurTaille * W : 0;
  if (e <= 0 && g <= 0) return;
  const plein = mkCanvas(W, H), x = plein.getContext('2d');
  x.drawImage(calque, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = k.couleur; x.fillRect(0, 0, W, H);
  ctx.save();
  if (g > 0) {
    const lu = mkCanvas(W, H), y = lu.getContext('2d');
    y.drawImage(calque, 0, 0); y.globalCompositeOperation = 'source-in'; y.fillStyle = k.lueur; y.fillRect(0, 0, W, H);
    // ombre portée sans décalage = flou supporté partout (ctx.filter manque sur Safari < 18)
    // (calque neuf, transformation identité : le décalage d'ombre n'est pas transformé)
    const fl = mkCanvas(W, H), z = fl.getContext('2d');
    z.shadowColor = k.lueur; z.shadowBlur = g; z.shadowOffsetX = W * 4;
    z.drawImage(lu, -W * 4, 0);
    ctx.drawImage(fl, 0, 0); ctx.drawImage(fl, 0, 0); libere(fl); libere(lu);
  }
  if (e > 0) { const n = 16; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; ctx.drawImage(plein, Math.cos(a) * e, Math.sin(a) * e); } }
  ctx.restore(); libere(plein);
}

function fond(ctx, W, H, f) {
  if (f.type === 'uni') { ctx.fillStyle = f.c1; ctx.fillRect(0, 0, W, H); return; }
  if (f.type === 'diagonale') {
    // deux aplats séparés par une diagonale (angle = inclinaison de la frontière)
    ctx.fillStyle = f.c2; ctx.fillRect(0, 0, W, H);
    const t = Math.tan((f.angle - 90) * Math.PI / 180), y0 = f.centreY * H;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, y0 + t * W / 2); ctx.lineTo(0, y0 - t * W / 2); ctx.closePath();
    ctx.fillStyle = f.c1; ctx.fill(); return;
  }
  let g;
  if (f.type === 'radial') {
    const cy = f.centreY * H;
    g = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, Math.hypot(W, Math.max(cy, H - cy)) * 0.8);
    g.addColorStop(0, f.c1); g.addColorStop(1, f.c2);
  } else {
    const a = f.angle * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), L = (Math.abs(dx) * W + Math.abs(dy) * H) / 2;
    g = ctx.createLinearGradient(W / 2 - dx * L, H / 2 - dy * L, W / 2 + dx * L, H / 2 + dy * L);   // comme en CSS : 180° = c1 en haut
    g.addColorStop(0, f.c1);
    if (f.type === 'trois') g.addColorStop(f.centreY, f.c2), g.addColorStop(1, f.c3); else g.addColorStop(1, f.c2);
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function halo(ctx, W, H, h) {
  const r = h.taille * W, cy = h.y * H, g = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, r);
  g.addColorStop(0, rgba(h.couleur, h.opacite)); g.addColorStop(0.45, rgba(h.couleur, h.opacite * 0.4)); g.addColorStop(1, rgba(h.couleur, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function vignette(ctx, W, H, op) {
  // dégradé elliptique (rayons 0,85 W et 0,85 H), comme le radialGradient du SVG d'origine
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.85);
  g.addColorStop(0, 'rgba(10,10,11,0)'); g.addColorStop(0.65, 'rgba(10,10,11,0)'); g.addColorStop(1, `rgba(10,10,11,${op})`);
  ctx.save(); ctx.translate(W / 2, 0.45 * H); ctx.scale(W, H); ctx.fillStyle = g; ctx.fillRect(-0.5, -0.45, 1, 1); ctx.restore();
}

function logoA(ctx, logo, mode, couleur, cx, cy, size, op, rot) {
  const img = logoTeinte(logo, mode, couleur);
  const lw = logo.naturalWidth || logo.width, lh = logo.naturalHeight || logo.height, h = size * lh / lw;
  ctx.save(); ctx.globalAlpha *= op; ctx.translate(cx, cy); if (rot) ctx.rotate(rot * Math.PI / 180);
  ctx.drawImage(img, -size / 2, -h / 2, size, h);
  ctx.restore();
}

function chemin(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
const POLICE = '"Archivo Black", "Arial Black", Impact, sans-serif';

function grandTexte(ctx, W, H, g, ch) {
  const s = remplir(g.contenu, ch).toLocaleUpperCase('fr-FR'); if (!s) return;
  const size = g.taille * W;
  ctx.save(); ctx.globalAlpha = g.opacite; ctx.translate(g.x * W, g.y * H); if (g.rotation) ctx.rotate(g.rotation * Math.PI / 180);
  ctx.font = `900 ${size}px ${POLICE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const mw = ctx.measureText(s).width, max = 0.96 * W; if (mw > max) ctx.scale(max / mw, max / mw);
  if (g.rendu === 'contour') { ctx.lineWidth = g.epaisseur * W; ctx.strokeStyle = g.couleur; ctx.lineJoin = 'round'; ctx.strokeText(s, 0, 0); }
  else { ctx.fillStyle = g.couleur; ctx.fillText(s, 0, 0); }
  ctx.restore();
}

function panthere(ctx, W, u, p) {
  ctx.save();
  // (x, y) = point d'ancrage du repère natif, en fraction de la largeur
  if (p.miroir) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  const ax = p.miroir ? (1 - p.x) : p.x;
  ctx.translate(ax * W - 398 * u * (p.taille / 1.1), p.y * W + 13 * u);
  ctx.scale(p.taille * u, p.taille * u);
  chemin(ctx, P_SIL);
  ctx.globalAlpha = p.opacite; ctx.fillStyle = p.couleur; ctx.fill();
  if (p.contour && p.contourEp > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = p.contour; ctx.lineWidth = p.contourEp * 1000 / p.taille; ctx.lineJoin = 'miter'; ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.fillStyle = p.oeil;
  chemin(ctx, P_EYE); ctx.fill(); chemin(ctx, P_BROW); ctx.fill();
  ctx.restore();
}

/** Rectangle à coins arrondis ou coupés. */
function forme(ctx, x, y, w, h, r, coupe = false, neuf = true) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (neuf) ctx.beginPath();
  if (coupe) { ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.lineTo(x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.lineTo(x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.lineTo(x, y + h - r); ctx.lineTo(x, y + r); }
  else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); }
  ctx.closePath();
}

function cadre(ctx, W, H, u, f) {
  const m = f.marge * W, e = f.epaisseur * W, coupe = f.forme === 'chanfrein', r = f.rayon * W;
  if (f.style === 'plein' && e > 0) {
    // bordure pleine de la tranche de la carte jusqu'à l'intérieur du cadre (vignette rétro)
    const i = m + e / 2;
    ctx.save(); ctx.fillStyle = f.couleur; ctx.beginPath(); ctx.rect(0, 0, W, H);
    forme(ctx, i, i, W - 2 * i, H - 2 * i, r, coupe, false); ctx.fill('evenodd'); ctx.restore();
  } else if (e > 0) { ctx.strokeStyle = f.couleur; ctx.lineWidth = e; forme(ctx, m, m, W - 2 * m, H - 2 * m, r, coupe); ctx.stroke(); }
  if (f.double) {
    const m2 = m + e / 2 + 14 * u;
    ctx.save(); ctx.globalAlpha = 0.8; ctx.strokeStyle = f.couleur2; ctx.lineWidth = Math.max(1, 3 * u);
    forme(ctx, m2, m2, W - 2 * m2, H - 2 * m2, Math.max(0, r - 6 * u), coupe); ctx.stroke(); ctx.restore();
  }
}

function coins(ctx, W, H, f, k) {
  const m = f.marge * W, L = k.longueur * W, r = k.retrait * W, ep = k.epaisseur * W;
  ctx.save(); ctx.strokeStyle = ctx.fillStyle = k.couleur; ctx.lineWidth = ep; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    const ox = x + sx * r, oy = y + sy * r;
    if (k.style === 'triangle') { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sx * L, y); ctx.lineTo(x, y + sy * L); ctx.closePath(); ctx.fill(); }
    else if (k.style === 'point') { ctx.beginPath(); ctx.arc(ox, oy, Math.max(ep, L / 10), 0, Math.PI * 2); ctx.fill(); }
    else {
      ctx.beginPath(); ctx.moveTo(x + sx * L, oy); ctx.lineTo(ox, oy); ctx.lineTo(ox, y + sy * L); ctx.stroke();
      if (k.style === 'double') { const o2 = r + ep * 2.5; ctx.beginPath(); ctx.moveTo(x + sx * L * 0.7, y + sy * o2); ctx.lineTo(x + sx * o2, y + sy * o2); ctx.lineTo(x + sx * o2, y + sy * L * 0.7); ctx.stroke(); }
    }
  }
  ctx.restore();
}

function bandeau(ctx, W, H, b) {
  const h = b.hauteur * H, p = b.pente * H;
  ctx.save(); ctx.globalAlpha = b.opacite; ctx.fillStyle = b.couleur; ctx.beginPath();
  if (b.position === 'bas') { ctx.moveTo(0, H - h + Math.max(0, p)); ctx.lineTo(W, H - h + Math.max(0, -p)); ctx.lineTo(W, H); ctx.lineTo(0, H); }
  else { ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, h - Math.max(0, p)); ctx.lineTo(0, h - Math.max(0, -p)); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

/** Une ligne de texte centrée, réduite pour tenir dans `max`. */
function ligne(ctx, s, x, y, size, max, couleur, contour = '', epc = 0) {
  if (!s) return;
  ctx.save(); ctx.translate(x, y); ctx.font = `900 ${size}px ${POLICE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const mw = ctx.measureText(s).width; if (mw > max) ctx.scale(max / mw, max / mw);
  if (contour) { ctx.lineWidth = epc; ctx.strokeStyle = contour; ctx.lineJoin = 'round'; ctx.strokeText(s, 0, 0); }
  ctx.fillStyle = couleur; ctx.fillText(s, 0, 0); ctx.restore();
}

function plaque(ctx, W, H, u, p, ch) {
  const w = p.largeur * W, h = p.hauteur * W, cx = W / 2, cy = p.y * H, x = cx - w / 2, y = cy - h / 2;
  ctx.save(); ctx.beginPath();
  switch (p.forme) {
    case 'ruban': { const q = h * 0.45; ctx.moveTo(x - q, y); ctx.lineTo(x + w + q, y); ctx.lineTo(x + w, cy); ctx.lineTo(x + w + q, y + h); ctx.lineTo(x - q, y + h); ctx.lineTo(x, cy); ctx.closePath(); break; }
    case 'onglet': { const q = h * 0.5; ctx.moveTo(x + q, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - q, y + h); ctx.lineTo(x, y + h); ctx.closePath(); break; }
    case 'pilule': forme(ctx, x, y, w, h, h / 2); break;
    case 'biseau': forme(ctx, x, y, w, h, h * 0.35, true); break;
    default: ctx.rect(x, y, w, h);
  }
  ctx.fillStyle = p.couleur; ctx.fill();
  if (p.bord) { ctx.lineWidth = Math.max(1, 5 * u); ctx.strokeStyle = p.bord; ctx.stroke(); }
  ctx.restore();
  const l1 = remplir(p.ligne1, ch).toLocaleUpperCase('fr-FR'), l2 = remplir(p.ligne2, ch).toLocaleUpperCase('fr-FR');
  if (l1 && l2) { ligne(ctx, l1, cx, cy - h * 0.14, h * 0.42, w * 0.9, p.couleur1); ligne(ctx, l2, cx, cy + h * 0.27, h * 0.22, w * 0.85, p.couleur2); }
  else ligne(ctx, l1 || l2, cx, cy + h * 0.02, h * 0.5, w * 0.9, l1 ? p.couleur1 : p.couleur2);
}

function badge(ctx, W, H, u, b, ch) {
  const s = remplir(b.contenu, ch).toLocaleUpperCase('fr-FR');
  if (!s && /\{/.test(b.contenu)) return;   // champ absent du nom de la photo : pas de badge vide
  const r = b.taille * W / 2, cx = b.x * W, cy = b.y * H;
  ctx.save(); ctx.beginPath();
  if (b.forme === 'cercle') ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else if (b.forme === 'hexagone') { for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } ctx.closePath(); }
  else if (b.forme === 'losange') { ctx.moveTo(cx, cy - r * 1.15); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r * 1.15); ctx.lineTo(cx - r, cy); ctx.closePath(); }
  else if (b.forme === 'bouclier') { ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy - r); ctx.lineTo(cx + r, cy + r * 0.1); ctx.quadraticCurveTo(cx + r * 0.9, cy + r * 0.85, cx, cy + r * 1.2); ctx.quadraticCurveTo(cx - r * 0.9, cy + r * 0.85, cx - r, cy + r * 0.1); ctx.closePath(); }
  else forme(ctx, cx - r, cy - r, 2 * r, 2 * r, r * 0.18);
  ctx.fillStyle = b.couleur; ctx.fill();
  if (b.bord) { ctx.lineWidth = Math.max(1, r * 0.1); ctx.strokeStyle = b.bord; ctx.stroke(); }
  ctx.restore();
  ligne(ctx, s, cx, cy + r * 0.04, r * (s.length > 2 ? 0.8 : 1.05), r * 1.6, b.texteCouleur);
}

function ecrire(ctx, W, H, t, ch) {
  let s = remplir(t.contenu, ch);
  if (t.majuscules) s = s.toLocaleUpperCase('fr-FR');
  if (!s) return;
  const size = t.taille * W;
  ctx.save(); ctx.globalAlpha = t.opacite; ctx.translate(t.x * W, t.y * H); if (t.rotation) ctx.rotate(t.rotation * Math.PI / 180);
  ligne(ctx, s, 0, 0, size, 0.88 * W, t.couleur, t.contour, size * 0.08);
  ctx.restore();
}

function holo(ctx, W, H, h) {
  // reflets irisés en bandes obliques (rendu « carte holographique »), en lumière douce
  const a = h.angle * Math.PI / 180, L = Math.hypot(W, H), dx = Math.cos(a), dy = Math.sin(a);
  const g = ctx.createLinearGradient(W / 2 - dx * L / 2, H / 2 - dy * L / 2, W / 2 + dx * L / 2, H / 2 + dy * L / 2);
  const teintes = ['#ff3b3b', '#ffd23b', '#3bff7a', '#3bd5ff', '#7a3bff', '#ff3bd5'], n = Math.max(1, Math.round(1 / h.taille));
  for (let i = 0; i <= n * teintes.length; i++) g.addColorStop(i / (n * teintes.length), teintes[i % teintes.length]);
  ctx.save(); ctx.globalAlpha = h.opacite; ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = h.opacite * 0.35;
  const s = ctx.createLinearGradient(0, 0, W, H); s.addColorStop(0.35, 'rgba(255,255,255,0)'); s.addColorStop(0.5, 'rgba(255,255,255,.9)'); s.addColorStop(0.65, 'rgba(255,255,255,0)');
  ctx.fillStyle = s; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ------------------------------------------------------------------ motifs */
/** Pas minimal d'une grille : au plus ~40 000 éléments (curseur au minimum, JSON importé). */
function pasMin(p, W, H, R, max = 40000) { return Math.max(p, Math.sqrt((2 * R + W) * (2 * R + H) / max)); }
function motif(ctx, W, H, u, m, res) {
  // dessiné sur un calque pour appliquer le fondu
  const Lc = mkCanvas(W, H), x = Lc.getContext('2d');
  x.fillStyle = x.strokeStyle = m.couleur;
  const t = m.taille * W, a = m.angle * Math.PI / 180, R = Math.hypot(W, H), rnd = alea(m.graine + 1);
  const tourne = () => { x.translate(W / 2, H / 2); x.rotate(a); x.translate(-W / 2, -H / 2); };
  const cx = W / 2, cy = 0.236 * H;   // tête du joueur
  switch (m.type) {
    case 'rayons': case 'eclats': {
      const n = Math.max(6, Math.round(0.6 / m.taille));
      x.beginPath();
      for (let i = 0; i < n; i++) {
        const b = 2 * Math.PI * i / n + a, lg = m.type === 'eclats' ? R * (0.3 + 0.7 * rnd()) : R, ouv = m.type === 'eclats' ? Math.PI / n * (0.15 + 0.5 * rnd()) : Math.PI / n;
        x.moveTo(cx, cy); x.lineTo(cx + lg * Math.cos(b), cy + lg * Math.sin(b)); x.lineTo(cx + lg * Math.cos(b + ouv), cy + lg * Math.sin(b + ouv)); x.closePath();
      }
      x.fill(); break;
    }
    case 'trame': {
      tourne(); const p = pasMin(Math.max(4, t * 0.33), W, H, R), r = p * 0.3;
      for (let yy = -R; yy < R + H; yy += p) for (let xx = -R; xx < R + W; xx += p) { x.beginPath(); x.arc(xx, yy, r, 0, 7); x.fill(); }
      break;
    }
    case 'trame-degrade': {
      // points de plus en plus gros vers le bas (trame de bande dessinée)
      tourne(); const p = pasMin(Math.max(5, t * 0.4), W, H, R);
      for (let yy = -R; yy < R + H; yy += p) {
        const k = Math.min(1, Math.max(0, yy / H)), r = p * 0.5 * (0.08 + 0.92 * k);
        for (let xx = -R + ((yy / p) % 2 ? p / 2 : 0); xx < R + W; xx += p) { x.beginPath(); x.arc(xx, yy, r, 0, 7); x.fill(); }
      }
      break;
    }
    case 'lignes': case 'carbone': {
      tourne(); const p = m.type === 'carbone' ? Math.max(3, t * 0.12) : Math.max(4, t * 0.5), lw = m.type === 'carbone' ? p * 0.45 : Math.max(1, p * 0.25);
      for (let xx = -R; xx < R + W; xx += p) x.fillRect(xx, -R, lw, 2 * R + H);
      break;
    }
    case 'bandes': {
      // trois larges bandes obliques de largeurs variées (maillot, banderole)
      tourne(); const base = W * (0.15 + 0.5 * rnd());
      [[0, 1], [1.25, 0.45], [1.9, 0.22]].forEach(([o, l]) => x.fillRect(base + o * t * 3, -R, l * t * 3, 2 * R + H));
      break;
    }
    case 'chevrons': {
      tourne(); const p = pasMin(Math.max(8, t), W, H, R, 20000), lw = p * 0.28; x.lineWidth = lw;
      for (let yy = -R; yy < R + H; yy += p) { x.beginPath(); for (let xx = -R; xx < R + W; xx += p) { x.lineTo(xx, yy); x.lineTo(xx + p / 2, yy + p / 2); } x.stroke(); }
      break;
    }
    case 'vagues': {
      tourne(); const p = Math.max(8, t * 0.7, (2 * R + H) / 150); x.lineWidth = Math.max(1, p * 0.18);
      for (let yy = -R; yy < R + H; yy += p) { x.beginPath(); for (let xx = -R; xx < R + W; xx += 8 * u + 1) x.lineTo(xx, yy + Math.sin(xx / (p * 1.6)) * p * 0.35); x.stroke(); }
      break;
    }
    case 'etoiles': {
      const n = Math.round(40 + 3 / m.taille);
      for (let i = 0; i < n; i++) {
        const sx = rnd() * W, sy = rnd() * H, r = t * (0.1 + 0.5 * rnd() ** 2);
        x.save(); x.translate(sx, sy); x.rotate(a + rnd()); x.beginPath();
        for (let j = 0; j < 8; j++) { const rr = j % 2 ? r * 0.25 : r; x.lineTo(rr * Math.cos(j * Math.PI / 4), rr * Math.sin(j * Math.PI / 4)); }
        x.closePath(); x.fill(); x.restore();
      }
      break;
    }
    case 'losanges': {
      tourne(); const p = pasMin(Math.max(8, t), W, H, R, 10000), h = p * 0.5;   // cellule p × p/2
      for (let yy = -R, k = 0; yy < R + H; yy += h, k++) for (let xx = -R + (k % 2) * p / 2; xx < R + W; xx += p) { x.beginPath(); x.moveTo(xx, yy - h * 0.45); x.lineTo(xx + p * 0.22, yy); x.lineTo(xx, yy + h * 0.45); x.lineTo(xx - p * 0.22, yy); x.closePath(); x.fill(); }
      break;
    }
    case 'cercles': {
      const p = Math.max(6, t * 0.6); x.lineWidth = Math.max(1, p * 0.22);
      for (let r = p; r < R; r += p) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); }
      break;
    }
    case 'hexagones': {
      tourne(); const r = pasMin(Math.max(6, t * 0.5), W, H, R), w = Math.sqrt(3) * r; x.lineWidth = Math.max(1, r * 0.08);
      for (let yy = -R, k = 0; yy < R + H; yy += 1.5 * r, k++) for (let xx = -R + (k % 2) * w / 2; xx < R + W; xx += w) {
        x.beginPath(); for (let i = 0; i < 6; i++) { const b = Math.PI / 6 + i * Math.PI / 3; x.lineTo(xx + r * Math.cos(b), yy + r * Math.sin(b)); } x.closePath(); x.stroke();
      }
      break;
    }
    case 'damier-logos': {
      if (!res.logo) break;
      const img = logoTeinte(res.logo, 'silhouette', m.couleur), p = pasMin(Math.max(16, t * 2), W, H, R, 3000);
      tourne();
      for (let yy = -R, k = 0; yy < R + H; yy += p, k++) for (let xx = -R + (k % 2) * p / 2; xx < R + W; xx += p) x.drawImage(img, xx - p * 0.35, yy - p * 0.35, p * 0.7, p * 0.7);
      break;
    }
    case 'griffures': {
      const n = 3, ecart = t * 1.4, w = t * 1.1;
      const gx = W * (0.25 + 0.5 * rnd()), gy = H * (0.18 + 0.2 * rnd());
      const dir = a + Math.PI / 2, L = 0.9 * W, dx = Math.cos(dir) * L, dy = Math.sin(dir) * L, nx = -Math.sin(dir), ny = Math.cos(dir);
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * ecart, dec = (i - 1) * 0.03 * L;
        const x0 = gx - dx / 2 + nx * o + Math.cos(dir) * dec, y0 = gy - dy / 2 + ny * o + Math.sin(dir) * dec;
        griffe(x, x0, y0, x0 + dx, y0 + dy, w * (1 - Math.abs(i - 1) * 0.18), rnd);
      }
      break;
    }
  }
  if (m.fondu !== 'aucun') {
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-in';
    let g;
    if (m.fondu === 'centre') { g = x.createRadialGradient(W / 2, 0.3 * H, 0, W / 2, 0.3 * H, 0.75 * H); g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    else if (m.fondu === 'bords') { g = x.createRadialGradient(W / 2, 0.4 * H, 0.2 * H, W / 2, 0.4 * H, 0.8 * H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); }
    else { g = x.createLinearGradient(0, 0, 0, H); const hh = m.fondu === 'haut'; g.addColorStop(0, hh ? '#000' : 'rgba(0,0,0,0)'); g.addColorStop(1, hh ? 'rgba(0,0,0,0)' : '#000'); }
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  ctx.save(); ctx.globalAlpha = m.opacite; ctx.drawImage(Lc, 0, 0); ctx.restore();
  libere(Lc);
}

/** Une griffure : trait effilé, légèrement courbe, bords déchiquetés. */
function griffe(x, x0, y0, x1, y1, w, rnd, n = 40) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, courbe = 0.1, dent = 0.25;
  const g = [], d = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, prof = Math.sin(Math.PI * t) ** 0.7 * (1 - 0.35 * t);
    const bx = x0 + dx * t + nx * courbe * L * Math.sin(Math.PI * t), by = y0 + dy * t + ny * courbe * L * Math.sin(Math.PI * t), e = w / 2 * prof;
    const j1 = 1 + (rnd() * 2 - 1) * dent, j2 = 1 + (rnd() * 2 - 1) * dent;
    g.push([bx + nx * e * j1, by + ny * e * j1]); d.push([bx - nx * e * j2, by - ny * e * j2]);
  }
  chemin(x, g.concat(d.reverse())); x.fill();
}

/* ------------------------------------------------------------------ modèles générés */
// Palettes aux couleurs du club (+ quelques déclinaisons : or, acier, nuit, crème rétro).
// [nom, fond 1, fond 2, accent (cadre, plaque…), filigrane, encre (texte sur l'accent)]
const PALETTES = [
  ['noir & jaune', '#1E1E22', '#0A0A0B', '#FDF103', '#FDF103', '#0A0A0B'],
  ['carbone & jaune', '#2B2B31', '#101012', '#FDF103', '#FDF103', '#0A0A0B'],
  ['jaune & noir', '#FEF75C', '#E6D200', '#0A0A0B', '#0A0A0B', '#FDF103'],
  ['noir & blanc', '#26262B', '#0A0A0B', '#F5F5F4', '#F5F5F4', '#0A0A0B'],
  ['blanc & jaune', '#FFFFFF', '#DEDEDA', '#E6D200', '#0A0A0B', '#0A0A0B'],
  ['noir & or', '#1C1A14', '#0A0A0B', '#D4AF37', '#D4AF37', '#0A0A0B'],
  ['acier & jaune', '#5B6270', '#1E1E22', '#FDF103', '#F5F5F4', '#0A0A0B'],
  ['nuit & jaune', '#16213A', '#0A0A0B', '#FDF103', '#FDF103', '#0A0A0B'],
  ['jaune vif & noir', '#FDF103', '#FDF103', '#0A0A0B', '#FFFFFF', '#FDF103'],
  ['crème rétro', '#F3E9D2', '#E2D3B0', '#0A0A0B', '#B08D3C', '#F3E9D2'],
];

const pick = (r, l) => l[Math.floor(r() * l.length) % l.length];
const clair = h => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b > 140; };
const contraste = h => (clair(h) ? '#0A0A0B' : '#F5F5F4');

/** Base commune à tous les modèles : palette, cadre, coins, logo, effets tirés au sort. */
function base(r, p) {
  const c = clone(CARTE_DEFAUT);
  c.fond = { ...c.fond, c1: p[1], c2: p[2], c3: p[3] };
  const fondClair = clair(p[2]);
  c.effets.vignette = fondClair ? pick(r, [0, 0.08]) : pick(r, [0.2, 0.3, 0.45]);
  c.effets.grain = pick(r, [0, 0.04, 0.06]);
  c.filigrane.couleur = p[4]; c.filigrane.mode = fondClair ? pick(r, ['sombre', 'silhouette']) : pick(r, ['clair', 'clair', 'silhouette']);
  c.cadre.couleur = c.coins.couleur = c.cadre.couleur2 = p[3];
  c.cadre.epaisseur = pick(r, [0.012, 0.016, 0.022, 0.03]); c.cadre.marge = pick(r, [0.02, 0.028, 0.04]); c.cadre.rayon = pick(r, [0, 0.018, 0.04, 0.07]);
  c.cadre.forme = r() < 0.2 ? 'chanfrein' : 'arrondi'; c.cadre.actif = r() > 0.06;
  c.coins.style = pick(r, ['equerre', 'equerre', 'triangle', 'point', 'double']); c.coins.longueur = pick(r, [0.08, 0.12, 0.16]); c.coins.actif = r() > 0.25;
  const coin = pick(r, [[0.86, 0.107], [0.14, 0.107], [0.86, 0.9], [0.5, 0.1]]);
  c.logo.x = coin[0]; c.logo.y = coin[1]; c.logo.taille = pick(r, [0.13, 0.17, 0.21]); c.logo.ombre = r() < 0.3;
  c.plaque = { ...c.plaque, couleur: p[3], couleur1: p[5], couleur2: p[5] };
  c.badge = { ...c.badge, couleur: p[3], texteCouleur: p[5], bord: p[3] === '#0A0A0B' ? '#FDF103' : '#0A0A0B' };
  c.grandTexte.couleur = p[3]; c.halo.couleur = p[3]; c.contourJoueur.couleur = '#F5F5F4';
  return c;
}
/** Plaque nominative en bas, logo déplacé en haut s'il la gênait. */
function avecPlaque(c, r, forme) {
  c.plaque.actif = true; c.plaque.forme = forme || pick(r, ['rectangle', 'ruban', 'onglet', 'pilule', 'biseau']);
  c.plaque.y = pick(r, [0.88, 0.9, 0.92]); c.plaque.largeur = pick(r, [0.7, 0.8, 0.9]); c.plaque.hauteur = pick(r, [0.09, 0.11, 0.13]);
  c.plaque.ligne2 = pick(r, ['{poste}', 'Saison 2026-2027', '']);
  if (c.logo.y > 0.5) c.logo.y = 0.107;
  return c;
}

const FAMILLES = [
  { nom: 'Écusson', n: 60, fn: (c, r) => { c.filigrane.taille = pick(r, [0.7, 0.8, 0.9, 1.05, 1.25]); c.filigrane.y = pick(r, [0.22, 0.271, 0.32, 0.4]); c.filigrane.rotation = pick(r, [0, 0, 0, -12, 12, -20]); c.filigrane.opacite = pick(r, [0.07, 0.1, 0.14, 0.18]); } },
  { nom: 'Écusson & bandeau nom', n: 40, fn: (c, r, p) => { c.bandeau.actif = true; c.bandeau.devant = true; c.bandeau.couleur = p[3]; c.bandeau.hauteur = pick(r, [0.14, 0.17, 0.2]); c.bandeau.pente = pick(r, [0, 0.03, 0.05, -0.04]); c.texte = { ...c.texte, actif: true, contenu: '{nom}', couleur: p[5], y: 1 - c.bandeau.hauteur * 0.42, taille: 0.07 }; if (c.logo.y > 0.5) c.logo.y = 0.107; c.coins.actif = r() < 0.5; } },
  { nom: 'Vignette classique', n: 45, fn: (c, r, p) => { c.cadre = { ...c.cadre, actif: true, style: 'plein', couleur: pick(r, ['#F5F5F4', p[3], '#FFFFFF']), epaisseur: 0.01, marge: pick(r, [0.035, 0.045, 0.055]), rayon: pick(r, [0, 0.02, 0.04]), double: true, couleur2: p[3] }; c.coins.actif = false; avecPlaque(c, r); c.badge.actif = r() < 0.7; c.badge.forme = pick(r, ['cercle', 'bouclier', 'hexagone']); c.badge.x = pick(r, [0.15, 0.85]); c.logo.x = c.badge.x > 0.5 ? 0.15 : 0.85; c.logo.y = 0.11; } },
  { nom: 'Rétro', n: 35, fn: (c, r) => { const q = PALETTES[9]; c.fond = { ...c.fond, type: pick(r, ['uni', 'degrade', 'radial']), c1: q[1], c2: q[2] }; c.effets.vignette = 0.12; c.effets.grain = 0.08; c.cadre = { ...c.cadre, actif: true, style: 'plein', forme: pick(r, ['arrondi', 'chanfrein']), couleur: pick(r, ['#0A0A0B', '#FDF103', '#B08D3C']), epaisseur: 0.008, marge: 0.05, rayon: 0.03, double: true, couleur2: '#B08D3C' }; c.coins.actif = false; c.filigrane = { ...c.filigrane, mode: 'silhouette', couleur: '#B08D3C', opacite: 0.12 }; c.motif = { ...c.motif, type: pick(r, ['rayons', 'trame', 'aucun']), couleur: '#B08D3C', opacite: 0.12, taille: 0.05, fondu: 'bas' }; avecPlaque(c, r, pick(r, ['ruban', 'rectangle'])); c.plaque.couleur = c.cadre.couleur; c.plaque.couleur1 = c.plaque.couleur2 = contraste(c.cadre.couleur); } },
  { nom: 'Grand numéro', n: 40, fn: (c, r, p) => { c.grandTexte = { ...c.grandTexte, actif: true, contenu: pick(r, ['{numero}', '{numero}', 'MSH']), rendu: pick(r, ['contour', 'plein']), opacite: pick(r, [0.18, 0.3, 0.45]), taille: pick(r, [0.6, 0.8, 1]), y: pick(r, [0.3, 0.36, 0.42]), rotation: pick(r, [0, 0, -8, 8]) }; c.filigrane.actif = r() < 0.3; if (r() < 0.6) avecPlaque(c, r); } },
  { nom: 'Holographique', n: 40, fn: (c, r, p) => { c.holo = { actif: true, opacite: pick(r, [0.18, 0.28, 0.4]), angle: pick(r, [-35, 25, 45, 60]), taille: pick(r, [0.2, 0.35, 0.6]) }; c.motif = { ...c.motif, type: pick(r, ['eclats', 'rayons', 'hexagones', 'losanges']), couleur: '#FFFFFF', opacite: 0.08, taille: 0.05, fondu: 'bords' }; c.contourJoueur.actif = r() < 0.5; c.contourJoueur.epaisseur = 0.006; if (r() < 0.5) avecPlaque(c, r); } },
  { nom: 'Autocollant', n: 40, fn: (c, r, p) => { c.contourJoueur = { actif: true, couleur: pick(r, ['#FFFFFF', '#F5F5F4', p[3]]), epaisseur: pick(r, [0.008, 0.012, 0.016]), lueur: r() < 0.5 ? '#000000' : '', lueurTaille: 0.03 }; c.fond.type = pick(r, ['uni', 'radial', 'degrade']); c.motif = { ...c.motif, type: pick(r, ['etoiles', 'trame-degrade', 'eclats', 'cercles']), couleur: p[3], opacite: 0.2, taille: pick(r, [0.04, 0.06]), fondu: 'aucun', graine: Math.floor(r() * 999) }; c.badge.actif = r() < 0.6; } },
  { nom: 'Néon', n: 30, fn: (c, r, p) => { c.fond = { ...c.fond, type: 'radial', c1: '#1B1B22', c2: '#050506', centreY: 0.3 }; c.contourJoueur = { actif: true, couleur: p[3], epaisseur: 0.004, lueur: p[3], lueurTaille: pick(r, [0.03, 0.05]) }; c.halo = { ...c.halo, actif: true, opacite: 0.25 }; c.motif = { ...c.motif, type: pick(r, ['cercles', 'hexagones', 'lignes']), couleur: p[3], opacite: 0.1, taille: 0.06, fondu: 'centre' }; c.filigrane.opacite = 0.05; } },
  { nom: 'Pop BD', n: 30, fn: (c, r) => { const q = pick(r, [PALETTES[2], PALETTES[8], PALETTES[4]]); c.fond = { ...c.fond, type: 'radial', c1: q[1], c2: q[2], centreY: 0.25 }; c.motif = { ...c.motif, type: 'trame-degrade', couleur: '#0A0A0B', opacite: pick(r, [0.12, 0.2]), taille: pick(r, [0.04, 0.06]), angle: 45, fondu: 'aucun' }; c.contourJoueur = { actif: true, couleur: '#0A0A0B', epaisseur: 0.01, lueur: '', lueurTaille: 0 }; c.cadre = { ...c.cadre, couleur: '#0A0A0B', epaisseur: 0.02 }; c.coins.couleur = '#0A0A0B'; avecPlaque(c, r, pick(r, ['onglet', 'biseau'])); c.plaque.couleur = '#0A0A0B'; c.plaque.couleur1 = c.plaque.couleur2 = '#FDF103'; c.filigrane.actif = false; c.effets.vignette = 0; } },
  { nom: 'Éclats', n: 30, fn: (c, r, p) => { c.motif = { ...c.motif, type: 'eclats', couleur: p[3], opacite: pick(r, [0.12, 0.2, 0.3]), taille: pick(r, [0.02, 0.03, 0.05]), angle: Math.floor(r() * 30), fondu: pick(r, ['aucun', 'bords']), graine: Math.floor(r() * 999) }; c.halo = { ...c.halo, actif: true, opacite: pick(r, [0.2, 0.35]) }; } },
  { nom: 'Bandes sport', n: 30, fn: (c, r, p) => { c.motif = { ...c.motif, type: 'bandes', couleur: p[3], opacite: pick(r, [0.2, 0.35, 0.6]), taille: pick(r, [0.05, 0.07, 0.09]), angle: pick(r, [-30, -20, 20, 30]), fondu: 'aucun', graine: Math.floor(r() * 999) }; avecPlaque(c, r, 'biseau'); c.badge.actif = r() < 0.5; } },
  { nom: 'Écusson & rayons', n: 25, fn: (c, r, p) => { c.motif = { ...c.motif, type: 'rayons', couleur: p[3], opacite: pick(r, [0.06, 0.1, 0.14]), taille: pick(r, [0.025, 0.04, 0.06]), angle: pick(r, [0, 7, 15]), fondu: pick(r, ['aucun', 'bas', 'bords']) }; } },
  { nom: 'Écusson & trame', n: 25, fn: (c, r, p) => { c.motif = { ...c.motif, type: 'trame', couleur: p[3], opacite: pick(r, [0.25, 0.4, 0.6]), taille: pick(r, [0.04, 0.06, 0.09]), angle: 45, fondu: pick(r, ['bas', 'haut', 'bords']) }; } },
  { nom: 'Panthère', n: 40, fn: (c, r, p) => { c.panthere.actif = true; c.panthere.miroir = r() < 0.7; c.panthere.taille = pick(r, [1.1, 1.3, 1.6]); c.panthere.x = c.panthere.miroir ? 1 : 0; c.panthere.y = pick(r, [0.03, -0.02, 0.08]); const fc = clair(p[2]); c.panthere.couleur = fc ? '#0A0A0B' : pick(r, [p[3], '#000000', '#2B2B31']); c.panthere.opacite = fc ? pick(r, [0.12, 0.2, 0.9]) : pick(r, [0.35, 0.6, 1]); c.panthere.oeil = fc && p[3] === '#0A0A0B' ? '#FDF103' : p[3]; c.panthere.contour = !fc && c.panthere.couleur !== p[3] ? p[3] : (r() < 0.3 ? p[3] : ''); c.filigrane.opacite = pick(r, [0, 0.05, 0.08]); c.filigrane.actif = c.filigrane.opacite > 0; } },
  { nom: 'Griffures', n: 30, fn: (c, r, p) => { c.motif = { ...c.motif, type: 'griffures', couleur: p[3], opacite: pick(r, [0.18, 0.3, 0.5]), taille: pick(r, [0.06, 0.08, 0.1]), angle: pick(r, [-30, -20, 20, 35]), fondu: 'aucun', graine: Math.floor(r() * 999) }; c.filigrane.opacite = pick(r, [0.05, 0.08]); } },
  { nom: 'Hexagones', n: 25, fn: (c, r, p) => { c.motif = { ...c.motif, type: 'hexagones', couleur: p[3], opacite: pick(r, [0.12, 0.2, 0.3]), taille: pick(r, [0.06, 0.09, 0.13]), angle: pick(r, [0, 30]), fondu: pick(r, ['haut', 'bas', 'bords']) }; } },
  { nom: 'Double liseré', n: 25, fn: (c, r, p) => { c.cadre.double = true; c.cadre.couleur2 = pick(r, [p[3], '#F5F5F4']); c.cadre.epaisseur = pick(r, [0.012, 0.018, 0.024]); c.coins.style = pick(r, ['equerre', 'double', 'point']); } },
  { nom: 'Diagonale', n: 30, fn: (c, r, p) => { c.fond = { ...c.fond, type: 'diagonale', c1: p[1], c2: pick(r, [p[3], '#141417', p[2]]), angle: pick(r, [70, 75, 105, 110]), centreY: pick(r, [0.62, 0.7, 0.78]) }; c.filigrane.opacite = pick(r, [0.06, 0.1]); } },
  { nom: 'Projecteur', n: 25, fn: (c, r, p) => { c.fond = { ...c.fond, type: 'radial', c1: pick(r, ['#3A3A42', '#4A4A20', p[1]]), c2: '#0A0A0B', centreY: pick(r, [0.2, 0.28]) }; c.effets.vignette = pick(r, [0.3, 0.5]); c.halo.actif = r() < 0.5; } },
  { nom: 'Damier de logos', n: 25, fn: (c, r, p) => { c.motif = { ...c.motif, type: 'damier-logos', couleur: p[4], opacite: pick(r, [0.05, 0.08, 0.12]), taille: pick(r, [0.05, 0.07, 0.1]), angle: pick(r, [-15, 0, 15]), fondu: pick(r, ['haut', 'centre', 'aucun']) }; c.filigrane.actif = r() < 0.4; } },
  { nom: 'Lignes & vagues', n: 30, fn: (c, r, p) => { c.motif = { ...c.motif, type: pick(r, ['lignes', 'chevrons', 'carbone', 'losanges', 'vagues']), couleur: p[3], opacite: pick(r, [0.06, 0.1, 0.16]), taille: pick(r, [0.04, 0.07, 0.1]), angle: pick(r, [-35, 0, 35, 60]), fondu: pick(r, ['aucun', 'haut', 'bas', 'bords']) }; } },
  { nom: 'Dégradé 3 couleurs', n: 25, fn: (c, r, p) => { c.fond = { ...c.fond, type: 'trois', c1: p[2], c2: p[1], c3: p[3], angle: pick(r, [150, 180, 210]), centreY: pick(r, [0.55, 0.65, 0.75]) }; c.filigrane.opacite = pick(r, [0.06, 0.1]); if (r() < 0.5) avecPlaque(c, r); c.plaque.couleur = '#0A0A0B'; c.plaque.couleur1 = c.plaque.couleur2 = p[3] === '#0A0A0B' ? '#FDF103' : p[3]; } },
];

/**
 * Modèles générés : familles × palettes × variations, tous dérivés du 108 et entièrement
 * modifiables. Déterministe : les mêmes modèles à chaque ouverture.
 */
export function modeles() {
  const out = [{ id: 'C000', titre: 'Carte écusson (108)', famille: 'Écusson', cfg: clone(CARTE_DEFAUT) }];
  let k = 1;
  FAMILLES.forEach((fam, fi) => {
    for (let i = 0; i < fam.n; i++) {
      const r = alea(1000 * (fi + 1) + i), p = PALETTES[(i + fi * 3) % 9];   // la palette crème est réservée au rétro
      const c = base(r, p);
      fam.fn(c, r, p);
      out.push({ id: 'C' + String(k++).padStart(3, '0'), titre: `${fam.nom} · ${p[0]}`, famille: fam.nom, cfg: normaliser(c) });
    }
  });
  return out;
}

/** Une carte inédite : famille, palette et réglages tirés au sort (bouton « Surprends-moi »). */
export function surprise(seed = Date.now()) {
  const r = alea(seed), fi = Math.floor(r() * FAMILLES.length), p = PALETTES[Math.floor(r() * 9)];
  const c = base(r, p);
  FAMILLES[fi].fn(c, r, p);
  if (r() < 0.25) c.holo = { actif: true, opacite: 0.2, angle: Math.round(r() * 120 - 60), taille: 0.35 };
  if (r() < 0.3) avecPlaque(c, r);
  return normaliser(c);
}
