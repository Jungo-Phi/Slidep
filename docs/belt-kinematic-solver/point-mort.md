# Point mort : s'arrêter, pas traverser — étape D du plan avant-prod

Un mécanisme qui bloque **doit** bloquer visiblement. Une déchirure qui reste est acceptable —
l'utilisateur voit que ça coince. Ce qui ne l'est pas, c'est **traverser** : franchir la bande
interdite et se réinstaller de l'autre côté sans rien signaler.

**Verdict en deux temps.** Le blocage de courroie est un vrai point fixe et il tient indéfiniment.
La butée mécanique du banc dynamique **traverse toujours** — mais l'agrégat n'y est pour rien : avec
et sans lui, les chiffres sont les mêmes à la troisième décimale. C'est un défaut préexistant des
contraintes positionnelles, hors du périmètre de ce chantier.

Banc : [belt-dead-point.bench.test.ts](../../src/components/solver/belt-dead-point.bench.test.ts).

---

## 1. `Poulie bloqueuse` — arrêt franc, et définitif

Le moteur commande jusqu'à **3000°**, soit 60 fois le point de blocage.

| frame | consigne | θ moteur (q seul) | θ moteur (q + agrégats) |
| --- | --- | --- | --- |
| 50 | 50° | 49.435° | 49.394° |
| 100 | 100° | **51.563°** | **50.869°** |
| 400 | 400° | **51.563°** | **50.869°** |
| 1600 | 1600° | **51.563°** | **50.869°** |
| 3000 | 3000° | **51.563°** | **50.869°** |

Pas un chiffre ne bouge entre la frame 100 et la frame 3000. Les résidus non plus : `Distance` 1.83,
`SlideOnSegment` 0.854, no-slip 1.16, agrégat 1.94 — identiques à ceux publiés dans
[agregat-sous-chaine.md](./agregat-sous-chaine.md) §4, et rigoureusement constants sur 2900 frames.

**C'est un point fixe, pas une reptation lente.** Commander soixante fois au-delà ne gagne rien.

---

## 2. La butée bielle-glissière traverse toujours

Le banc de [belt-gear-pin-arbitration.md](./belt-gear-pin-arbitration.md) §5, reconstruit pour
accepter l'agrégat : boucle fermée à 5 poulies toutes ancrées, et sur `g2` un nœud de jante relié
par une bielle de 70 px à un patin qui coulisse sur un rail ancré 60 px sous le centre. La bielle
atteint le nœud tant que `sin θ' ≤ 0.5` : **fenêtre libre de 2.094 rad (120°)**, arrêt moteur prédit
à θ(g0) ≈ 1.900 rad. Rien ne déclare la butée — c'est un `Distance` et un `SlideOnSegment` qui
arrivent à leur point mort.

| cible θ(g0) | θ(g2) sans agrégat | θ(g2) avec agrégat | ×fenêtre | rés. bielle (sans / avec) |
| --- | --- | --- | --- | --- |
| 1.60 | 1.764 | 1.764 | 0.84× | 4.8e-4 / 1.9e-4 |
| 2.00 | 2.151 | 2.156 | **1.03×** | 8.75e-1 / 9.56e-1 |
| 2.40 | 2.413 | 2.439 | 1.16× | 4.44 / 4.84 |
| **2.80** | 2.817 | 2.907 | 1.39× | **8.66 / 9.28** |
| 3.20 | 3.795 | 3.762 | 1.80× | 5.37 / 5.84 |
| 4.00 | 4.401 | 4.406 | 2.10× | 1.2e-1 / 5.5e-2 |
| **4.80** | **5.292** | **5.292** | **2.53×** | **4.1e-7 / 4.6e-8** |

Le mécanisme déchire sa bielle jusqu'à **8.66 px**, franchit la bande, puis **se réinstalle
proprement de l'autre côté** — résidus retombés à 1e-7 et suivi moteur revenu à 100 %. θ(g2) finit à
**2.53×** sa fenêtre mécanique.

**L'agrégat ne cause rien et ne répare rien.** Deux agrégats sont émis (moteur sur g0, pin sur g2).
Ils déplacent les résidus de quelques pour cent au passage — pic de bielle 7 % plus haut, résidu
final dix fois plus bas — mais l'issue est identique : même point d'arrivée, même dépassement de
fenêtre, au chiffre près.

---

## 3. Amplitude de la déchirure

| banc | déchirure | nature |
| --- | --- | --- |
| `Poulie bloqueuse` | 1.83 px (`Distance`), 1.94 px (agrégat) | **permanente et stable** — le blocage voulu |
| bielle-glissière | pic à **8.66 px** sans agrégat, **9.28** avec, puis retour à 1e-7 | **transitoire** — la traversée |

La différence de nature est la vraie information : dans un cas la déchirure **reste** et l'utilisateur
voit que ça coince ; dans l'autre elle passe et le mécanisme repart comme si de rien n'était.

---

## 4. Pourquoi les deux bancs ne font pas la même chose

`Poulie bloqueuse` bloque parce que la **cinématique de la courroie** interdit le mouvement : le
q-modèle refuse le glissement, il n'y a pas d'autre branche à rejoindre, et le point fixe tient.

La bielle-glissière bloque sur un **point mort géométrique** d'une bielle et d'un patin. Un solveur
PBD ne connaît que des projections, pas des forces : passé le point mort, la contrainte redevient
satisfaisable sur l'autre branche, et rien n'empêche d'y aller. C'est le défaut déjà décrit au §6 du
[README](./README.md), et il ne concerne pas la courroie.

**Conclusion pour la mise en production : l'étape D n'est pas bloquante.** Le blocage de courroie
tient ; la traversée est un défaut préexistant que le chantier ne crée pas, n'aggrave pas et ne
répare pas.

---

## 5. Limites

- **La traversée n'est pas réparée**, seulement innocentée. Elle reste un défaut ouvert du solveur,
  à traiter séparément.
- Un seul banc dynamique, une seule butée, une seule rampe (pas de rampe inverse ni de vitesse
  variable). Le comportement au voisinage immédiat du point mort n'est pas échantillonné finement.
- Le pic mesuré ici (8.66 px) diffère du 7.67 px publié dans
  [belt-gear-pin-arbitration.md](./belt-gear-pin-arbitration.md) §5 : le no-slip est désormais en
  métrique `rim`. Même ordre de grandeur, même conclusion.
- `Poulie bloqueuse` bloque à 51.563° en q seul contre 50.869° avec agrégats — l'écart de 0.69°
  déjà documenté, dans le garde-fou de ±1°.
- **Piège des gréements synthétiques**, à ne pas refaire : `makeClosedBelt` nomme le centre d'une
  poulie et son angle avec **la même chaîne**, et `closedBeltLengthLink` pose `owner: "belt"`. Un
  `spec.owner` laissé à `undefined` fait donc voir le lien `BeltLength` de la courroie comme un
  intéressé **étranger** de tous les angles, et le critère coupe partout. Une première version de ce
  banc mesurait 5 agrégats au lieu de 2 — verdict inchangé, mais les chiffres l'étaient.
