# Arbitrage `GearPerimeterPin` ↔ no-slip q : le banc qui déplace le maillon fautif

Suite de [belt-q-conditioning.md](./belt-q-conditioning.md) §Q4 et de
[belt-q-positional-authority.md](./belt-q-positional-authority.md). Les deux tours précédents
ont éliminé « rendre le no-slip plus raide » et « lui donner une autorité positionnelle ».
L'hypothèse de ce tour : le `GearPerimeterPin` **écrase** l'angle au lieu de le **partager**, donc
l'information « ce mouvement est interdit » meurt chez lui ; le rendre coopératif (vraie
projection PBD sur tous ses DOF) ferait remonter le blocage.

Bancs, derrière le champ `cooperative` d'un lien (jamais posé par le parseur — solveur
strictement intact à flag off) :
[experimental/gear-pin-cooperative.ts](../../src/components/solver/experimental/gear-pin-cooperative.ts),
[belt-gear-pin-arbitration.bench.test.ts](../../src/components/solver/belt-gear-pin-arbitration.bench.test.ts) (Core
XY réel), [belt-gear-pin-emergence.bench.test.ts](../../src/components/solver/belt-gear-pin-emergence.bench.test.ts)
(bancs synthétiques). Ajouts additifs : le champ optionnel `cooperative` sur la variante
`GearPerimeterPin` de l'union `Link`
([kinematic-solver-links.ts:290-302](../../src/types/kinematic-solver-links.ts#L290-L302)) et un
branchement dans [PBD_kinematic_solver.ts:371-394](../../src/components/solver/PBD_kinematic_solver.ts#L371-L394).
Aucune contrainte existante modifiée, aucune signature publique changée.

---

## Les quatre réponses demandées

**1. Il ÉCRASE — mais pas pour la raison supposée, et le corriger ne change rien ici.**
Preuve algébrique : à
[constraint-functions.ts:929-941](../../src/components/solver/constraint-functions.ts#L929-L941),
`denom = wN + 1` et `dTheta = C/denom` ; avec un nœud ancré (`wN = 0`) cela donne
`θ_new = θ + (ang − θ − offset) = ang − offset`, **indépendant de `θ_old`**. Mesuré :
`∂θ_new/∂θ_old = 0.000000`, et le résidu qu'il laisse derrière lui est **exactement 0**.
Confirmé en situ sur le Core XY : le no-slip demande **+2.01 rad** par balayage sur l'angle
bloqué, le pin écrit **−2.01 rad**, net **3.7e-10**, **survie/demande = 0.0000** — identique du
balayage 0 au balayage 299. L'absorption est réelle et totale.

Deux nuances que l'hypothèse n'anticipait pas, et qui décident de la suite :

- Ce n'est **pas** un garde-fou artisanal. Avec un nœud mobile, le pin **partage** déjà
  (`∂θ_new/∂θ_old = 0.5`) : son partage *est* la projection pondérée par mobilité, exprimée dans
  la métrique « angle du nœud autour du centre ». Sa seule omission réelle est `∂C/∂centre`
  ([:938-941](../../src/components/solver/constraint-functions.ts#L938-L941), « le centre reste fixe
  pour cette partie »).
- Sur le Core XY, cette omission est **inerte** : le mécanisme n'a qu'**un seul**
  `GearPerimeterPin`, et son nœud **et** son centre sont ancrés (`w = 0` tous les deux). Aucune
  projection honnête ne peut router quoi que ce soit : l'écrasement y est une **condition de
  Dirichlet correcte** sur θ, pas une information perdue.

**2. NON — la variante coopérative ne fait pas émerger le blocage, ni statique ni dynamique.**
Sur le Core XY, elle est **strictement identique** au pin actuel, à la décimale près, sur les
trois épreuves (montée −96.7, translation −96.1, moteur 0.0) — conséquence prévisible du point
précédent, et vérifiée. Sur un banc **dynamique** où le nœud du pin est mobile (butée
bielle-glissière, fenêtre libre de 2.09 rad, arrêt moteur prédit à 1.90 rad), le blocage
n'émerge pas davantage : le moteur ne perd que **4.2 %** au pire, **déchire la bielle de
7.67 px** et le pin de 3.51 px, puis **traverse la bande interdite** et reprend 100 % de suivi ;
θ(g2) atteint **5.29 rad**, soit **2.5×** sa fenêtre mécanique. La variante `rim` reproduit ces
chiffres à 3 décimales ; la variante `unit` échoue la non-régression (ci-dessous).

**3. Non-régression : OK pour `rim`, ÉCHOUÉE pour `unit`.** Sur une courroie saine avec moteur,
`actuel` et `rim` donnent un flux rigoureusement uniforme (`q = 6.600` sur les 5 poulies, écart
max **0.000000**) et θ(g0) = 0.3000 = la cible. `unit` casse la transmission : écart max
**2.78 px** sur `q`, moteur à 78 %. Sur le Core XY, la coopération ne change ni la translation x
ni la montée (identiques au q-modèle). Cas dégénéré (deux poulies d'un même segment épinglées) :
sortie propre, tout fini, résidu 3.93 px, identique pour les trois variantes — et le dénominateur
angulaire **ne peut pas** tendre vers 0 dans l'option 1, les angles n'ayant pas de masse
(`denom = rEpsA² + rEpsB² > 0` par construction,
[belt-noslip-q.ts:186-187](../../src/components/solver/experimental/belt-noslip-q.ts#L186-L187)).

**4. Oui, un accélérateur global sera nécessaire.** Balayages pour que le blocage s'établisse à
1 % de sa valeur finale, en fonction du nombre de poulies : **3 / 14 / 18 / 41 / 76** pour
N = 3 / 5 / 8 / 12 / 16. Nettement **sur-linéaire**, ≈ O(N²) entre 8 et 16. À 300 balayages par
frame, une chaîne de 16 poulies consomme le quart du budget rien qu'à propager un blocage.

---

## Et le résultat qui n'était pas demandé, mais qui reclasse le chantier

**Le q-modèle option 1 bloque le MOTEUR au lieu d'entraîner le chariot.** Bissection sur le Core
XY, moteur seul, 60 frames (course libre = 0.2094 rad) :

| liens retirés          | course moteur       | chariot |
| ---------------------- | ------------------- | ------- |
| aucun (référence)      | 0.0056 (**2.7 %**)  | (0, 0)  |
| − `BeltSegmentNoSlip`  | 0.2094 (**100 %**)  | (0, 0)  |
| − `BeltLength`         | 0.0056 (2.7 %)      | (0, 0)  |
| − `GearPerimeterPin`   | 0.0056 (2.7 %)      | (0, 0)  |
| − `Angle`              | 0.0056 (2.7 %)      | (0, 0)  |
| − `SlideOnSegment`     | 0.0056 (2.7 %)      | (0, 0)  |
| − `FixedOnSegment`     | 0.0056 (2.7 %)      | (0, 0)  |
| − `Distance`           | 0.0056 (2.7 %)      | (0, 0)  |

C'est **la chaîne q elle-même** qui immobilise le moteur, et rien d'autre : la retirer le libère
à 100 %, retirer n'importe quoi d'autre ne change rien. Le chariot, lui, ne bouge dans aucune
configuration — alors qu'il suit une saisie à 96 px sans difficulté.

Le mécanisme est celui-ci. La courroie est ouverte, ses deux terminaux sont sur le chariot, donc
`q = 0` aux deux bouts. Si le chariot ne bouge pas, `Δh ≡ 0`, donc tous les `q` sont égaux, donc
`q ≡ 0` : le moteur est interdit. Pour que le moteur tourne, il faut que le chariot bouge ; pour
que le chariot bouge, il faut que quelque chose le pousse ; et **l'option 1 n'écrit aucune
position**. Blocage mutuel.

**Les deux symptômes de l'enquête sont donc un seul fait.** Le résidu de segment
`C = q_a − q_b − (h − h⁰)` dépend de la géométrie (par `h`) et des angles (par `q`), mais la
projection n'écrit que des angles : le couplage est **à sens unique**, géométrie → angles. Un
couplage à sens unique ne peut ni **résister** à un mouvement géométrique (la montée passe à
96.7 %) ni en **produire** un (le moteur cale à 2.7 %). Ce n'est pas un défaut d'arbitrage entre
deux contraintes : c'est un DOF manquant dans la projection du no-slip — et le tour précédent a
montré que le rendre bidirectionnel **segment par segment** le rend complaisant, chaque segment
pouvant alors relâcher `C` en déformant son propre brin.

---

## Mesures brutes

### 1. Écrasement ou partage — `∂θ_new/∂θ_old`, r = 30

Un pin isolé, centre à l'origine, nœud sur la jante. On préécrit θ (ce que fait le no-slip juste
avant dans le balayage) et on regarde ce qu'il en reste après une application.

| w(nœud) | w(centre) | actuel       | coop `unit` | coop `rim` |
| ------- | --------- | ------------ | ----------- | ---------- |
| 0       | 0         | **0.000000** | 0.000000    | 0.000000   |
| 0       | 1         | **0.000000** | 0.001110    | 0.500000   |
| 1       | 0         | 0.500000     | 0.001110    | 0.500000   |
| 1       | 1         | 0.500000     | 0.002217    | 0.666667   |

Lecture ligne à ligne :

- **(0, 0)** — les deux DOF de position ancrés : écrasement total, et **aucune** projection ne
  peut faire autrement. C'est la configuration du Core XY.
- **(0, 1)** — c'est là qu'on voit l'omission : le pin actuel donne 0.000 alors que la projection
  honnête donne 0.500. Le centre existe et pourrait encaisser la moitié ; le code ne le regarde
  pas.
- **(1, ·)** — le pin actuel partage déjà à 50/50. Ce n'est pas un « dernier qui écrit gagne ».

Le résidu laissé après une application vaut **0.00e+0** dans tous les cas : le pin se satisfait
entièrement à chaque passage, donc ne remonte jamais rien.

Sur les deux variantes coopératives : `rim` (mobilité angulaire `w_θ = 1/r²`, qui rend l'angle
d'un engrenage et un point de sa jante également mobiles) **reproduit exactement** le partage
actuel quand le centre est ancré, et ajoute le centre quand il est libre. `unit` (`w_θ = 1`, la
lecture littérale « vraie projection avec la masse d'angle d'aujourd'hui ») fait passer θ à
99.9 % de la correction : elle **aggrave** l'écrasement, parce que dans la métrique cartésienne
un angle de masse 1 rad⁻¹ est r² = 900 fois plus mobile qu'un nœud de jante.

### 2. Absorption en situ — Core XY, angle de la poulie bloquée (`695de818`)

Saisie montée de 100 px sur 30 frames, q-modèle option 1. Par balayage, sur cet angle : ce que
les liens `BeltSegmentNoSlip` demandent, ce que le `GearPerimeterPin` écrit, et le net de fin de
balayage.

| balayage | q demande | pin écrit | net       | net/demande |
| -------- | --------- | --------- | --------- | ----------- |
| 0        | +1.95 rad | −1.95 rad | 3.73e-10  | **0.0000**  |
| 1        | +1.95 rad | −1.95 rad | 1.37e-8   | **0.0000**  |
| 50       | +2.01 rad | −2.01 rad | −1.16e-5  | −0.0000     |
| 150      | +2.01 rad | −2.01 rad | 4.60e-8   | **0.0000**  |
| 250      | +2.01 rad | −2.01 rad | 3.74e-10  | **0.0000**  |
| 299      | +2.01 rad | −2.01 rad | 3.73e-10  | **0.0000**  |

Pire résidu q sur les balayages ≥ 250 : **72.53 px**. Chariot final : Δ = (0.0, −96.7).

C'est la mesure 2 de Q4 refaite avec le budget explicite : elle confirme l'absorption **et** en
nomme l'exécutant. Rien ne progresse entre le balayage 0 et le balayage 299 — ce n'est pas une
convergence lente, c'est un point fixe.

### 3. Le pin coopératif sur le Core XY

30 frames, cible 100 px (les deux premières), 120 frames pour le moteur.

| épreuve                     | φ-modèle      | q + pin actuel | q + coop `unit` | q + coop `rim` |
| --------------------------- | ------------- | -------------- | --------------- | -------------- |
| saisie montée (0, −100)     | (−0.3, −96.8) | (0.0, −96.7)   | (0.0, −96.7)    | (0.0, −96.7)   |
| saisie translation (−100, 0) | (−0.3, 1.0)  | (−96.1, 2.1)   | (−96.1, 2.1)    | (−96.1, 2.1)   |
| moteur seul, 120 frames     | (−0.3, −1.6)  | (−0.0, 0.0)    | (−0.0, 0.0)     | (−0.0, 0.0)    |

**Identiques à la décimale.** Attendu et vérifié : avec `wN = wC = 0`, les trois formules se
réduisent à la même assignation.

Rappel de la cible analytique ([belt-q-model-design.md](./belt-q-model-design.md) §3.2) : une
poulie bloquée ne retire **qu'un** degré de liberté sur deux, `Δy = −0.999·Δx`. Une saisie
verticale pure devrait donc produire une **diagonale** d'environ (+50, −50), et une saisie
horizontale pure environ (−50, +50). Aucune ligne du tableau n'en approche : le φ-modèle sur-bloque
en x (1.1 px au lieu de 71) et laisse tout passer en y ; le q-modèle laisse tout passer dans les
deux directions. Le « blocage en x » que les notes précédentes comptaient comme la non-régression
à préserver n'est donc pas le bon comportement non plus — c'est un blocage total là où il faut un
glissement diagonal.

### 4. L'épreuve moteur-sans-saisie du Core XY est nulle — et voici la preuve

La tâche demandait de tracer le moteur sans saisie (le chariot devant partir en diagonale). Ce
test **ne peut rien départager sur ce mécanisme** : le moteur n'avance que de 2.7 % de sa consigne
et le chariot ne bouge pas — mesures et bissection en tête de note. C'est cohérent avec la limite
déjà notée dans [belt-q-positional-authority.md](./belt-q-positional-authority.md) (« moteur
sur-contraint, test peu discriminant »), mais la cause est maintenant établie et n'est pas une
sur-contrainte du mécanisme : c'est la chaîne q qui bloque le moteur. Les épreuves qui tranchent
restent la saisie et le banc synthétique.

### 5. Blocage DYNAMIQUE — la butée bielle-glissière

Le blocage n'est ni détecté ni déclaré : il **apparaît** en cours de mouvement. Courroie fermée à
5 poulies, tous les centres ancrés (donc `Δh ≡ 0` et `q` uniforme obligé). La poulie g2 porte un
nœud de jante libre, relié par une bielle de 70 px à un patin qui coulisse sur un rail ancré
60 px sous son centre. Avec r₂ = 19.96, la bielle atteint le nœud tant que `sin θ' ≤ 0.501` : g2
tourne **librement sur 2.094 rad** puis ne peut plus. Rien dans le solveur ne connaît cette
butée — c'est un `Distance` et un `SlideOnSegment` qui arrivent à leur point mort. Rampe de
consigne sur le moteur de g0 ; arrêt prédit à **θ(g0) = 1.900 rad**.

| cible | θ(g0)  | suivi     | θ(g2)  | rés. bielle | rés. rail | rés. pin | rés. q |
| ----- | ------ | --------- | ------ | ----------- | --------- | -------- | ------ |
| 0.40  | 0.4000 | 100.0 %   | 0.4410 | 0.000       | 0.000     | 0.000    | 0.000  |
| 1.20  | 1.2000 | 100.0 %   | 1.3229 | 0.000       | 0.000     | 0.000    | 0.000  |
| 1.60  | 1.5999 | 100.0 %   | 1.7637 | 0.002       | 0.001     | 0.000    | 0.002  |
| 2.00  | 1.9808 | 99.0 %    | 2.1437 | 0.780       | 0.390     | 0.222    | 0.621  |
| 2.40  | 2.3166 | 96.5 %    | 2.3803 | 3.932       | 1.966     | 1.471    | 2.689  |
| 2.80  | 2.6818 | **95.8 %** | 2.7103 | **7.670**   | 3.835     | 3.514    | 3.813  |
| 3.20  | 3.2969 | 103.0 %   | 3.8366 | 4.768       | 2.384     | 1.870    | 3.127  |
| 4.00  | 3.9914 | 99.8 %    | 4.3832 | 0.275       | 0.131     | 0.096    | 0.278  |
| 4.80  | 4.8000 | 100.0 %   | 5.2917 | 0.000       | 0.000     | 0.000    | 0.000  |

Trois lectures :

- **La transmission est parfaite tant que rien ne coince** (résidus à 0.000 jusqu'à 1.6) — la
  chaîne q fait correctement son travail sur une poulie libre.
- **La butée ne bloque pas, elle se déchire.** Au pire, le moteur perd 4.2 % pendant que la bielle
  est étirée de 7.67 px et le pin violé de 3.51 px.
- **Puis le mécanisme traverse.** θ(g2) = 5.29 rad en fin de rampe, deux fois et demie sa fenêtre
  mécanique, et tous les résidus retombent à zéro : le solveur a franchi la bande interdite et
  s'est réinstallé de l'autre côté, sans jamais rien signaler.

La variante `rim` reproduit ce tableau à 3 décimales près. La variante `unit` « résiste » à 80 %
mais pour la mauvaise raison : elle viole le no-slip **partout et dès le premier pas** (résidu q
de 3.57 px à la première consigne, 30.4 px à la dernière), y compris dans la zone libre. Ce n'est
pas un blocage, c'est un frottement parasite — et c'est exactement ce que la non-régression (§6)
rejette.

### 6. Non-régression et cas dégénéré

Courroie fermée saine, un moteur sur g0 (cible 0.3), un pin sur un nœud de jante **libre** de g2
— il ne doit rien perturber :

| pin     | θ(g0)      | q par poulie                    | écart max    |
| ------- | ---------- | ------------------------------- | ------------ |
| actuel  | **0.3000** | 6.600 6.600 6.600 6.600 6.600   | **0.000000** |
| `unit`  | 0.2329     | 5.125 2.962 2.342 2.656 2.656   | **2.782902** |
| `rim`   | **0.3000** | 6.600 6.600 6.600 6.600 6.600   | **0.000000** |

`unit` est éliminée. `rim` est neutre.

Cas dégénéré (g1 **et** g2 épinglées par des nœuds ancrés, de part et d'autre d'un même segment) :

| pin     | θ(g0) (cible 0.3) | θ(g1) | θ(g2) | pire résidu q | valeurs finies |
| ------- | ----------------- | ----- | ----- | ------------- | -------------- |
| actuel  | 0.1999            | 0.0157 | 0.0341 | 3.926 px     | oui            |
| `unit`  | 0.1999            | 0.0157 | 0.0341 | 3.926 px     | oui            |
| `rim`   | 0.1999            | 0.0157 | 0.0341 | 3.926 px     | oui            |

Sortie propre, l'incompatibilité restant portée par le résidu. Le dénominateur angulaire redouté
n'est pas atteignable : dans l'option 1 les angles n'ont pas de masse, donc
`denom = rEpsA² + rEpsB²` ne dépend que des rayons. Ce cas dégénéré ne peut apparaître que si on
donne un jour une mobilité aux angles — c'est-à-dire précisément le « flag bloqué » qu'on refuse.

### 7. Vitesse d'établissement du blocage

Courroie fermée de N poulies, géométrie figée, la poulie la plus éloignée du moteur gelée par un
pin ancré. Balayages jusqu'à ce que θ(g0) soit à 1 % de sa valeur finale :

| N poulies | balayages | θ(g0) final (cible 0.3) |
| --------- | --------- | ----------------------- |
| 3         | **3**     | 0.1846                  |
| 5         | **14**    | 0.2044                  |
| 8         | **18**    | 0.1814                  |
| 12        | **41**    | 0.1938                  |
| 16        | **76**    | 0.2064                  |

Sur-linéaire, ≈ O(N²) entre 8 et 16 (×4.2 de balayages pour ×2 de poulies). Cohérent avec le
verdict Q1 (une boucle est un cycle, aucun ordre de balayage n'est causal dans les deux sens) et
**assez lourd pour justifier l'accélérateur global** du tour suivant.

Une remarque à ne pas confondre avec la vitesse : θ(g0) plafonne autour de **0.19** pour une cible
de 0.3, soit un blocage à ~35 % seulement — et ce n'est **pas** un défaut de convergence (tout est
stabilisé bien avant les 400 balayages du banc). C'est l'équilibre des gains Gauss-Seidel :
`applyMotorAngleConstraint` est, lui aussi, une **assignation complète**
([constraint-functions.ts:869](../../src/components/solver/constraint-functions.ts#L869)), donc il
réécrit la cible à chaque balayage et la chaîne q le retire ensuite partiellement. Le « taux de
blocage » mesuré dans toutes les notes précédentes est donc un rapport de gains, pas une grandeur
physique. À garder en tête pour lire les 61 % de Q3 et les 13 % de Q4.

---

## Ce que ce banc établit, et ce qu'il ouvre

**Corriger l'arbitrage du `GearPerimeterPin` ne suffit pas — et sur le Core XY, ne fait
strictement rien.** L'écrasement est réel, mesuré, total, mais c'est la bonne réponse d'une
contrainte dont les deux DOF de position sont ancrés : elle **détermine** θ, elle ne l'absorbe pas
faute de mieux. La correction honnête de son omission (`∂C/∂centre`, variante `rim`) est saine et
neutre — elle vaut d'être faite un jour pour la justesse, pas pour le blocage.

Le maillon fautif est un cran plus bas : **le no-slip de segment n'écrit aucune position**, donc
l'incompatibilité qu'il détecte correctement ne peut atteindre ni le chariot ni le moteur. Le tour
précédent a montré qu'ouvrir cette voie **segment par segment** rend la contrainte complaisante,
chaque segment relâchant `C` en déformant son brin.

Piste pour le tour suivant, **non testée, énoncée pour être vérifiée avant d'être crue** : donner
l'autorité positionnelle à un **agrégat** plutôt qu'à un segment. Entre deux poulies dont le `q`
est tenu (un terminal `q = 0`, une poulie gelée), la somme des lois de segment télescope :

`Σ (q_k − q_{k+1}) = q_premier − q_dernier = 0 = Σ Δh`

c'est-à-dire une équation **purement positionnelle** — la longueur de courroie de ce tronçon,
arcs compris, doit se conserver **à elle seule**. C'est un « `BeltLength` de sous-chaîne », et il
n'a aucun degré de liberté interne pour se satisfaire par déformation : la redistribution entre
brins, qui était la porte de sortie du tour précédent, est exactement ce qu'il interdit. Sur le
Core XY, l'ordre de grandeur attendu est celui du §3.2 du design : **118 px d'incompatibilité**
pour la montée pure. Cela reste une hypothèse — je ne l'ai ni implémentée ni mesurée.

---

## Limites de cette note

- **Le cas « centre libre, nœud ancré » n'existe dans aucun banc réel.** La ligne (0, 1) du
  tableau §1 est mesurée sur un pin isolé ; je n'ai pas trouvé de mécanisme où elle se présente,
  donc l'apport de `rim` n'est démontré que sur cette sonde unitaire.
- **`rim` est un choix de métrique, pas un résultat.** `w_θ = 1/r²` rend l'angle et la jante
  également mobiles ; c'est cohérent, ce n'est pas dérivé d'une mesure. Son seul appui
  expérimental ici est négatif : c'est la seule des deux variantes qui ne casse rien.
- **La butée du §5 est une bande interdite, pas un arrêt franc.** Le mécanisme peut la traverser
  et se réinstaller de l'autre côté — ce qui rend la mesure plus sévère qu'un vrai point mort,
  mais aussi plus représentative d'un blocage dynamique réel.
- **La cible « diagonale » (§3) est reprise du design §3.2, pas remesurée ici.** Les
  sensibilités 1.0030 / 1.0043 px par px viennent de ce tour-là.
- **Rien n'est mesuré sur la piste de la sous-chaîne agrégée.** Elle est énoncée comme lecture
  d'une identité algébrique, pas comme un résultat.
