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

## Cartes

Le mode **Carte** (section Fond) fabrique des vignettes façon cartes et autocollants de sport,
à partir du fond 108 « Carte écusson ». Plus de 700 modèles (galerie, collection « Cartes »),
répartis en 22 familles : écusson, vignette classique à bordure pleine, rétro, grand numéro,
holographique, autocollant, néon, pop BD, éclats, bandes sport, panthère, griffures, hexagones,
diagonale, projecteur, damier d'écussons, dégradé 3 couleurs…

Chaque modèle n'est qu'un réglage d'un même moteur (`js/carte.js`) : tout ce qui est proposé
se recrée et se modifie dans l'éditeur, élément par élément.

| Élément | Réglages principaux |
|---|---|
| Fond | dégradé, dégradé 3 couleurs, projecteur, uni, deux tons en diagonale ; couleurs, angle |
| Halo | lumière derrière la tête : couleur, intensité, taille, hauteur |
| Motif | rayons, éclats, trames (dont points dégradés façon BD), lignes, bandes, carbone, chevrons, losanges, hexagones, cercles, vagues, étoiles, damier d'écussons, griffures ; couleur, taille, angle, fondu |
| Écusson en filigrane | rendu (couleurs, parties claires/sombres teintées, silhouette), taille, position, rotation |
| Grand numéro / initiales | plein ou contour, taille, position, rotation |
| Panthère | couleur, œil, contour, taille, position, sens |
| Cadre et coins | liseré ou bordure pleine (vignette rétro), coins arrondis ou coupés, second liseré ; équerres, triangles, points |
| Bandeau, plaque nominative, badge | ruban, onglet, pilule, biseau… ; badge cercle, bouclier, hexagone, losange |
| Logo, texte libre | position, taille, rendu, ombre ; devant ou derrière le joueur |
| Contour du joueur | contour « autocollant » et lueur autour du joueur détouré |
| Effets | effet holographique, vignettage, grain |

Les textes acceptent `{nom}`, `{numero}` et `{poste}`, tirés de la **fiche** de chaque photo.

## Fiche joueur et nom des fichiers

Sous chaque vignette (et dans la fenêtre de retouche), trois champs : **N°**, **Nom**, **Poste**
(liste de postes proposée). Entrée passe à la photo suivante, Maj+Entrée à la précédente, pour
saisir toute l'équipe d'affilée ; on peut remplir pendant le détourage.

- Photo nommée par l'appareil (`DC29430RE`, `IMG_6232`, `DSC01234`…) : fiche vide à remplir.
- Photo déjà nommée `10 - Léa Martin (Gardienne).jpg` : fiche préremplie.

Le fichier téléchargé (seul ou dans le ZIP) est nommé `10 - Léa Martin (Gardienne).jpg` ;
sans nom ni numéro, il garde le nom d'origine. Recharger ces images préremplit la fiche ;
les marques de copie (`(2)`, `- copie`) sont ignorées.

**Surprends-moi** tire une carte inédite au sort. **Mes cartes** enregistre ses créations dans
le navigateur, et les exporte ou importe en fichier `.json` pour les partager. Le logo des
cartes est celui du club (`fonds/cartes/logo-club.png`), remplacé par le logo ajouté dans
« Logo et export » s'il y en a un.

## Fonds

Le bouton **Visuels** (section Fond) ouvre une fenêtre avec tous les fonds, filtrables par
collection et par famille, avec un joueur en surimpression pour juger du rendu.

| Collection | Contenu | Publié |
|---|---|---|
| Graphiques (`fonds/pro/`) | 175 fonds SVG : dégradés, écusson, panthère, griffures, rayons, projecteurs, trames, néons… | oui |
| Salle (`fonds/salle/`) | 138 fonds : photos de la salle légèrement floutées et étalonnées (des enfants apparaissent, petits et flous ; publication validée par le club) | oui |

Régénérer :

```bash
python tools/fonds_pro.py <logo.png> fonds/pro          # fonds graphiques (logo officiel fourni par le club)
python tools/fonds_salle.py <photos> <logo.png> <dossier_sortie>
python tools/catalogue.py [<dossier_sortie_salle>]     # catalogues + vignettes de la salle
```

Les vignettes des fonds graphiques (`fonds/pro/vignettes/*.webp`) sont rendues par le navigateur
(rendu SVG identique à l'appli). La panthère est une interprétation vectorielle du logo, à faire
valider par le club.

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
