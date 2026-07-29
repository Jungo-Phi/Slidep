# Solidité du signal et redondance `BeltLength` — étapes C et D

Suite de [agregat-sous-chaine.md](./agregat-sous-chaine.md), qui a fait émerger la diagonale du
Core XY. Ce tour répond à une question : **est-ce une loi ou un point ?**

Réponse courte : une loi. Le signal est exactement proportionnel, la redondance en boucle fermée
tient au bit près, et le critère de coupure est **porteur** — le déplacer casse le résultat.

Banc : [belt-aggregate-robustness.bench.test.ts](../../src/components/solver/belt-aggregate-robustness.bench.test.ts).

---

## 1. Proportionnalité — et une correction au tour précédent

### Le signal moteur est exactement linéaire

`Core XY - 2 moteurs`, un moteur entraîné, l'autre à ω = 0, sur quatre durées :

| frames | Δchariot | Δy/Δx | θ moteur | prédit `r·θ/2` | mesuré/prédit |
| --- | --- | --- | --- | --- | --- |
| 30 | (7.87, 7.82) | 0.994 | −29.99° | 7.85 px | **0.9990** |
| 60 | (15.73, 15.64) | 0.995 | −59.98° | 15.70 px | **0.9990** |
| 120 | (31.46, 31.29) | 0.995 | −119.96° | 31.40 px | **0.9990** |
| 240 | (62.91, 62.58) | 0.995 | −239.91° | 62.81 px | **0.9990** |

Sur un facteur 8 en amplitude, le rapport à la cinématique analytique ne bouge pas d'un chiffre.
Ce n'est pas un point, c'est une droite.

### La correction : le « suivi » du tour précédent était mal lu

Les deux moteurs tournent pendant une saisie, donc **le chariot bouge tout seul**. Comparer son
déplacement au point de départ crédite à la saisie ce que font les moteurs. Le témoin sans saisie :

| | témoin sans saisie |
| --- | --- |
| sans agrégat | (−0.0, −0.0) — le blocage mutuel, les moteurs ne peuvent rien |
| avec agrégat | **(0.0, 15.7)** — les moteurs entraînent enfin le chariot |

Le suivi réel est l'**écart à cette trajectoire libre** :

| amplitude | sans agrégat | avec agrégat |
| --- | --- | --- |
| 10 px | 9.70 px — **97.0 %** | 0.97 px — 9.7 % |
| 30 px | 29.10 px — **97.0 %** | 1.43 px — 4.8 % |
| 60 px | 58.19 px — **97.0 %** | 1.67 px — 2.8 % |
| 120 px | 116.38 px — **97.0 %** | 1.83 px — **1.5 %** |

Deux lectures, et elles sont cohérentes toutes les deux :

- **Sans agrégat, le glissement est parfaitement proportionnel** : 97.0 % à toutes les amplitudes.
  Le bug est un glissement propre, linéaire, sans seuil — ce qui explique qu'aucune sonde ne l'ait
  jamais vu comme une anomalie locale.
- **Avec agrégat, la réponse sature** à ~1.8 px quelle que soit la traction. Tirer 12 fois plus
  fort gagne 0.86 px. **C'est la signature d'une butée, pas d'un ressort** — et c'est ce qu'on veut.

Le critère du plan (« une réponse non linéaire invaliderait la lecture ») visait le signal de
*glissement*, qui est bien linéaire. Une réponse *bloquée* doit saturer ; la confondre avec une
non-linéarité parasite serait une erreur de lecture.

Dérive de longueur de courroie sur toutes ces mesures : **≤ 0.008 px**. Aucune complaisance.

---

## 2. Couper ailleurs — le critère est porteur, pas décoratif

`Core XY`, moteur seul, 120 frames, en déplaçant artificiellement la coupure :

| coupure | agrégats | Δchariot | Δy/Δx | moteur figé |
| --- | --- | --- | --- | --- |
| **critère (poulie motrice)** | 4 | (31.46, 31.29) | **0.995** | **−0.20°** |
| poulie 0 (bout de courroie) | 4 | (50.43, −0.11) | −0.002 | **−94.76°** |
| poulie 2 (milieu) | 4 | (30.84, 30.08) | 0.975 | −1.30° |
| poulies 0 + 2 + motrice | 8 | (32.57, 29.64) | 0.910 | −5.40° |
| toutes les poulies | 12 | (31.20, 31.51) | 1.010 | 0.71° |

**Couper au mauvais endroit détruit le résultat.** À la poulie 0, la diagonale disparaît (mouvement
horizontal pur) et le moteur censé être immobile part de **94.8°**. La raison est exactement celle
qui fonde le critère : la coupure omise à la poulie motrice met son angle **à l'intérieur** d'un
tronçon, où le télescopage l'élimine — et un angle éliminé n'a plus rien à dire sur son propre
mouvement. C'est la confirmation expérimentale du raisonnement, pas une simple corrélation.

**Couper en plus est tolérable.** Ajouter des coupures au-delà du critère dégrade doucement
(0.910 puis 1.010 sur Δy/Δx, moteur figé jusqu'à 5.4°) mais ne casse rien : couper davantage cache
moins d'information, jamais plus. L'asymétrie est saine — le critère donne un **minimum** de
coupures, pas un optimum.

---

## 3. La boucle fermée — la redondance tient, au bit près

Les deux bancs fermés réels sont vides de sens (Δh ≡ 0 : `Poulie bloqueuse` a 0/4 centres mobiles,
Huygens 2/4 mais avec 2.3e-8 px de déplacement). Mesuré sur une **boucle synthétique** de 5 poulies
dont 3 centres sont libres, et — c'est le point — **avant toute résolution**, car à convergence la
longueur est conservée et tous les termes retombent à zéro :

```
déplacement d'un centre de 29.15 px
Δ(longueur totale)              = −11.853371 px
résidus des agrégats  0.000000  +  11.853371  =  11.853371
−Δ(longueur)                    =  11.853371
écart                           =  0.00e+0
```

**Écart nul au dernier bit, avec des termes non nuls.** La redondance mesurée au tour précédent sur
courroie ouverte **se généralise au cas fermé** : la somme des agrégats d'une boucle *est*
`BeltLength`.

Et la prédiction du plan sur la coupure unique est confirmée : une seule coupure donne **un** tronçon
de 5 brins dont les deux bornes sont le même angle (`g0 → g0`), donc `q` s'annule et il reste
`C = −Σ Δh` = `BeltLength`. **Une coupure unique sur une boucle fermée n'apporte rien.** Il en faut
deux.

---

## 4. Étape D — `BeltLength` est un pur préconditionneur, et même pas

Résidu à convergence, et vitesse.

| `Core XY`, moteur seul, 60 frames | résidu agrégat | résidu `BeltLength` | Δchariot |
| --- | --- | --- | --- |
| q seul | — | 2.73e-7 | (−0.00, −0.00) |
| q + agrégats | 5.52e-4 | **2.48e-4** | (15.73, 15.64) |
| q + agrégats, **sans** `BeltLength` | 6.85e-4 | (retirée) | **(15.74, 15.64)** |
| q seul, sans `BeltLength` | — | (retirée) | (0.00, 0.00) |

Sur `Poulie bloqueuse`, 400 frames : résidu `BeltLength` = **0.000e+0 exactement**, avec et sans
agrégats.

Vitesse — pire résidu d'agrégat par balayage :

| balayage | 1 | 5 | 25 | 50 | 100 | 200 | 299 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| avec `BeltLength` | 2.62e-1 | 1.72e-1 | 8.38e-2 | 3.70e-2 | 1.15e-2 | 2.66e-3 | 5.52e-4 |
| sans `BeltLength` | 2.62e-1 | 1.78e-1 | 7.93e-2 | 3.48e-2 | 1.07e-2 | 2.73e-3 | 6.85e-4 |

**Les deux courbes sont indiscernables.** Retirer `BeltLength` ne change ni le résultat (0.01 px sur
le chariot) ni la vitesse de convergence.

**Décision, appuyée par la mesure :** en présence d'une coupure, les agrégats peuvent remplacer
`BeltLength` — leur somme *est* la longueur (§3), son résidu est nul, et elle n'accélère rien. En
l'absence de coupure, on la garde : c'est alors l'agrégat qui serait redondant, et aucun n'est émis.

---

## 5. Limites

- **La vitesse n'est mesurée que là où `BeltLength` n'a rien à faire.** Son intérêt supposé
  (README §5.2 : satisfaire la longueur globalement en un balayage, le O(N) des courroies fermées)
  concerne une **boucle fermée dont la géométrie bouge**. Aucun des deux bancs réels n'en est une —
  `Poulie bloqueuse` est figée. Le verdict « pur préconditionneur » vaut pour le Core XY (courroies
  ouvertes), pas pour le cas qui avait motivé de la garder.
- **Le § 3 est mesuré sur un banc synthétique**, pas sur un mécanisme réel. L'identité est
  algébrique et l'écart est nul au bit près, mais aucun mécanisme du dossier ne l'exerce.
- **Les pourcentages de suivi restent des rapports de gains Gauss-Seidel**, pas des raideurs. Les
  1.5 % disent « la saisie ne passe plus », pas « la raideur vaut tant ».
- **La dégradation du § 2 quand on coupe trop n'est pas expliquée**, seulement constatée (moteur
  figé à 5.4°, Δy/Δx à 0.910). Elle va dans le sens attendu — plus de coupures, moins de `q`
  éliminés, donc un modèle plus proche du no-slip brin par brin qui est mesuré non fonctionnel —
  mais ce lien n'est pas établi ici.
- **Rien n'est mesuré sur l'interaction avec `sort_links`** (point 4 de l'étape C) : l'ordre de
  balayage n'a pas été varié.
- **Le re-bakage de `h⁰`** reste non traité, comme partout dans ce chantier.
