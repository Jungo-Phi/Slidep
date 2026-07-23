# Diagnostic — le pont `BeltPin`, le relais de transmission, et le blocage du Core XY

Suite de [belt-closed-diagnostic.md](doc/belt-closed-diagnostic.md), qui avait établi que le
gradient de `BeltLength` (cas fermé) est exact. Trois questions ici :

1. le gradient de `BeltPin` — le pont positions → angles — est-il correct ?
2. le retard de propagation vers les poulies non-référence persiste-t-il ?
3. quelle est la cause du problème signalé sur « Core XY modifié » ?

Harnais : [belt-transmission-diagnostic.test.ts](src/components/solver/belt-transmission-diagnostic.test.ts)
et [corexy-slip-diagnostic.test.ts](src/components/solver/corexy-slip-diagnostic.test.ts).
Aucune contrainte modifiée, aucune signature touchée, rien de nouveau exporté. Les formules
analytiques sont **transcrites** depuis les contraintes (elles sont inlinées, non appelables) ;
les sites sont cités à chaque fois.

---

## Réponses courtes

1. **Le gradient de `BeltPin` est juste là où la contrainte s'en sert, et incomplet ailleurs.**
   `∂C_T/∂θ_ref = −r·ε` est exact au nœud sur la courroie (écart 1e-9). Mais `∂C_T/∂centre`
   vaut jusqu'à **1.9 px/px** et la contrainte la traite comme **nulle** : elle n'applique
   aucune correction aux centres pour la part tangentielle. Ce n'est pas un gradient faux,
   c'est une **projection incomplète**.
2. **Le retard se résorbe** : résidu no-slip 1e-13 au balayage 51, rapports de transmission
   exacts à 6 décimales. Ce n'est pas le coupable — mais il met ~40 balayages, pas 2-3.
3. **Le glissement du Core XY est réel, et sa cause est que le modèle ne donne à toute une
   courroie qu'UN seul scalaire de voyage φ.** Monter le chariot exige un flux de matière
   **non uniforme** : mesuré, 116 px à travers trois poulies et 0 à travers les deux autres.
   Un φ partagé ne peut représenter qu'un flux uniforme ; le seul flux uniforme compatible est
   zéro. Le solveur choisit donc « aucune rotation », et comme ni `C_sum` (le total, conservé)
   ni `C_diff` (les deux extrémités, inchangées) ne voient la redistribution, **rien ne
   proteste**. Vu de l'extérieur : la courroie glisse sur la poulie bloquée. C'est exactement
   ce qui se passe, au sens propre.

Et un résultat qui ne figurait pas dans les questions, mais qui est le plus lourd :

4. **Sur une courroie fermée, la quantité de voyage n'est pas déterminée par le modèle.** Le
   même mécanisme, résolu à géométrie et saisie identiques, donne θ = 0,0234 / 0,0041 / 0,1277
   rad selon la poulie par laquelle la courroie est listée — un facteur 31 — les trois
   solutions convergeant à résidu exactement nul. **Ça, c'est le glissement.**

---

## 1. Le gradient de `BeltPin`

La contrainte pose le nœud de jonction à `s = s0 + r_ref·ε_ref·(θ_ref − θ_ref0)` et forme le
résidu tangentiel `C_T = (J − P(s))·T(s)`
([constraint-functions.ts:1524-1538](src/components/solver/constraint-functions.ts#L1524-L1538)),
puis le partage entre glisser J et avancer θ_ref
([:1545-1551](src/components/solver/constraint-functions.ts#L1545-L1551)).

Géométrie : 3 poulies asymétriques, r = [50, 30, 20], centres (−120,−30), (140,20), (10,160).
Poulie de référence gA, `r·ε = 50`. ε_θ = 1e-6 rad, ε_c = 0,02 px, différences centrées.

### (b) Par rapport à θ_ref — exact sur la courroie, incomplet en dehors

| placement du nœud      | ∂C_T/∂θ_ref (num) | attendu (−r·ε) | écart relatif |
| ---------------------- | ----------------- | -------------- | ------------- |
| J sur un brin          | −50.000000        | −50.000000     | 2.04e-9       |
| J sur un arc           | −50.000000        | −50.000000     | 1.03e-9       |
| J à 6 px hors courroie | **−56.000000**    | −50.000000     | **1.2e-1**    |

Sur la courroie, exact. À 6 px de la courroie sur un arc de rayon 50, le gradient réel est
−56 = −(r + d)·ε : c'est le terme de courbure `−(J − P)·(dT/ds)·r·ε`, que la contrainte omet.
L'erreur vaut `d/r`, soit 12 % ici. Elle se referme d'elle-même (la part normale ramène J sur
la courroie), donc elle n'est gênante que sur les premiers balayages d'une perturbation forte.

### (a) Par rapport aux centres de poulies — supposé nul, mesuré non nul

| placement              | centre | ∂C_T/∂c (num)      | ‖·‖    | utilisé par la contrainte |
| ---------------------- | ------ | ------------------ | ------ | ------------------------- |
| J sur un brin          | gA     | (−1.1281, −0.1163) | 1.1340 | **0**                     |
| J sur un brin          | gB     | (0.0000, 0.0000)   | 0.0000 | 0                         |
| J sur un brin          | gC     | (0.1631, −0.1462)  | 0.2191 | **0**                     |
| J sur un arc           | gA     | (−0.1631, 1.1462)  | 1.1577 | **0**                     |
| J sur un arc           | gB     | (0.0000, 0.0000)   | 0.0000 | 0                         |
| J sur un arc           | gC     | (0.1631, −0.1462)  | 0.2191 | **0**                     |
| J à 6 px hors courroie | gA     | (−0.1827, 1.1637)  | 1.1780 | **0**                     |
| J à 6 px hors courroie | gC     | (0.1827, −0.1637)  | 0.2453 | **0**                     |

Le gradient par rapport aux centres est du **même ordre** que ceux dont la projection se sert
(‖∇_J‖ = 1, ‖∇_σ‖ = 1 en px de courroie). Ce n'est pas un petit terme négligé.

Le zéro exact sur gB n'est pas une anomalie : le découpage place `s` sur l'arc de gA ou sur le
brin gA→gB, et la position du point à abscisse fixe n'y dépend pas de la poulie **en aval** —
même annulation d'enveloppe que pour `∂L/∂c`. Autrement dit `∂C_T/∂c` est non nul pour les
poulies en amont de `s` et nul pour celles en aval. Ce qui mène directement au point suivant.

### Le résidu dépend de l'origine du paramétrage

`s` est compté depuis le premier via de la liste. Même géométrie, même point de jonction, liste
tournée :

| origine | ∂C_T/∂c pour gA | pour gB | pour gC |
| ------- | --------------- | ------- | ------- |
| via gA  | 1.1340          | 0.0000  | 0.2191  |
| via gB  | 1.8890          | 1.0993  | 1.4417  |
| via gC  | 1.9181          | 0.1048  | 1.1048  |

Écart max **1.60 par px de déplacement de centre**, sur un mécanisme rigoureusement identique.

---

## 2. Le retard de propagation

3 poulies (r = 50, 30, 20), gA ancrée et poulie de référence, jeu de liens complet
(`BeltLength` + `BeltPin` + 3 × `BeltPhaseGear`), gC tirée de 40 px. Angles reconstruits
balayage par balayage depuis `collect_solver_trace`. Résidu no-slip d'une poulie : `|r·ε·θ − φ|`.

| balayage | θ_gA     | θ_gB     | θ_gC     | φ      | no-slip gB   | no-slip gC |
| -------- | -------- | -------- | -------- | ------ | ------------ | ---------- |
| 1        | 0.007884 | 0.006570 | 0.004928 | 0.0986 | 9.86e-2      | 1.4e-17    |
| 3        | 0.020420 | 0.024690 | 0.025504 | 0.5101 | **2.31e-1**  | 0.00e+0    |
| 5        | 0.023216 | 0.034895 | 0.044208 | 0.8842 | 1.63e-1      | 0.00e+0    |
| 10       | 0.023476 | 0.039007 | 0.057765 | 1.1553 | 1.49e-2      | 0.00e+0    |
| 15       | 0.023434 | 0.039062 | 0.058572 | 1.1714 | 4.25e-4      | 2.2e-16    |
| 20       | 0.023424 | 0.039042 | 0.058567 | 1.1713 | 7.19e-5      | 2.2e-16    |
| 40       | 0.023424 | 0.039040 | 0.058560 | 1.1712 | 2.54e-10     | 0.00e+0    |
| 51       | 0.023424 | 0.039040 | 0.058560 | 1.1712 | **1.19e-13** | 0.00e+0    |

Rapports finaux : θ_gB/θ_gA = 1.666667 (attendu r_A/r_B = 1.666667), θ_gC/θ_gA = 2.500000
(attendu 2.500000). **Exacts.**

**Verdict : le retard se résorbe.** Il culmine à 0,23 px de désynchronisation au balayage 3,
décroît, et tombe à 1e-13 au balayage 51 — le solveur en fait 300. Ce n'est pas le coupable.

Deux remarques honnêtes :

- Le résidu de gC est **exactement nul à chaque balayage** alors que celui de gB traîne. Ce
  n'est pas physique, c'est l'ordre du balayage : le `BeltPhaseGear` de gC est appliqué en
  dernier, donc gC est toujours exact en fin de balayage, et gB est périmé de tout ce que φ a
  bougé après son propre passage. La « désynchronisation » mesurée en fin de balayage est donc
  un artefact d'ordre — mais elle mesure bien la vitesse à laquelle le relais rattrape.
- 40 balayages pour un déplacement de 40 px, c'est lent. Dans une frame à 300 itérations ça
  passe ; sur un mécanisme plus gros qui consomme ses itérations ailleurs, moins sûr. Je ne l'ai
  pas mesuré sur un cas chargé.

---

## 3. Ce que le modèle ne détermine pas (le vrai glissement)

Puisque le retard n'explique rien, j'ai testé l'invariance qu'on est en droit d'exiger : **le
même mécanisme, résolu de trois façons de le lister, doit donner le même mouvement.**

Cas identique au précédent (gC tirée de 40 px), seule change la poulie par laquelle la courroie
est listée. `s0` est recalculé par `belt_project` sur le même point physique, `refAngleKey`
reste gA.

| 1ʳᵉ poulie listée | θ_gA         | θ_gB     | θ_gC     | φ      | résidu max restant |
| ----------------- | ------------ | -------- | -------- | ------ | ------------------ |
| gA                | 0.023424     | 0.039040 | 0.058560 | 1.1712 | **0.00e+0**        |
| gB                | 0.004117     | 0.006862 | 0.010292 | 0.2058 | **0.00e+0**        |
| gC                | **0.127667** | 0.212778 | 0.319166 | 6.3833 | **0.00e+0**        |

Écart sur θ_gA : 0,1236 rad, soit **96,8 %** de la rotation. Facteur 31 entre les extrêmes.

Le point décisif est la dernière colonne, doublée par les positions finales : **les trois
convergent complètement**, aucun lien insatisfait, et la **géométrie finale est la même** (gB
arrive en (138.771, 20.323), (138.771, 20.321), (138.776, 20.335) — 0,005 px d'écart). Seuls
diffèrent les angles et la position du nœud de jonction sur la courroie.

Donc ce ne sont pas trois convergences ratées : ce sont **trois solutions également valides**.
Le système contraint la géométrie mais pas le voyage de la courroie. Il reste un mode libre —
faire glisser J le long de la courroie en tournant les poulies d'autant — que rien ne fixe, et
le solveur atterrit où l'ordre du balayage le mène.

C'est cohérent avec le diagnostic précédent : sur une courroie fermée, `BeltLength` n'écrit
aucun angle, et le seul pont vers les angles est `BeltPin`, dont le nœud de jonction est
lui-même libre. Le couple (J le long de la courroie, θ_ref) a donc un degré de liberté non
contraint.

**Je ne dis pas quelle est la bonne valeur du voyage.** C'est une question de modèle : il
manque une équation, pas un signe.

---

## 4. « Core XY modifié » — un blocage, pas un glissement

### Le mécanisme

44 éléments, 10 poulies, 3 sliders, **2 courroies toutes deux OUVERTES** (`closed: false`),
5 poulies chacune, les deux extrémités jointes au chariot central `4771336b` (−402.8, 52.5).
Un moteur ω = 0,209 rad/s sur la poulie `2aca3c1f`.

Première conséquence : **ce mécanisme n'exerce pas du tout la branche fermée** validée dans le
rapport précédent. Il passe par la branche `simFeed` (terminaux + φ + différentiel).

### Ce qu'on observe

Saisie du chariot, −120 px, aller-retour, moteur retiré pour isoler :

| axe                 | suivi de la saisie | rotation des poulies | hystérésis | L − L0 final |
| ------------------- | ------------------ | -------------------- | ---------- | ------------ |
| x (le long du rail) | **1,1 %**          | 0                    | 0          | −0.0000 px   |
| y (le rail monte)   | **102,7 %**        | 0                    | 0          | 0.0000 px    |

Avec le moteur et sans saisie : le chariot parcourt 1,6 px en 120 frames et le moteur est
signalé bloqué à chaque frame.

La poulie bloquée est **voulue** : c'est le montage de test. Avec un moteur immobilisé, un
Core XY ne doit plus autoriser qu'un mouvement **diagonal**. Le blocage en x est donc le
comportement correct, et ce n'est pas lui qu'il faut expliquer. Ce qui cloche est la ligne
suivante : **la montée verticale passe entièrement, sans rotation et sans contrainte violée**,
alors qu'elle devrait être interdite tout autant que l'horizontale.

Il n'y a par ailleurs aucune dérive : pas d'hystérésis, longueurs conservées à 1e-4 px,
retour au point de départ à 0,0003 px. Le glissement n'est pas une dérive accumulée — c'est un
mouvement entier que la courroie laisse passer.

### Pourquoi ce n'est pas la courroie qui devrait bloquer

Contrainte `BeltLength` retirée, le chariot suit la saisie ; on mesure alors la longueur
_tracée_ des courroies en fonction de son déplacement :

| axe | sensibilité dL/d(déplacement), courroie 0 | courroie 1   |
| --- | ----------------------------------------- | ------------ |
| x   | 0.0047 px/px                              | 0.0262 px/px |
| y   | −0.0009 px/px                             | 0.0009 px/px |

Les courroies sont quasi **neutres en longueur** dans les deux directions. Une courroie
inextensible n'a donc presque rien à opposer — et pourtant le suivi en x est de 1,1 %.

### La bissection

Consigne −120 px en x, 60 frames, moteur retiré :

| liens retirés                    | x final | suivi      | insatisfaits en fin |
| -------------------------------- | ------- | ---------- | ------------------- |
| aucun (référence)                | −402.8  | **0,0 %**  | —                   |
| − `BeltLength`                   | −520.1  | **97,8 %** | —                   |
| − `BeltPhaseGear`                | −504.8  | 85,0 %     | 17 liens déchirés   |
| − `BeltLength` − `BeltPhaseGear` | −520.1  | 97,8 %     | —                   |
| − `GearPerimeterPin`             | −490.5  | 73,1 %     | 18 liens déchirés   |
| − `Angle`                        | −403.2  | 0,3 %      | —                   |
| − `SlideOnSegment`               | −402.8  | 0,0 %      | —                   |

Ce sont les `BeltLength` qui verrouillent. Et retirer le seul `GearPerimeterPin` libère aussi,
ce qui désigne le chemin du blocage.

### Ce que le modèle voit de la montée : rien

Les deux quantités qui pilotent le voyage sont mesurées nulles pendant 116 px de montée :

| déplacement | φ₀     | Δh_S  | Δh_E  | Δ(h_S−h_E) | Δ(h_S+h_E) | C_diff₀ | ΔL    |
| ----------- | ------ | ----- | ----- | ---------- | ---------- | ------- | ----- |
| 5.0         | −0.000 | 0.002 | 0.002 | 0.000      | 0.004      | −0.000  | 0.000 |
| 52.1        | −0.000 | 0.002 | 0.002 | 0.000      | 0.004      | −0.000  | 0.000 |
| 116.1       | −0.000 | 0.002 | 0.002 | 0.000      | 0.004      | −0.000  | 0.000 |

`C_sum` (le total) est conservé, `C_diff` (les deux extrémités) est inchangé. Les deux
contraintes sont satisfaites, donc rien n'est signalé — et rien ne tourne.

### Ce qui bouge réellement : la redistribution interne

Brin par brin, sur la même montée de 116,1 px (contraintes actives) :

**Courroie `ba6255f4`**

| pièce             | au repos | après   | Δ           |
| ----------------- | -------- | ------- | ----------- |
| S→49f7cd61        | 912.06   | 912.07  | —           |
| arc 49f7cd61      | 47.04    | 47.04   | —           |
| 49f7cd61→2dce1f85 | 602.35   | 486.25  | **−116.09** |
| arc 2dce1f85      | 47.12    | 47.12   | —           |
| 2dce1f85→41ca57be | 1139.98  | 1139.98 | —           |
| arc 41ca57be      | 47.12    | 47.12   | —           |
| 41ca57be→7ecfed8a | 1200.00  | 1200.00 | —           |
| arc 7ecfed8a      | 94.25    | 94.25   | —           |
| 7ecfed8a→f2eb95e4 | 498.95   | 615.03  | **+116.09** |
| arc f2eb95e4      | 48.23    | 48.23   | —           |
| f2eb95e4→E        | 107.00   | 107.00  | —           |

Somme des Δ : 0,000 px. **Courroie `05cd7081`** : même chose en miroir, `ce6252dd→1fc55503`
gagne +116,09 et `94d82b46→e69a0061` perd −116,09.

Les deux brins terminaux sont inchangés, tous les arcs sont inchangés (donc aucune poulie n'a
tourné), et 116 px de courroie ont changé de camp **entre deux brins intermédiaires**. C'est
précisément l'endroit où ni `C_sum` ni `C_diff` ne regardent.

### La cause : un seul φ pour toute la courroie

Aucune courroie n'est stockée sur une poulie (son arc est constant), donc le flux de matière
traversant deux poulies consécutives diffère exactement de la variation du brin entre elles :
`ΔL(brin k) = q_k − q_{k+1}`, avec `q = 0` aux deux extrémités (une extrémité ne fournit pas de
matière). Résolu de proche en proche à partir des Δ ci-dessus :

| courroie   | poulie   | flux requis (px) | rotation requise (rad) |
| ---------- | -------- | ---------------- | ---------------------- |
| `ba6255f4` | 49f7cd61 | −0.00            | 0.000                  |
| `ba6255f4` | 2dce1f85 | **116.09**       | **3.870**              |
| `ba6255f4` | 41ca57be | **116.09**       | **3.870**              |
| `ba6255f4` | 7ecfed8a | **116.09**       | **3.870**              |
| `ba6255f4` | f2eb95e4 | 0.00             | 0.000                  |
| `05cd7081` | ce6252dd | 0.00             | 0.000                  |
| `05cd7081` | 1fc55503 | **−116.09**      | **−3.870**             |
| `05cd7081` | 344a2f5a | **−116.09**      | **−3.870**             |
| `05cd7081` | 94d82b46 | **−116.09**      | **−3.870**             |
| `05cd7081` | e69a0061 | −0.00            | 0.000                  |

**Le flux n'est pas uniforme.** Trois poulies doivent tourner de 3,87 rad, deux ne doivent pas
tourner du tout — c'est la mécanique correcte : les poulies portées par le portique voient
passer autant de matière d'un côté que de l'autre, les poulies du bâti encaissent tout le
transfert.

Or `BeltPhaseGear` impose `r_k·ε_k·θ_k = φ` à **toutes** les poulies de la courroie avec le
**même** φ ([constraint-functions.ts:1696-1700](src/components/solver/constraint-functions.ts#L1696-L1700)).
Un φ unique ne peut représenter qu'un flux **uniforme**. Le seul flux uniforme compatible avec
`q = 0` aux extrémités est `q ≡ 0`. Le solveur prend donc l'unique solution que son modèle
autorise — aucune rotation — et comme `C_sum` et `C_diff` sont satisfaites, aucune contrainte
ne proteste.

**C'est ça, le glissement.** La courroie traverse les poulies sans les entraîner parce que le
modèle n'a pas de variable pour dire qu'elle les entraîne différemment. Le no-slip n'est
imposé qu'aux **extrémités** (via `C_diff`) et, sur une courroie fermée, à la **jonction** (via
`BeltPin`) — jamais **poulie par poulie**.

### Le rôle exact de la poulie bloquée

Il est maintenant net, et c'est le meilleur contrôle du diagnostic. Le tableau ci-dessus dit
que la montée verticale exige **−116,09 px de flux à travers `1fc55503`** — précisément la
poulie que l'utilisateur a immobilisée. Dans un modèle correct, ce flux est interdit, donc la
montée pure est impossible et le chariot n'a plus qu'un mouvement diagonal : exactement le
comportement attendu. Le modèle actuel n'a aucun moyen d'exprimer « le flux à travers cette
poulie-ci est nul » séparément de « le flux dans toute la courroie est nul », donc l'interdit ne
s'applique jamais localement.

Confirmation en dé-ancrant ce seul nœud (rien d'autre ne change), sur la saisie horizontale :

| mécanisme           | x final | suivi      | φ courroie 0 | φ courroie 1 |
| ------------------- | ------- | ---------- | ------------ | ------------ |
| tel quel            | −402.8  | **0,0 %**  | −0.01        | −0.00        |
| `e8e3059a` dé-ancré | −498.4  | **79,7 %** | −76.09       | −107.31      |

L'horizontale, elle, est bien vue : elle change `Δ(h_S − h_E)` (0,021 px), donc elle passe par
`C_diff`, donc elle est bloquée par φ gelé. C'est la seule direction que le modèle sait
contraindre — d'où l'asymétrie x/y observée.

### Un défaut de diagnostic, au passage

`applyBeltLengthConstraint` retourne `Math.abs(C)` où `C = length − targetLength`
([:1368](src/components/solver/constraint-functions.ts#L1368)) : le résidu remonté est celui de
la **longueur seule**. `C_diff` n'y entre jamais. Un no-slip violé est donc **invisible** dans
les diagnostics — ce qui explique la colonne « insatisfaits : — » alors que le mécanisme est
manifestement bloqué. C'est aussi ce qui a rendu ce blocage difficile à voir depuis l'UI.

---

## Ce qui reste ouvert

- La bonne valeur du voyage sur une courroie fermée (§3) : équation manquante, à décider.
- Faut-il que `BeltPin` corrige aussi les centres (§1) ? Ça le rendrait symétrique, mais ça le
  ferait entrer en concurrence avec `BeltLength` sur les mêmes DOF — je n'ai pas mesuré ce que
  ça produirait.
- Le terme de courbure manquant hors courroie (§1) : mesuré, jamais vu nuire ici.
- **Le no-slip par poulie (§4)** : c'est le vrai chantier. Il faudrait que chaque poulie porte
  son propre flux plutôt qu'un φ partagé — ce qui est aussi ce qui manque au §3. Je n'ai pas
  cherché la formulation, c'est une décision de modèle.
- Rien à signaler à l'utilisateur : bloquer une poulie est un montage légitime, et le mécanisme
  n'est pas en faute. C'est le solveur qui doit refuser la montée, pas l'UI qui doit prévenir.
