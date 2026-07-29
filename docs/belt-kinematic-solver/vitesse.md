# Vitesse — étape E du plan avant-prod

Jamais mesurée. L'objet de cette étape est de **fournir les chiffres**, pas de trancher la limite de
300 balayages, qui reste arbitraire et sera révisée après optimisations.

**Deux résultats à retenir.** Le q-modèle + agrégats coûte **2.4 à 3.7× le modèle φ par frame** —
c'est le vrai prix du branchement, et il est mesurable à l'œil sur le Core XY. Et **l'accélérateur
espéré n'existe pas** : l'agrégat ne rend pas la propagation d'un blocage sous-linéaire, il la rend
légèrement plus lente.

Banc : [belt-speed.bench.test.ts](../../src/components/solver/belt-speed.bench.test.ts).

---

## 1. Balayages à convergence

Résidu de la famille courroie au fil des balayages, frame 60.

> **Comment lire la colonne « → 1 % ».** La courbe de résidu **n'est pas décroissante** : elle part
> presque nulle (l'état warm-start satisfait encore tout), monte quand les moteurs poussent, puis se
> pose. Le comptage part donc **du pic**, pas du balayage 0. Quand le pic vaut le résidu final, la
> courbe est plate et le nombre ne veut rien dire — noté *(plat)*.

| mécanisme | modèle | pic | résidu final | → 1 % du final | → 1e-2 px | → 1e-3 px |
| --- | --- | --- | --- | --- | --- | --- |
| Poulie bloqueuse | φ | 3.26 | 3.23 | 41 | — | — |
| Poulie bloqueuse | q seul | 2.52 | 2.51 | 30 | — | — |
| Poulie bloqueuse | **q + agrégats** | **1.91** | **1.90** | **28** | — | — |
| Core XY | φ | 1.05 | 1.05 | 299 | — | — |
| Core XY | q seul | 8.38e-1 | 8.38e-1 | *(plat)* | — | — |
| Core XY | **q + agrégats** | 2.64e-1 | **3.36e-3** | 260 | 226 | — |
| Huygens | φ | 4.13 | 2.93 | 295 | — | — |
| Huygens | q seul | 2.45 | 1.42 | 294 | — | — |
| Huygens | **q + agrégats** | 1.75 | **1.04e-4** | **36** | 41 | 61 |

L'agrégat ne coûte pas de balayages, il en gagne — et surtout il **converge là où les deux autres ne
convergent pas du tout**. Sur Huygens il atteint 1e-3 px en 61 balayages quand φ et q seul plafonnent
respectivement à 2.93 et 1.42 px. Sur `Poulie bloqueuse`, aucun des trois ne converge et c'est
normal : le mécanisme est bloqué, le résidu est le blocage.

---

## 2. Coût par frame

200 frames, sans traçage, meilleur de trois passes.

| mécanisme | modèle | liens | dont courroie | ms/frame | ×φ |
| --- | --- | --- | --- | --- | --- |
| Poulie bloqueuse | φ | 12 | 5 | 3.64 | 1.00× |
| Poulie bloqueuse | q seul | 12 | 5 | 7.00 | 1.92× |
| Poulie bloqueuse | q + agrégats | 14 | 7 | 9.37 | **2.57×** |
| Core XY | φ | 40 | 12 | 7.37 | 1.00× |
| Core XY | q seul | 42 | 14 | 19.91 | 2.70× |
| **Core XY** | **q + agrégats** | 46 | 18 | **27.16** | **3.69×** |
| Huygens | φ | 17 | 5 | 3.89 | 1.00× |
| Huygens | q seul | 17 | 5 | 6.74 | 1.74× |
| Huygens | q + agrégats | 19 | 7 | 9.40 | **2.42×** |

**Le surcoût ne vient pas du nombre de liens** : 40 → 46 sur le Core XY, +15 %, pour ×3.69 de temps.
Il vient du **coût unitaire** d'une contrainte de courroie : chaque application de `BeltSegmentNoSlip`
et de `BeltSubChainAggregate` reconstruit la géométrie complète de la courroie (`viasFrom` puis
`belt_pieces`), 300 fois par frame et par lien. C'est là qu'est l'optimisation, pas dans le nombre
d'équations.

Ordre de grandeur produit : **27 ms/frame sur le Core XY**, soit ~37 fps à 300 balayages. La limite
de balayages n'est pas tranchée ici, mais c'est le chiffre qui la contraindra.

---

## 3. `sort_links` — l'ordre de balayage

Jamais varié jusqu'ici. Trois ordres : celui de `sort_links` (ancrés d'abord), l'inverse, et
« construction » (les liens de courroie relégués en fin de liste).

| mécanisme | ordre | pic | résidu final | → 1 % du final | → 1e-3 px |
| --- | --- | --- | --- | --- | --- |
| Poulie bloqueuse | **sort_links** | 1.91 | 1.90 | **28** | — |
| Poulie bloqueuse | inverse | 9.70e-1 | 9.70e-1 | 131 | — |
| Poulie bloqueuse | construction | 9.70e-1 | 9.70e-1 | 28 | — |
| Core XY | sort_links | 2.64e-1 | 3.36e-3 | 260 | — |
| Core XY | inverse | 2.62e-1 | 4.23e-3 | 264 | — |
| Core XY | construction | 2.63e-1 | 3.28e-3 | 260 | — |
| Huygens | sort_links | 1.75 | 1.04e-4 | 36 | 61 |
| Huygens | inverse | 1.75 | 1.03e-4 | 39 | 61 |
| Huygens | construction | 1.75 | 1.04e-4 | 33 | 56 |

**L'ordre ne change presque rien**, sauf sur `Poulie bloqueuse` où l'ordre inverse met 131 balayages
contre 28 — un facteur 4.7 en faveur de `sort_links`. Aucune raison de le toucher.

Un point à noter au passage : sur `Poulie bloqueuse`, le résidu **attribué** dépend de l'ordre (1.90
en `sort_links`, 0.970 dans les deux autres) alors que le mécanisme bloque identiquement. Le chiffre
de 1.94 px publié ailleurs dans ce dossier est donc un résidu *dans un ordre donné*, pas une grandeur
intrinsèque.

---

## 4. Sur-linéarité — l'accélérateur espéré n'existe pas

Boucle fermée de N poulies toutes ancrées, une poulie **gelée** à l'opposé du moteur : combien de
balayages pour que θ(moteur) se pose ? Deux agrégats sont émis (moteur, poulie gelée) quel que soit N.

| N poulies | sans agrégat | avec agrégat | rapport | θ(g0) final sans / avec |
| --- | --- | --- | --- | --- |
| 3 | 5 | 6 | 0.83× | 0.1875 / **0.1200** |
| 5 | 11 | 14 | 0.79× | 0.1929 / **0.1200** |
| 8 | 21 | 29 | 0.72× | 0.1957 / **0.1200** |
| 12 | 37 | 54 | 0.69× | 0.1971 / **0.1200** |
| 16 | 54 | 82 | 0.66× | 0.1979 / **0.1200** |
| 24 | 91 | 149 | 0.61× | 0.1986 / **0.1200** |

**La courbe ne s'aplatit pas — elle se redresse.** Balayages par poulie : 1.67 → 3.79 sans agrégat,
2.00 → 6.21 avec. Les deux sont sur-linéaires, et l'agrégat l'est davantage. L'hypothèse du
« préconditionneur obtenu gratuitement » (README §5 bis) est **infirmée**.

Mais la seconde colonne dit autre chose, et c'est le vrai résultat de cette mesure : **avec l'agrégat
le blocage s'établit à 0.1200 quelle que soit la longueur de la chaîne**, alors que sans lui il fuit
avec N (0.1875 à 3 poulies, 0.1986 à 24). L'agrégat transmet le blocage de façon **indépendante de la
longueur** — ce qui est exactement ce qu'on attend d'une équation qui traverse un tronçon entier.

Les deux colonnes de balayages ne mesurent donc pas le même trajet : chacune compte les balayages
jusqu'à **son propre** état final, et avec l'agrégat le moteur doit être repoussé plus loin (de 0.3 à
0.12 au lieu de 0.199). Une partie des balayages supplémentaires paie ce trajet plus long, pas une
convergence plus lente. La comparaison reste défavorable, mais elle n'est pas propre.

---

## 5. Limites

- **Les temps du §2 sont mesurés sous jsdom, dans vitest**, pas dans l'application. Les rapports
  (×2.4 à ×3.7) sont plus fiables que les millisecondes absolues.
- **Le §4 compare deux trajets différents** (voir ci-dessus) : le rapport de balayages surestime le
  désavantage de l'agrégat d'une quantité non chiffrée.
- **Un seul point de mesure par mécanisme** pour le §1 (frame 60) : le nombre de balayages à
  convergence peut varier au cours d'une course.
- La limite de 300 balayages n'est **pas** tranchée ici, conformément au plan.
- Le §4 n'existe que sur un gréement synthétique à géométrie figée ; aucun mécanisme réel du dossier
  n'a une chaîne assez longue pour exercer la sur-linéarité.
