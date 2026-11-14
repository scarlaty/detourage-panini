# Détourage Panini

Outil web pour préparer les vignettes d'un album de club façon Panini : il **détoure** les
joueurs et les **cadre tous en buste de la même façon** (même taille de visage, même
position), sur un fond commun.

Tout se passe dans le navigateur : les photos ne quittent jamais l'ordinateur.

## Utilisation

1. Ouvrir la page, glisser les photos (une par joueur, nommée `Prénom Nom.jpg`).
2. Choisir le cadrage (**Buste** par défaut), le format, le fond, éventuellement le logo.
3. Cliquer sur une vignette pour la retoucher (zoom, décalage) ou prélever la couleur du filet.
4. **Tout télécharger (.zip)**.

Le premier lancement télécharge le modèle de détourage (219 Mo pour BEN2, 115 Mo pour
BiRefNet lite). Il est ensuite gardé dans le cache du navigateur.

**Utiliser Chrome ou Edge récent sur ordinateur.** Le badge en haut à droite indique
l'accélération : avec *WebGPU*, quelques secondes par photo ; sans (*WASM*), le calcul se fait
sur un seul cœur du processeur et peut prendre **1 à 6 minutes par photo** selon la machine.

### Conseils de prise de vue

- Joueur de face, en pied ou au moins jusqu'à la taille, bras le long du corps.
- Même lieu et même lumière pour toute l'équipe.
- Fond uni si possible. Un filet de but est géré : l'option **Retirer la couleur du filet**
  supprime ses mailles le long du contour du joueur, sans toucher au maillot.

## Comment ça marche

| Étape | Outil |
|---|---|
| Repérage des yeux et des épaules | MediaPipe Pose Landmarker (lite) |
| Cadrage buste | yeux à 28 % de la hauteur, distance yeux-épaules à 28 % (`js/frame.js`) |
| Détourage | BEN2 ou BiRefNet lite (ONNX), lancé **sur la zone du buste** pour un masque plus fin |
| Nettoyage | suppression de la couleur du filet sur la bande de contour, îlots, décontamination des couleurs de bord (Forte & Pitié, 2021) — `js/matte.js` |
| Calcul | onnxruntime-web : WebGPU si disponible, sinon WebAssembly (plus lent) |

Si aucune pose n'est détectée, le cadrage est estimé d'après la silhouette et la vignette
porte la mention « à vérifier ».

## Développement

Aucune étape de compilation : les modules sont chargés tels quels.

```bash
npm start      # serveur local sur http://localhost:8080
npm test       # tests unitaires (node --test)
```

Un serveur HTTP est nécessaire (les workers en module ne fonctionnent pas en `file://`).

## Publication sur GitHub Pages

Settings → Pages → Source : *Deploy from a branch*, branche `main`, dossier `/ (root)`.

## Licences des modèles

- BEN2 : [PramaLLC/BEN2](https://huggingface.co/PramaLLC/BEN2) (MIT), version ONNX par onnx-community.
- BiRefNet : [ZhengPeng7/BiRefNet](https://github.com/ZhengPeng7/BiRefNet) (MIT), version ONNX par onnx-community.
- MediaPipe : Apache 2.0.
