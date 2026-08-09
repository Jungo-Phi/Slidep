# Grille adaptative au zoom

Algorithme de rendu d'une grille cartésienne infinie dont le pas s'adapte
continûment au niveau de zoom, sans saut visuel.

## Notations

- `scale` : facteur de zoom (pixels par unité monde)
- `GRID_SCALE = -0.5` : décalage de calibration
- `n` : indice entier d'une ligne de grille

## 1. Décomposition logarithmique

```
log_scale   = log10(scale) + GRID_SCALE
local_scale = log_scale - floor(log_scale)      // ∈ [0, 1)
floor_scale = 10 ^ floor(log_scale)             // puissance de 10 courante
```

- La ligne d'indice `n` est à la coordonnée monde `n / floor_scale`.
- L'espacement à l'écran vaut `scale / floor_scale = 10 ^ (local_scale + 0.5)`,
  soit **3.16 px → 31.6 px**.
- `local_scale` indique la progression dans la décade : 0 juste après un
  changement de niveau, ~1 juste avant le suivant.

Le décalage `-0.5` recentre géométriquement la plage autour de 10 px
(sans lui : 1 px → 10 px, illisible en bas de plage). En zoomant, dès que
l'espacement dépasse 31.6 px, `floor_scale` est multiplié par 10, le pas monde
est divisé par 10 et l'espacement retombe à 3.16 px.

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

Une ligne étiquetée sur `k`, avec `k` fonction de `local_scale` :

| `local_scale` | `k` | espacement des étiquettes |
| ------------- | --- | ------------------------- |
| < 0.2         | 20  | 63 → 100 px               |
| 0.2 – 0.6     | 10  | 50 → 126 px               |
| 0.6 – 0.9     | 5   | 63 → 125 px               |
| > 0.9         | 2   | 50 → 63 px                |

Le pas des étiquettes reste dans une fenêtre confortable de ~50–125 px à tout
niveau de zoom, en alternant la progression naturelle 1-2-5-10-20.

**Décimales affichées :**

```
precision = max(0, floor(log_scale) - unit_scale - 1 + (local_scale > 0.6 ? 1 : 0))
```

Le `+1` couvre les cas `k ∈ {5, 2}`, qui exigent une décimale de plus.
Ni zéro superflu, ni valeur tronquée.

**Unité d'affichage :**

```
valeur affichée = n * 10^unit_scale / floor_scale
```

`unit_scale` permet de changer d'unité (ex. `3` pour passer des mètres aux
millimètres) sans toucher au reste de l'algorithme.

## Note de performance

Seules 5 valeurs d'opacité distinctes existent par frame. Les précalculer avant
les boucles évite une interpolation et une allocation de style par ligne
(jusqu'à ~400 lignes par axe à densité maximale).
