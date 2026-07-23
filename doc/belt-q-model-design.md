# Conception — le modèle « q » : no-slip par segment au lieu d'un voyage φ partagé

Suite de [belt-closed-diagnostic.md](doc/belt-closed-diagnostic.md) et
[belt-transmission-diagnostic.md](doc/belt-transmission-diagnostic.md), qui ont établi que le
modèle actuel ne donne à toute une courroie qu'**un seul** scalaire de voyage φ, donc ne sait
représenter qu'un flux de matière **uniforme** — alors que Core XY en exige un non uniforme.

Cette note ne modifie aucune contrainte. Elle tranche, par le calcul, si le modèle de
remplacement est correct et sous quelle forme exacte. Harnais jetable :
`scratch/belt-q.test.ts` (géométrie, via les vraies fonctions de `belt-path.ts`) et
`scratch/q_system.py` (algèbre linéaire, `numpy.linalg`, jamais un balayage PBD).

---

## Les deux réponses

**1. Oui, la contrainte de segment doit inclure un terme d'arc explicite.** La forme exacte est

$$q_a - q_b = \Delta h_{ab}, \qquad h_{ab} = \ell_{ab} + u_a - v_b, \qquad q_k = r_k\,\varepsilon_k\,\theta_k$$

où, pour le segment tangent allant de la poulie `a` à la poulie `b` : `ℓ` est la longueur du
brin, `u_a = r_a·ε_a·(angle de départ sur a)` et `v_b = r_b·ε_b·(angle d'arrivée sur b)`. Ce sont
des **demi-arcs** : chaque poulie donne son angle de départ au segment aval et son angle
d'arrivée au segment amont. Preuve : sur une rotation rigide globale (où la vérité est connue,
θ_k = α), la loi avec arcs a un résidu de **4.3e-14 px** et la loi « Δℓ seul » se trompe de
**88 px** — sur un mouvement où tous les Δℓ sont rigoureusement nuls. Le terme ne peut pas non
plus être absorbé par une redéfinition de `q` (§ 2.4), et sur le vrai Core XY il pèse jusqu'à
**22 %** d'un Δ de brin.

**2. Oui, le modèle q a la bonne solution sur les quatre cas** — avec un mode nul, attendu et
identifié, sur la courroie fermée :

| cas                                | verdict                    | chiffre                                                            |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------------ |
| **A** non-régression, 2 poulies    | ✅ identique à l'actuel     | θ₂/θ₁ = 1.600000 (attendu r₁/r₂ = 1.600000)                        |
| **B** poulie bloquée (Core XY)     | ✅ interdit la montée       | incompatibilité **118.08 px** ; débloquée : **0.105 px** (= ΔL)     |
| **C** unicité, courroie ouverte    | ✅ rang plein, unique       | noyau de dimension **0** pour 2, 3, 5 et 8 poulies                  |
| **D** courroie fermée              | ⚠️ noyau de dimension **1** | vecteur nul = `q` uniforme ; une équation d'ancrage referme le rang |

Le mode nul de **D** n'est pas un défaut du modèle q : c'est **exactement** l'indétermination du
§ 3 du diagnostic précédent (facteur 31 entre trois listages du même mécanisme), que le modèle q
ne crée pas mais **nomme**. Ce qu'il faut en faire est discuté en § 3.4.

---

## 1. Conventions — lues, pas devinées

| quantité                | valeur                          | site                                                                                                                                                             |
| ----------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ε                       | `direction ? −1 : 1`            | [constraint-functions.ts:1521](src/components/solver/constraint-functions.ts#L1521), [:1696](src/components/solver/constraint-functions.ts#L1696)                   |
| `arc.startAngle`        | angle d'**arrivée** sur la jante | [belt-path.ts:91](src/utils/belt-path.ts#L91), doc de `belt_arrivals` [:210-223](src/utils/belt-path.ts#L210-L223)                                                 |
| angle de **départ**     | `arrivée + ε·wrap`              | [belt-path.ts:356-357](src/utils/belt-path.ts#L356-L357) (`angle = startAngle + sign·local/r`, `sign = direction ? −1 : 1`)                                        |
| `wrap`                  | ≥ 0, balayage en valeur absolue | [belt-path.ts:19-22](src/utils/belt-path.ts#L19-L22)                                                                                                              |
| origine de `s`          | premier via de la liste, `s` croît dans l'ordre de traversée | [belt-path.ts:99-124](src/utils/belt-path.ts#L99-L124)                                                                              |
| ordre des pièces        | fermée `arc(v0), seg(v0→v1), …` ; ouverte `seg, arc, seg, …` | [belt-path.ts:126-141](src/utils/belt-path.ts#L126-L141)                                                                            |

De là, deux définitions, toutes deux en **px de courroie, mesurées dans le repère du LABO** :

- `q_k = r_k·ε_k·θ_k` : ce que la matière portée par la poulie `k` a avancé dans le sens des `s`
  croissants. C'est le même `r·ε` que `BeltPin` ([:1521](src/components/solver/constraint-functions.ts#L1521)) et que `BeltPhaseGear` ([:1696](src/components/solver/constraint-functions.ts#L1696)).
- `v_k = r_k·ε_k·ψ_arr` et `u_k = r_k·ε_k·ψ_dep = v_k + r_k·wrap_k` : les coordonnées de courroie
  des points de **touche** et de **décollement**. Leur différence `u_k − v_k` est exactement
  l'arc en contact.

Les angles de jante doivent être **déroulés** (continus) d'un état à l'autre : la couture ±π de
`atan2` injecterait `2πr` de courroie fantôme. C'est la correction que `psiArr` fait déjà
([:1196-1206](src/components/solver/constraint-functions.ts#L1196-L1206)) ; le harnais fait la même.

---

## 2. Question 1 — que conserve le no-slip par segment ?

### 2.1 La dérivation (bilan de matière)

Le point de tangence **glisse** sur la jante quand les poulies bougent : l'arc en contact change
sans qu'aucune poulie ne tourne. Il faut donc compter la matière, pas la géométrie.

Sur le brin `a → b`, la matière ne peut entrer qu'au point de décollement de `a` et sortir qu'au
point de touche de `b`. En l'absence de glissement, la matière est immobile **dans le repère de
la poulie** ; ce qui franchit le point de décollement est donc la vitesse relative entre la
matière (`q̇_a`) et le point de décollement lui-même (`u̇_a`) :

$$\dot\ell_{ab} = (\dot q_a - \dot u_a) - (\dot q_b - \dot v_b)$$

qu'on intègre en `q_a − q_b = Δℓ + Δu_a − Δv_b = Δh_ab`. Contrôle de cohérence interne : la
matière stockée sur la poulie `k` vaut `u_k − v_k`, et sa dérivée redonne bien
`(entrée) − (sortie)`.

### 2.2 La falsification : rotation rigide globale

C'est le test qui départage, parce que la vérité y est connue sans passer par le modèle : si
l'assemblage entier tourne de α, chaque poulie tourne de α et rien ne glisse. Or **tous les Δℓ
sont nuls** — une loi « segment seul » y prédirait donc zéro rotation relative.

Montages : courroie ouverte (2 terminaux + 3 poulies r = 50/30/20, sens mixtes) et courroie
fermée (3 poulies r = 45/25/35, sens mixtes), rotation autour d'un point quelconque (37, −19).

| montage | α    | segment | Δℓ    | Δu − Δv | Δh      | vérité `q_a − q_b` | résidu loi arcs | résidu loi Δℓ seule |
| ------- | ---- | ------- | ----- | ------- | ------- | ------------------ | --------------- | ------------------- |
| ouverte | 0.03 | 1→2     | 0.000 | 2.400   | 2.400   | 2.400              | 1.3e-15         | **2.400**           |
| ouverte | 0.4  | 1→2     | 0.000 | 32.000  | 32.000  | 32.000             | 7.1e-15         | **32.000**          |
| ouverte | −1.1 | 1→2     | 0.000 | −88.000 | −88.000 | −88.000            | 0.0e+0          | **−88.000**         |
| fermée  | 0.4  | 0→1     | 0.000 | 28.000  | 28.000  | 28.000             | −2.1e-14        | **28.000**          |
| fermée  | −1.1 | 2→0     | 0.000 | 11.000  | 11.000  | 11.000             | −3.6e-14        | **11.000**          |

Sur les 21 lignes (2 montages × 3 amplitudes) : **résidu max de la loi avec arcs = 4.26e-14 px**,
**résidu max de la loi Δℓ seule = 88.000 px**. Le terme d'arc n'est pas un raffinement, il porte
ici la **totalité** du signal.

Deux contrôles complémentaires : sous translation rigide (θ = 0) `max|Δh| = 2.8e-14 px` ; sous
voyage pur (géométrie figée) `Δh ≡ 0`, donc tous les `q` égaux, donc `θ_k = δ/(r_k ε_k)` — la
transmission classique.

### 2.3 Le montage demandé : poulie du milieu translatée, θ = 0

| translation | segment | Δℓ      | Δ(arc de a) | Δu     | Δv     | Δh      |
| ----------- | ------- | ------- | ----------- | ------ | ------ | ------- |
| (0, 12)     | 1→2     | 2.649   | 2.055       | 2.055  | −1.233 | 5.937   |
| (0, 12)     | 2→3     | −8.937  | 0.275       | −0.959 | 0.639  | −10.535 |
| (0, 60)     | 1→2     | 18.351  | 9.531       | 9.531  | −5.718 | 33.600  |
| (0, 60)     | 2→3     | −40.169 | −0.337      | −6.055 | 4.037  | −50.261 |
| (−35, 45)   | 1→2     | −21.629 | 11.814      | 11.814 | −7.089 | −2.726  |
| (−35, 45)   | 2→3     | −59.691 | 9.474       | 2.386  | −1.590 | −55.715 |

**Rien ne se conserve, et c'est la bonne réponse** : bouger une poulie sans rien faire tourner
n'est pas un mouvement sans glissement. Ce que le tableau montre, c'est que la loi de segment
n'a pas de forme « conservée » à chercher — `Δh` est précisément le **déséquilibre** que les
rotations doivent absorber. La ligne (−35, 45) est la plus instructive : Δℓ = −21.6 sur le
premier brin mais Δh = −2.7, l'arc ayant mangé 87 % du signal.

Le contrôle qui relie ce tableau au diagnostic précédent : **ΣΔh = ΔL total** à
5.7e-14 / 1.4e-13 / −6.4e-14 px près sur les trois amplitudes. Autrement dit, la somme des lois
de segment redonne exactement la loi de longueur totale, dont le gradient est déjà validé à
2.3e-9 par [belt-closed-diagnostic.md](doc/belt-closed-diagnostic.md). L'annulation d'enveloppe
qui fait disparaître les arcs vaut donc **dans la somme, pas segment par segment** — c'est la
réponse directe à la question posée.

### 2.4 Le terme d'arc n'est pas absorbable

On pourrait espérer qu'une meilleure définition de `q` le fasse disparaître. Non : poser
`x_k = q_k − Δu_k` (côté départ) et `y_k = q_k − Δv_k` (côté arrivée) donne certes
`x_a − y_b = Δℓ`, mais `x_k − y_k = −Δ(arc_k)`. Une **seule** variable par poulie ne peut donc
pas encoder les deux côtés, sauf si l'arc est constant. Le terme est irréductible.

### 2.5 Le code contient déjà ce cas particulier

Pour un terminal (r = 0, donc `u = v = 0`), la loi donne `h_S = ℓ_S − v_1` et `h_E = ℓ_E + u_N`.
Ce sont **littéralement** les `hS` / `hE` de `applyBeltLengthConstraint`
([:1210-1218](src/components/solver/constraint-functions.ts#L1210-L1218)), dérivés
indépendamment pour tuer le « V » de la longueur de brin libre. Avec `q_terminal = 0` et `q ≡ φ`,
la loi redonne `d(h_S) = −dφ` et `d(h_E) = +dφ` — exactement le commentaire de
[:1191](src/components/solver/constraint-functions.ts#L1191). Le modèle q **généralise** le
différentiel existant ; il ne le remplace pas par autre chose.

### 2.6 Sur le vrai Core XY, le terme d'arc est gros

Saisie x de 119 px, brins terminaux :

| courroie | segment       | Δℓ      | Δu − Δv | Δh      | poids de l'arc |
| -------- | ------------- | ------- | ------- | ------- | -------------- |
| ba6255f4 | f2eb95e4→E    | −105.18 | −13.47  | −118.65 | 11 %           |
| 05cd7081 | e69a0061→E    | −91.22  | −25.09  | −116.31 | **22 %**       |

Sur ce mécanisme réel, ignorer l'arc fausse le flux de 25 px.

---

## 3. Question 2 — le système q a-t-il les bonnes solutions ?

Inconnues : les `θ_k`, **qui existent déjà**. Une équation par segment tangent. Résolution par
`numpy.linalg.lstsq`. Les Δh du Core XY sont **mesurés** sur le mécanisme réel (`BeltLength`
retirée pour que le chariot suive la saisie ; l'incompatibilité résiduelle du système vaut alors
exactement ΣΔh = ΔL, c'est-à-dire zéro dès que la longueur est active).

### 3.1 A — non-régression

Courroie fermée à 2 poulies (r = 40 / 25, ε = +1), voyage pur. Matrice 2×2, **rang 1**, noyau
`q = (1, 1)` : le flux uniforme. Pour δ = 14.8812 px (le φ mesuré au § 4 du premier diagnostic) :
θ = (0.372, 0.5952) rad, **rapport θ₂/θ₁ = 1.600000** contre r₁/r₂ = 1.600000 attendu.

Le point important n'est pas le rapport, c'est que **le noyau du système q EST le φ partagé de
`BeltPhaseGear`**. Le modèle actuel est le modèle q restreint à son mode uniforme. Là où le flux
est effectivement uniforme, les deux coïncident exactement — il n'y a pas de régression possible.

### 3.2 B — la poulie bloquée du Core XY

La poulie bloquée est identifiée par mesure, pas par lecture du rapport : le `GearPerimeterPin`
du nœud ancré `e8e3059a` porte `centerKey = 1fc55503`, `angleKey = 695de818` — c'est la 2ᵉ poulie
de la courroie `05cd7081`.

**Montée pure (118 px)** — flux requis, courroie par courroie :

| courroie | S   | p1    | p2          | p3      | p4      | p5    | E   |
| -------- | --- | ----- | ----------- | ------- | ------- | ----- | --- |
| ba6255f4 | 0   | −0.00 | 118.10      | 118.08  | 118.06  | 0.02  | 0   |
| 05cd7081 | 0   | 0.02  | **−118.08** | −118.06 | −118.05 | −0.00 | 0   |

Flux franchement **non uniforme** — reproduit le tableau du § 4 du diagnostic précédent
(116.09 px y avait été mesuré à contraintes actives ; ici 118.08 px pour une montée de 118 px,
soit 1.00 px de flux par px de montée).

Verdicts chiffrés :

| système                             | rang     | incompatibilité |
| ----------------------------------- | -------- | --------------- |
| bords libres (poulie **débloquée**) | 5/5 plein | **0.105 px** (= ΔL, donc 0 avec `BeltLength`) |
| avec `q(1fc55503) = 0`              | 4/4 plein | **118.08 px**   |

La montée pure devient donc **impossible**, et débloquer la seule poulie la rend immédiatement
possible. C'est le comportement demandé, et il ne coûte aucun cas particulier : `q_k = r_k ε_k θ_k`,
donc geler `θ_k` gèle `q_k` — le blocage passe par les DOF existants.

**Translation le long du rail (119 px)** — flux requis :

| courroie | S   | p1      | p2          | p3      | p4      | p5      | E   |
| -------- | --- | ------- | ----------- | ------- | ------- | ------- | --- |
| ba6255f4 | 0   | −119.23 | −118.80     | −118.71 | −118.61 | −118.75 | 0   |
| 05cd7081 | 0   | −118.80 | **−118.62** | −118.10 | −117.57 | −116.83 | 0   |

Flux **quasi uniforme**. Voilà, en une ligne, l'asymétrie x/y observée dans le diagnostic
précédent et jamais complètement expliquée : la translation demande un flux uniforme, que le φ
partagé sait représenter — donc elle est correctement transmise et correctement bloquée ; la
montée demande un flux non uniforme, que φ ne sait pas représenter — donc elle passe sans que
rien ne proteste. Ce n'est pas une différence de direction, c'est une différence de **forme du
flux**.

**Le mouvement qui reste permis.** Dérivées locales (déplacements de 11 px, réponse linéaire
vérifiée jusqu'à 119 px) :

- Δx : q(1fc55503) = **1.0030 px par px**
- Δy : q(1fc55503) = **1.0043 px par px**

La condition `q(1fc55503) = 0` s'écrit `1.0030·Δx + 1.0043·Δy = 0`, soit **Δy = −0.999·Δx** :
une **droite** du plan (Δx, Δy), pas l'origine. Une poulie bloquée retire exactement **un** degré
de liberté sur deux : montée pure et translation pure interdites, **diagonale à 45° permise**.
C'est précisément le comportement attendu d'un Core XY dont un moteur est immobilisé.

### 3.3 C — unicité sur une courroie ouverte

Terminaux aux deux bouts, `q = 0` (un bout mort ne fournit pas de matière, qu'il soit libre ou
joint à un corps — son déplacement est déjà compté dans Δℓ).

| poulies | matrice | rang | dim(noyau) |
| ------- | ------- | ---- | ---------- |
| 2       | 3×2     | 2    | **0**      |
| 3       | 4×3     | 3    | **0**      |
| 5       | 6×5     | 5    | **0**      |
| 8       | 9×8     | 8    | **0**      |

**Rang plein en colonnes : solution unique, aucun mode nul.** Il y a une équation surnuméraire,
et une seule : c'est la condition de compatibilité `ΣΔh = ΔL = 0`, que `BeltLength` impose déjà.
Les deux contraintes ne se contredisent pas — la longueur est exactement la somme des no-slips.

### 3.4 D — le mode circulaire de la courroie fermée

| poulies | matrice | rang | dim(noyau) | vecteur nul |
| ------- | ------- | ---- | ---------- | ----------- |
| 2       | 2×2     | 1    | **1**      | q uniforme  |
| 3       | 3×3     | 2    | **1**      | q uniforme  |
| 5       | 5×5     | 4    | **1**      | q uniforme  |

Le noyau est le mode « tous les `q` décalés d'une même constante » : toutes les poulies tournent,
la géométrie ne bouge pas. C'est **mot pour mot** le § 3 du diagnostic précédent — trois listages
du même mécanisme, trois rotations dans un rapport 31, toutes à résidu exactement nul, même
géométrie finale à 0.005 px. Le modèle q ne l'invente pas : il montre que c'était un **mode nul
structurel** de la cinématique, pas un bug de convergence.

Une équation d'ancrage suffit à refermer le rang (4×3 de rang 3, 6×5 de rang 5). Reste à décider
**laquelle** — et c'est une question de modèle, pas de code :

- Une courroie fermée sans rien de matériellement attaché n'a **aucune raison cinématique** de
  choisir un voyage. Le mode est réel (les poulies tournent visiblement) mais non déterminé par
  la géométrie ; il est déterminé par la dynamique, qu'on ne simule pas.
- Le comportement correct en quasi-statique est donc de **ne pas l'exciter** : une projection PBD
  ne bouge que le long des gradients de contrainte, donc un mode qu'aucune contrainte ne voit
  reste où il était — c'est-à-dire « pas de voyage spontané ».
- Le bug actuel n'est pas que le mode existe, c'est que **`BeltPin` l'excite arbitrairement** :
  il lie `θ_ref` à la position d'un nœud de jonction qui, lui, est libre de glisser. Le solveur
  atterrit où l'ordre du balayage le mène.
- Dès qu'un objet est **réellement** attaché à la courroie (un nœud qui la chevauche, un beam
  soudé), ce lien voit le mode et le fixe — légitimement.

**Recommandation : ne pas ajouter d'ancrage artificiel ; retirer le pilote parasite.** À valider
avec toi, c'est la seule décision de la note qui ne se démontre pas numériquement.

---

## 4. Implications code (esquisse — rien à écrire ici)

Les deux réponses étant concluantes, voici la répartition cible. Aucune ligne n'est proposée :
l'implémentation se discutera sur cette base.

- **`applyBeltLengthConstraint`** : garde la longueur totale (gradient validé, § 1 du premier
  diagnostic). **Perd** le no-slip : `simFeed`, `φ`, `diff0`, `nFree`, `startWound`/`endWound`,
  `C_diff` et les `hS`/`hE`. Ils deviennent des cas particuliers de la loi de segment (§ 2.5).
  Elle redevient une contrainte purement positionnelle, identique dans les branches fermée,
  ouverte et édition. Au passage, son résidu remonté cesse d'être trompeur — le défaut de
  diagnostic signalé au § 4 du rapport précédent (`Math.abs(C)` de la longueur seule,
  [:1368](src/components/solver/constraint-functions.ts#L1368)) disparaît de lui-même, puisque le
  no-slip aura ses propres résidus.
- **`applyBeltPhaseGearConstraint`** : **supprimée**, avec le DOF `belt:phi`. Remplacée par
  `applyBeltSegmentNoSlip`, **une instance par segment tangent** (N+1 sur une courroie ouverte à
  N poulies, N sur une fermée), portant `h⁰` baké comme `diff0` l'est aujourd'hui. Chaque
  instance ne touche que deux angles voisins — la transmission devient locale, ce qui devrait
  aussi régler le retard de propagation du § 2 du rapport précédent (~40 balayages pour un
  déplacement de 40 px, parce que tout transitait par un φ central).
- **`applyBeltPinConstraint`** : son rôle bascule. Il ne doit plus être le pont
  positions → angles (les no-slips de segment le sont), mais uniquement la contrainte d'un nœud
  **réellement attaché** à la courroie — auquel cas il fixe légitimement le mode circulaire
  (§ 3.4). Sur le nœud de fermeture, qui n'est pas un point matériel, il ne doit rien piloter.
  Le nom final suit ce rôle : reste à trancher si c'est « le nœud qui chevauche la courroie » ou
  « l'origine matérielle de la boucle » — ce sont deux liens différents, pas deux noms.
- **`applyBeltJunctionConstraint`** : géométrie pure (le nœud reste sur le contour), inchangée
  sur le fond. Elle garde son défaut de pondération `wLine = (wA + wB)/2`
  ([:1433](src/components/solver/constraint-functions.ts#L1433)), à corriger séparément — c'est
  indépendant de ce chantier.
- **Conditions de bord : trois valeurs de `q` dans la MÊME équation**, plus aucun cas particulier :
  - bout mort (libre ou joint à un corps) → `q = 0` ;
  - bout enroulé sur sa poulie (treuil) → `q_bout = q_poulie` (c'est le même point matériel) ;
  - poulie bloquée → **rien à écrire** : `q_k = r_k ε_k θ_k`, et `θ_k` est déjà gelé par son
    `GearPerimeterPin` ancré. C'est ce qui remplace `simFeed`/`wound` et ce qui fait marcher le
    § 3.2.

---

## 5. Limites de cette note

Ce qui est démontré : la **forme** de la loi de segment, et le **rang / les solutions** du système
linéaire qu'elle engendre. Ce qui ne l'est pas, et qu'il ne faut pas m'attribuer :

- **La projection PBD n'est pas testée.** Rang plein ≠ Gauss-Seidel qui converge vite. Le
  conditionnement, l'ordre des balayages, la concurrence entre les N no-slips et la longueur sur
  les mêmes angles : tout cela reste à mesurer, et c'est le vrai risque de l'implémentation.
- **Le choix des DOF écrits par le no-slip de segment** (angles seuls ? angles + positions,
  comme `C_diff` bouge les terminaux aujourd'hui ?) n'est pas tranché ici.
- **Les Δh du Core XY sont mesurés `BeltLength` retirée**, sinon le chariot ne bouge pas. C'est
  une sonde cinématique légitime, mais ce n'est pas le mécanisme en fonctionnement.
- **Le re-bakage de `h⁰`** au moment où une poulie perd le contact (les brins fusionnent) n'est
  pas étudié. Même problème qu'avec `diff0`/`s0` aujourd'hui.
- **Les dégénérescences** (wrap → 0, poulies presque tangentes) ne sont pas couvertes : une poulie
  effleurée se voit imposer le no-slip alors qu'elle ne pourrait rien entraîner. C'est une limite
  préexistante, pas une régression.
- **Le mode circulaire (§ 3.4)** appelle une décision de ta part.

Harnais jetable : `scratch/` (config vitest dédiée, hors `src/`). Rien dans `src/` n'a été touché.
