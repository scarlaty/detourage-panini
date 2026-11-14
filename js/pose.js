// Détection des repères du corps (yeux, nez, épaules) avec MediaPipe Pose Landmarker.
// Sert uniquement au cadrage : si elle échoue, l'application se rabat sur le masque.

const VERSION = '0.10.35';
const LIB = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let landmarkerP = null;

function getLandmarker() {
  if (!landmarkerP) {
    landmarkerP = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import(`${LIB}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${LIB}/wasm`);
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numPoses: 1,
      });
    })();
    landmarkerP.catch(() => { landmarkerP = null; });
  }
  return landmarkerP;
}

/** Renvoie les 33 repères normalisés de la personne principale, ou null. */
export async function detectPose(canvas) {
  try {
    const lm = await getLandmarker();
    const res = lm.detect(canvas);
    return res.landmarks?.[0] || null;
  } catch (e) {
    console.warn('Pose indisponible, cadrage par le masque :', e);
    return null;
  }
}
