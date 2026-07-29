# L'agrégat de sous-chaîne — étape B du plan métrique-et-agrégat

Résultat de l'[étape B](./plan-metrique-et-agregat.md). Rien n'est parti en production : le lien
`BeltSubChainAggregate` n'est émis par aucun parseur, et la suite par défaut (331 tests) est verte.

**Le critère de réussite est atteint.** Sur `Core XY - 2 moteurs`, un moteur seul et l'autre à
ω = 0, le chariot part en **diagonale à Δy/Δx = 0.995**, et le moteur censé être immobile bouge de
**0.20°** en 120 frames. C'est la première fois en sept tours.

---

## 1. Le critère de coupure, en une règle

> Quelque chose d'autre que cette courroie a-t-il son mot à dire sur cet angle ?

Le télescopage élimine les `q` intérieurs d'un tronçon ; ce n'est légitime que tant que personne
d'autre n'a d'avis sur eux. Dès que quelqu'un en a un, éliminer cet angle **cache** ce qu'il avait
à dire — donc on coupe là.

Un intéressé peut s'exprimer de deux façons syntaxiques et les deux comptent : en **écrivant**
l'angle (un moteur l'assigne et ne partage aucune clé) ou en **partageant un DOF** avec lui (un pin,
un engrènement, une poutre). Un critère écrit en termes de couplage rate le moteur ; un critère
écrit en termes d'écriture rate le pin. D'où la question unique plutôt qu'une liste de types.

[belt-aggregate.ts](../../src/components/solver/experimental/belt-aggregate.ts) —
`hasStakeholderBeyond(links, angleKey, beltOwner)`. « La mécanique de **cette** courroie » se teste
par `owner`, donc une poulie partagée par deux courroies est un intéressé de chacune.

### Ce que ça donne, sur les 8 mécanismes

| mécanisme | courroie | poulies | coupures | tronçons | déclencheurs |
| --- | --- | --- | --- | --- | --- |
| Poulie bloqueuse | fermée | 4 | **2** | 2 | BeamFollowsAngle, GearPerimeterPin, MotorAngle |
| Core XY - 2 moteurs | ouverte ×2 | 5 | **1** | 2 | MotorAngle |
| Huygen's chain drive | fermée | 4 | **2** | 2 | MotorAngle, GearMeshAngle |
| Core XY | ouverte | 5 | **1** | 2 | MotorAngle |
| Core XY | ouverte | 5 | **0** | 1 | — |
| Core XY modifié | ouverte | 5 | **1** | 2 | MotorAngle |
| Core XY modifié | ouverte | 5 | **1** | 2 | GearPerimeterPin |
| Jansen, Vilbrequin, Test slider | — | — | — | — | aucune courroie |

**Le critère reste sélectif** : jamais plus de 2 coupures, jamais plus de 50 % des poulies, jamais
un tronçon d'un seul brin. On est loin de la dégénérescence en no-slip brin par brin, qui est
mesuré non fonctionnel.

Sur `45060ae2` (Poulie bloqueuse), les **deux** liens qualifient indépendamment : le nœud du pin
n'est pas pendant, `Distance` le tient — c'est un maneton de manivelle. Le critère n'est pas trop
large, `45060ae2` est réellement la poulie par laquelle le point mort entre dans la courroie.

**Règle d'émission :** aucun agrégat si la courroie n'a **aucune** coupure. Son unique tronçon irait
d'un bout mort à l'autre, où l'agrégat *est* `BeltLength` terme pour terme. C'est le cas de la
seconde courroie de `Core XY.slidep`.

---

## 2. La contrainte, et la correction à la formule du plan

Le plan écrivait `C = q_borne + Σ Δh` avec **une** borne. C'est vrai quand l'autre bout est un
terminal mort — le cas du Core XY — et faux sur une boucle fermée coupée deux fois, où chaque
tronçon a **deux** bornes angulaires. La forme générale est

```
C = q_début − q_fin − Σ Δh          (q = 0 pour un bout mort)
```

Gradients : `∂C/∂θ_début = +r·ε`, `∂C/∂θ_fin = −r·ε`, et `∂C/∂c` = somme des gradients par brin. Un
centre **intérieur** est nommé par deux brins consécutifs et reçoit les deux — c'est précisément
pourquoi l'agrégat ne peut pas se relâcher en déformant un brin contre son voisin.

### Validation, avant toute mesure de comportement

| contrôle | Poulie bloqueuse | Core XY | Huygens |
| --- | --- | --- | --- |
| ∇C positions, analytique vs différences finies | 2.2e-9 | 2.8e-9 | 6.3e-9 |
| ∇C angles, FD vs ±r·ε | 0 | 3.6e-15 | 0 |
| `C_agrégat` ≡ `Σ C_brins` (télescopage) | **0** | 2.3e-13 | 4.6e-13 |

---

## 3. Le critère de réussite — atteint

`Core XY - 2 moteurs`, 120 frames, un moteur entraîné, l'autre à ω = 0.

| | Δchariot | Δy/Δx | moteur figé | moteur entraîné |
| --- | --- | --- | --- | --- |
| sans agrégat | (−0.00, −0.00) | — | −0.0000° | **−1.60°** (bloqué) |
| **avec agrégat** | **(31.46, 31.29)** | **0.995** | **−0.2016°** | −119.96° |

Et ce n'est pas qu'une diagonale qualitative. Le moteur tourne de 119.9577°, soit `r·θ = 62.81 px`
de courroie ; la cinématique Core XY d'un moteur seul prédit `Δx = Δy = r·θ/2 = 31.40 px`. Mesuré :
**31.46 et 31.29**, soit **0.9991** de la prédiction analytique. Résidus tous sous 0.27 px.

Sans agrégat, le blocage mutuel du §4 du README est intact : le chariot ne bouge pas et le moteur
n'avance que de 1.6° sur 120 commandés.

---

## 4. Non-régression `Poulie bloqueuse` — dans le garde-fou

400 frames, q-modèle en métrique `rim`.

| | blocage | `Distance` | `SlideOnSegment` | `GearPerimeterPin` | `BeamFollowsAngle` | no-slip | agrégat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sans agrégat | 51.5634° | 1.8338 | 0.8539 | 0.5951 | 0.0524 | 2.6180 | — |
| avec agrégat | 50.8689° | **1.8338** | **0.8539** | **0.5951** | **0.0524** | **1.1636** | 1.9393 |

- Écart de blocage **−0.69°**, dans le garde-fou de ±1°.
- **Aucun lien mécanique n'est davantage violé** — les quatre résidus sont identiques au chiffre
  près. L'agrégat ne déchire rien de nouveau.
- Le no-slip par brin **descend** de 2.618 à 1.164 : l'agrégat absorbe une part de
  l'incompatibilité au lieu de la laisser au brin.

---

## 5. Complaisance — cherchée, pas trouvée

C'est le mode d'échec de deux tours sur cinq. Trois sondes :

**La courroie se déforme-t-elle pour se satisfaire ?** Non. Sous une saisie de 100 px, la dérive de
longueur totale est de **0.008 px au pire**. C'est le point décisif : le tour précédent avait échoué
exactement là.

**La résistance apparaît-elle ?** Oui, et c'est nouveau.

| saisie 100 px / 30 frames | sans agrégat | avec agrégat |
| --- | --- | --- |
| verticale | (0.1, −97.0) | (1.0, 14.2) |
| horizontale | (−99.1, 0.0) | (−0.4, 16.3) |

Le glissement du §1 du README — « on monte le chariot de 97 px sans qu'aucune poulie ne tourne » —
ne passe plus.

> **Correction (étape C).** Ces déplacements ont d'abord été lus comme « 14.2 % de suivi », en les
> comparant au point de départ. C'est faux : les deux moteurs tournent pendant la saisie, donc le
> chariot bouge tout seul. Le témoin sans saisie donne **(0.0, 15.7)** avec agrégat. Le suivi réel
> est l'**écart à cette trajectoire libre**, soit **1.8 px pour 120 px demandés — 1.5 %**. La
> résistance est donc quasi totale, bien plus forte que ce que ce tableau laissait croire. Détail
> dans [solidite-agregat.md](./solidite-agregat.md) §1.

**Le résidu plafonne-t-il ?** Non, il descend de façon monotone sur les 300 balayages :

| balayage | 0 | 1 | 5 | 25 | 50 | 100 | 200 | 299 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pire résidu (px) | 5.6e-4 | 2.6e-1 | 1.7e-1 | 8.4e-2 | 3.7e-2 | 1.1e-2 | 2.7e-3 | **5.5e-4** |

---

## 6. Garde-fou — la concurrence entre agrégats voisins

Deux agrégats voisins partagent leur angle de borne et l'écrivent tous les deux. Sur
`Poulie bloqueuse` (boucle fermée, 2 coupures, donc **les deux** bornes partagées) :

| balayage | angle | demande des agrégats (rad) | net du balayage |
| --- | --- | --- | --- |
| 0 | 45060ae2 | 0.017810 | 0.000000 |
| 0 | 61c0cfee | 0.009439 | 0.000231 |
| 50 | 45060ae2 | 0.017953 | 0.000000 |
| 299 | 45060ae2 | 0.017953 | **0.000000** |

La concurrence est réelle mais **stable** : la demande est intégralement reprise, le net est nul, et
rien ne bouge du balayage 50 au balayage 299. C'est un point fixe, pas une oscillation. Les deux
agrégats se répartissent l'incompatibilité de façon très asymétrique (résidus 1.903 et 0.000) — un
seul la porte.

---

## 7. Limites

- **La résistance de 14 % n'est pas démontrée « correcte ».** Elle est mesurée non nulle, et le
  glissement de 97 % ne passe plus ; que la bonne valeur soit 14 %, 0 % ou autre chose n'est pas
  établi. Les moteurs sont des assignations molles (`stiffness 0.5`) re-ciblées chaque frame, donc
  ce nombre est un équilibre de gains, pas une raideur mécanique.
- **La résistance expose le défaut de déchirure préexistant.** Sous une saisie que le mécanisme
  refuse désormais, `SlideOnSegment` monte à 10 px et `BeltLength` à 3.8 px. Le solveur déchire au
  lieu de s'arrêter (README §6) ; l'agrégat ne cause pas ce défaut, il le rend visible.
- **Le point 6 du plan (somme des agrégats = `BeltLength` en boucle fermée) tient mais est vide de
  sens sur les bancs réels.** Δh ≡ 0 sur les deux bancs fermés — `Poulie bloqueuse` a 0/4 centres
  mobiles, Huygens en a 2/4 mais leur déplacement max est de **2.3e-8 px**. L'identité est vérifiée
  à 1.6e-12 avec tous ses termes nuls.
  *Levé à l'étape C* sur une boucle synthétique à centres libres : la redondance tient **au bit
  près** avec des termes non nuls. Voir [solidite-agregat.md](./solidite-agregat.md) §3.
- **Une coupure unique sur une boucle fermée n'informe pas** : un seul tronçon dont les deux bornes
  sont le même angle, donc `q` s'annule et `C = −Σ Δh` = `BeltLength`. C'est la prédiction de
  l'étape C point 3, confirmée. Il faut **deux** coupures pour qu'une boucle apporte quelque chose.
- **Le piège de découpage.** Sur une boucle, N coupures donnent exactement **N** tronçons : les
  brins après la dernière coupure se referment sur ceux d'avant la première. Une première version
  en produisait N+1, avec un agrégat orphelin de trop.
- **Rien n'est mesuré sur la vitesse** (balayages à convergence avec et sans agrégat), ni sur
  l'interaction avec `sort_links` — c'est le point 4 de l'étape C.
- **Le re-bakage de `h⁰`** (fusion de brins, perte de contact) reste non traité, comme partout
  ailleurs dans ce chantier.
