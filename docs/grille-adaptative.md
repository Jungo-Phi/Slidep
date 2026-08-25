# Grille adaptative au zoom

Algorithme de rendu d'une grille cartésienne infinie dont le pas s'adapte
continûment au niveau de zoom, sans saut visuel.

Deux échelles distinctes lisent cette même géométrie : celle des étiquettes
(`graduation_step`, §5) suit la progression la plus lisible ; celle du snap
(`grid_snap_step`) suit plutôt la hiérarchie que la grille dessine déjà à
l'écran (§2) — un point aimanté tombe ainsi sur une ligne effectivement
visible, pas sur une valeur choisie pour sa rondeur. Les deux s'accordent sur
le rang le plus grossier et le plus fin d'une décade, pas forcément sur ce
qui se trouve entre les deux.

## Notations

- `scale` : facteur de zoom (pixels par unité monde)
- `CALIBRATION` : décalage de calibration — **dérivé**, pas réglé à la main
  (voir §5, « le seul cadran »)
- `n` : indice entier d'une ligne de grille

## 1. Décomposition logarithmique

```
log_scale   = log10(scale) + CALIBRATION
local_scale = log_scale - floor(log_scale)      // ∈ [0, 1)
floor_scale = 10 ^ floor(log_scale)             // puissance de 10 courante
```

- La ligne d'indice `n` est à la coordonnée monde `n / floor_scale`.
- L'espacement à l'écran vaut `scale / floor_scale = 10 ^ (local_scale - CALIBRATION)`.
- `local_scale` indique la progression dans la décade : 0 juste après un
  changement de niveau, ~1 juste avant le suivant.

`CALIBRATION` n'est plus une constante choisie pour centrer cet espacement
fin sur ~10 px : elle est calculée (§5) pour que le pas des **étiquettes**
tombe exactement sur la fenêtre visée (`LABEL_PITCH_FLOOR_PX`, 40 px
aujourd'hui — 100 px au plafond, voir §5). L'espacement des lignes fines,
non étiquetées, en découle plutôt que d'être fixé indépendamment ; il
change proportionnellement à `LABEL_PITCH_FLOOR_PX`. En zoomant, dès que
l'espacement dépasse le plafond de la décade, `floor_scale` est multiplié
par 10, le pas monde est divisé par 10 et l'espacement retombe à son
plancher.

## 2. Hiérarchie d'opacité

Deux tables d'alphas, interpolées linéairement selon `local_scale` :

```
P = [0.00, 0.10, 0.30, 0.60]    // échelle des puissances de 10
Q = [0.00, 0.25, 0.45,  —  ]    // échelle des multiples de 5
```

| Condition sur `n` | Interpolation | α à `local=0` | α à `local=1` |
| ----------------- | ------------- | ------------- | ------------- |
| `n % 100 == 0`    | `P[2] → P[3]` | 0.30          | 0.60          |
| `n % 50  == 0`    | `Q[1] → Q[2]` | 0.25          | 0.45          |
| `n % 10  == 0`    | `P[1] → P[2]` | 0.10          | 0.30          |
| `n % 5   == 0`    | `Q[0] → Q[1]` | 0.00          | 0.25          |
| sinon             | `P[0] → P[1]` | 0.00          | 0.10          |

(tests évalués dans cet ordre, du plus restrictif au plus général)

### Continuité au changement de décade

Quand `floor_scale` est multiplié par 10, tous les indices sont multipliés
par 10 et chaque ligne monte d'un cran dans la hiérarchie :

```
n % 1  →  n % 10   :  0.10 (fin) = 0.10 (début)   ✓
n % 5  →  n % 50   :  0.25 (fin) = 0.25 (début)   ✓
n % 10 →  n % 100  :  0.30 (fin) = 0.30 (début)   ✓
```

La valeur haute d'un niveau égale exactement la valeur basse du niveau
suivant : la transition est **invisible**. Les lignes fines émergent
progressivement du transparent, se densifient, puis le repère glisse d'un cran.

> **Limite connue** — les multiples de 1000 ne sont pas traités séparément et
> retombent dans le cas `% 100` : les lignes les plus sombres sautent de 0.60
> à 0.30 au changement de décade. Corrigeable en étendant `P` d'un niveau.

## 3. Plage de lignes visibles

Composer `écran → monde` puis multiplier par `floor_scale` donne une
transformation `pixel → indice de grille` (réel). L'appliquer aux deux coins
de la zone de dessin, arrondir vers le haut, itérer sur l'intervalle
semi-ouvert `[start, end)`.

Si l'axe vertical de l'écran est inversé par rapport au monde, le retournement
est `(start, end) ← (1 - end, 1 - start)` : le `1 -` compense l'asymétrie de
l'arrondi supérieur sous négation (`ceil(-x) = -floor(x)`) et préserve le
caractère semi-ouvert de l'intervalle.

## 4. Axes

Position du zéro monde à l'écran → trois cas par direction :

- hors écran d'un côté → axe **épinglé au bord** (1 px de marge)
- visible → axe à sa position réelle

Les axes restent ainsi toujours affichés comme repère, même loin de l'origine.
L'alignement choisi détermine aussi de quel côté sont ancrées les étiquettes.

## 5. Graduations

Une ligne étiquetée sur `k`, avec `k` fonction de `local_scale` (séquence
`GRADUATION_LADDER`) :

| `local_scale`   | `k` | espacement des étiquettes |
| --------------- | --- | -------------------------- |
| 0 – 0.151       | 10  | 56.6 → 80 px                |
| 0.151 – 0.548   | 5   | 40 → 100 px                 |
| 0.548 – 0.849   | 2   | 40 → 80 px                  |
| 0.849 – 1       | 1   | 40 → 56.6 px                |

`k` suit `1, 2, 5, 10` — la progression d'ingénieur classique, immédiatement
lisible. Le pas des étiquettes reste dans la fenêtre visée de
`LABEL_PITCH_FLOOR_PX`–`LABEL_PITCH_CEILING_PX` (40–100 px aujourd'hui) à
tout niveau de zoom (×2.5 — le plancher indépassable de cette séquence à 4
valeurs, voir plus bas).

**Seuils, dérivés de la séquence plutôt que réglés à la main :**

La largeur du rung `i` (l'intervalle de `local_scale` où `k` vaut `ladder[i]`)
est fixée à `log10(ladder[i] / ladder[i+1])` : exactement l'écart d'écran que
lui coûtera le passage au rung suivant. Chaque rung « encaisse » donc par
avance ce qu'il perdra à son propre changement — son point bas revient
systématiquement au même niveau de référence, quel que soit le motif des
écarts. La plage totale n'est alors jamais que l'ampleur du *plus grand*
écart de la séquence : c'est le mieux qu'un placement de seuils puisse
faire pour une séquence donnée, atteint sans recherche.

Seule exception : le dernier rung (`k=1`) ne « perd » rien à son propre
changement de decade — il cède la place au rung le plus grossier de la
décade suivante à la même valeur, pas à une valeur plus petite (continuité
de `grid_metrics`). Le premier écart (entre le rung le plus grossier et
le suivant) est donc partagé pour moitié entre le premier et le dernier
rung, plutôt que porté par le premier seul. La même construction
(`rung_thresholds`) s'applique aussi à `SNAP_LADDER` (`1, 5, 10` — voir
« Une échelle séparée pour le snap » plus bas), pas seulement à
`GRADUATION_LADDER`.

Une séquence à 4 valeurs (`1,2,5,10`) a pour plus grand écart `5→2`
(`×2.5`) : c'est un plancher indépassable pour cette séquence, quels que
soient les seuils. Une séquence plus fine (par ex. `1,1.6,2,2.5,4,5,8,10`,
testée puis abandonnée) resserre cette fenêtre au prix de valeurs moins
immédiatement rondes — jugé ici moins important que la lisibilité de
`1,2,5,10`.

**Le seul cadran :**

Plutôt que choisir `CALIBRATION` directement, on choisit la largeur de
fenêtre voulue (`LABEL_PITCH_FLOOR_PX`, le plancher — le plafond
(`LABEL_PITCH_CEILING_PX`) suit automatiquement, à `×2.5`) et `CALIBRATION`
se calcule pour l'atteindre exactement, à partir du plancher que la
séquence produirait sans calibration (`CALIBRATION = 0`). Un futur
changement de séquence garde ainsi le même plancher sans recalcul à la
main — et comme c'est le seul cadran (§1), un test qui vérifie le
comportement l'injecte plutôt que de recopier sa valeur du jour (voir
`grid.test.ts`).

**Une échelle séparée pour le snap :**

`grid_snap_step` (où tombe un point posé) ne lit pas `GRADUATION_LADDER`
mais `SNAP_LADDER = [10, 5, 1]` — la grille dessinée (§2) ne met en
évidence que les multiples de 1, 5 et 10 par décade (pas de palier dédié au
`2`), donc c'est cette séquence-là qui fait correspondre un point aimanté à
une ligne effectivement visible plutôt qu'à une valeur choisie pour sa
rondeur. Les deux échelles partagent le même `local`/`decade`
(`grid_metrics`) et donc le même rang le plus grossier et le plus fin ; leur
écart le plus large diffère en revanche (`5→1`, soit `×5`, contre `×2.5`
pour `GRADUATION_LADDER`) — sans conséquence ici, puisque rien ne vise de
fenêtre de pixels particulière pour le snap.

**Décimales affichées :**

```
precision = max(0, floor(log_scale) - unit_scale - decimal_shift(k))
```

`decimal_shift(k)` compte les zéros de fin de `k` (`10` → `1`, il peut
absorber une décade avant d'avoir besoin d'une décimale) moins ses propres
décimales (`2.5` ou `1.6` → `-1`, il en réclame une avant même de compter les
décades) — lu depuis la forme canonique de `k`, pas listé à la main par
rung, pour que la séquence reste la seule chose à régler même si un futur
`k` n'est plus un entier multiple de dix. Pour la séquence actuelle
(`1,2,5,10`, tous multiples ou diviseurs de dix), seul `10` vaut `1` ; les
autres valent `0`. Ni zéro superflu, ni valeur tronquée.

**Unité d'affichage :**

```
valeur affichée = n * 10^unit_scale / floor_scale
```

`unit_scale` permet de changer d'unité (ex. `3` pour passer des mètres aux
millimètres) sans toucher au reste de l'algorithme.

Le premier `k` d'une décade (`k = 10`, à `local_scale = 0`) reproduit
toujours exactement le dernier `k` de la décade précédente (`k = 1`) — c'est
la continuité du §1, transposée aux étiquettes. Invisible tant que l'unité ne
change pas, cette répétition devient une fausse transition si l'unité est
choisie à partir de `floor(log_scale)` seul : elle changerait sur une valeur
qui n'a en réalité pas bougé. L'unité est donc choisie sur la décade
précédente tant que `k` vaut ce premier rang (`10`), pour ne basculer que sur
la première étiquette réellement nouvelle.

## Note de performance

Seules 5 valeurs d'opacité distinctes existent par frame. Les précalculer avant
les boucles évite une interpolation et une allocation de style par ligne
(jusqu'à ~400 lignes par axe à densité maximale).
