# Déconnexion en simulation — étape C du plan avant-prod

Une poulie qui atteint la limite de tangence se **détache**, et les deux brins adjacents fusionnent.
Le `h⁰` du q-modèle est baké par brin : le brin fusionné n'en a pas, et les deux anciens sont
périmés. Jamais mesuré en huit tours.

**Verdict : la production traverse la transition proprement, et l'irréversibilité ne coûte
quasiment rien.** Le défaut prédit côté q est bien là — rien ne retire les liens qui nomment la
poulie partie — mais son poids dépend beaucoup de la configuration.

Banc : [belt-disconnect.bench.test.ts](../../src/components/solver/belt-disconnect.bench.test.ts),
sur `test-mechanisms/Déconnexion courroie.slidep`.

---

## 0. Le mécanisme

Courroie **fermée**, 3 poulies : r = 80 ancrée et motorisée, r = 50 libre, r = 100 libre, les deux
centres libres portés par des glissières. Une **seule coupure** (`GearPerimeterPin` + `MotorAngle`
sur la poulie ancrée). La poulie de r = 50 se détache à la **frame 180** en production.

> **Piège de mesure, à ne pas refaire.** Recalculer la longueur de courroie depuis la géométrie
> brute — sans le masque `disconnected` ni les enroulements continus — la fait sauter de 2πr = 314 px
> quand un enroulement traverse la couture 0/2π. C'est exactement la signature de la courroie
> fantôme qu'on cherche. Lire la longueur sur la boucle **réduite**, avec `wraps`.

---

## 1 et 2. Saut et résidus : la production est propre

Longueur constante à **1579.812 px** sur 400 frames, à 1e-4 près à travers la transition. Le pire
résidu reste à ~1e-2 (`Distance`) et **descend** en traversant (1.03e-2 → 6.4e-3). Un seul
soubresaut : un centre bouge de 0.96 px sur la frame de transition contre 0.01–0.05 avant, puis se
range. Le re-bakage existant fait son travail — `rewire_belt_mesh` retire le `BeltPhaseGear`,
`rebake_belt_pin_refs` re-projette `s0` et remet `θ⁰` à maintenant.

Le q-modèle, lui, oscille de ±3.5 px de longueur dès la frame 179 et déplace la jonction de 7 à
27 px par frame après la transition. La transition elle-même se **décale** : frame 184 (q +
agrégats), 191 (q seul), 197 (q + 2 coupures forcées), contre 180 en production.

---

## 3. L'irréversibilité ne coûte presque rien

Le témoin à 170 frames ne franchit pas la tangence : il sépare la dérive d'intégration ordinaire du
coût du détachement.

| modèle | demi-tour | détache | écart position | poulies restées | poulie détachée | dérive longueur |
| --- | --- | --- | --- | --- | --- | --- |
| φ | 170 | non | 4.19 px | 3.00° / 2.40° | — | 0.0001 |
| **φ** | **200** | **oui** | **8.42 px** | **3.01° / 2.40°** | **286.26°** | **0.0001** |
| q seul | 200 | oui | 320.14 px | 231.53° / 131.69° | 387.41° | 0.0000 |
| q + agrégats | 200 | oui | 162.47 px | 117.14° / 95.39° | 133.89° | −11.41 |

Les 286° ne sont **pas** une hystérésis : c'est la poulie détachée, et une poulie qui a quitté la
courroie garde légitimement sa phase. Les deux poulies restées dessus reviennent à 3.01° et 2.40°,
chiffre pour chiffre identiques au témoin. Le seul vrai coût est **8.4 px contre 4.2 au témoin**.

**Il est acceptable de brancher sans traiter le rattachement.**

---

## 4. Le `h⁰` périmé, confirmé

Après la déconnexion, les liens q **nomment toujours** la poulie détachée : 3 `BeltSegmentNoSlip` et
1 `BeltSubChainAggregate`. Rien ne les retire ni ne les reconstruit — il n'existe aucun équivalent
du `rewire_belt_mesh` côté q. Leur résidu monte à **315 px** à la frame 219 et continue.

Le cas dégénéré au voisinage est réel aussi : sous 0.02 rad d'enroulement, le no-slip sur la poulie
effleurée devient erratique — 0.16 px à la frame 179, 3.47 à la 181.

**Mais l'essentiel du désastre vient d'ailleurs.** Cette boucle fermée n'a qu'**une** coupure, cas
démontré dégénéré ([agregat-sous-chaine.md](./agregat-sous-chaine.md) §7). Avec une seconde coupure
forcée :

| coupures | frame 100 (avant) | transition | frame 219 (après) |
| --- | --- | --- | --- |
| 1 — le critère | no-slip 5.3e-1, agrégat 8.5e-1 | 184 | no-slip **3.15e+2** |
| 2 — forcée | no-slip 5.1e-1, agrégat 7.5e-1 | 197 | no-slip **2.2e-1** |

Le re-bakage manquant pèse **0.22 px sur un jeu de coupures sain**, pas 315.

---

## 5. Proposition — le re-bakage n'a pas besoin de nouvelle arithmétique

`buildBeltSegmentNoSlipLinks` et `buildBeltAggregateLinks` prennent `(positions, angles, spec)` et
bakent `h⁰`, `θ⁰`, `arrivals`, `segIndices` depuis l'état qu'on leur passe. Sur un événement de
déconnexion : **jeter tous les liens q de la courroie et rappeler les deux builders sur la liste de
vias courante, avec l'état courant**.

- le `h⁰` du brin fusionné n'est pas dérivé des deux anciens, il est **calculé** ;
- le jeu de coupures est recalculé par `beltCutAngles`, donc une coupure portée par une poulie qui
  part se traite sans cas particulier ;
- **aucun saut par construction** : baker contre l'état courant met `C = 0` à l'instant du rebuild —
  le procédé exact de `rebake_belt_pin_refs` ;
- le rattachement est **le même appel** avec une liste de vias plus longue.

Le rebuild remet l'origine des `q` à maintenant. Rien de physique n'est perdu : `q = r·ε·(θ − θ⁰)`
est un défilement *relatif* depuis le bakage.

### Ce qu'il faut construire pour voir revenir une poulie

1. **Un test de rattachement**, qui n'existe pas. `update_belt_disconnects` fait
   `if (link.disconnected[i]) continue` **avant** de construire les vias : l'enroulement d'une poulie
   détachée n'est jamais calculé. Il faut reconstruire la liste **avec** elle et lire l'enroulement
   qui en sort. À la tangence exacte, insérer une poulie tangente ajoute un arc nul et ne change pas
   le brin — les deux tests coïncident donc **exactement à la frontière**.
2. **Le ré-amorçage de l'état continu** : `wraps[gi]` reste figé sur sa valeur négative (−0.0012,
   −0.00021, −0.00781 selon les cas) et `arrivals[gi]` est périmé de toute la durée du détachement.
   Les ré-amorcer sur la valeur brute, comme le fait la branche `seeding` de la première frame.
3. **`rewire_belt_mesh` doit devenir réversible** — elle *supprime* les `BeltPhaseGear`. Si l'étape F
   supprime `BeltPhaseGear` du modèle, ce point s'évapore.
4. **`rebake_belt_pin_refs` au rattachement aussi** : la boucle s'allonge, `s0` se décale.
5. **Le seuil d'hystérésis.**

### Sur le battement

Le coût *géométrique* d'un détachement étant négligeable (§3), le danger du battement n'est pas là.
Il est que **chaque rebake remet l'origine des `q` à maintenant** : un battement à chaque frame
rendrait le no-slip définitivement aveugle, incapable d'accumuler le moindre défilement. Ça plaide
pour une hystérésis, mais pour cette raison-là. Seuil à exprimer en **longueur d'arc** (`r·ε`) plutôt
qu'en angle, pour qu'il se comporte pareil sur une poulie de 50 et une de 400 px. Valeur à fixer
après avoir mesuré un battement réel — ce banc ne montre qu'une traversée.

---

## 6. Un fil ouvert : la déchirure q de ce mécanisme

Le q-modèle porte ici **0.82 px de résidu permanent** là où la production est à 3e-3, avec une fuite
de longueur de 1.3 px pour 100 frames. Huit portes fermées, cause **non identifiée** :

| candidat | verdict |
| --- | --- |
| La jonction `BeltPin` / `BeltFollowsTangent` | non — ablation sans effet, au chiffre près |
| Le nombre de coupures | non — 2 coupures forcées : 0.747 contre 0.851 |
| Une accumulation au fil des frames | non — 1.38 px dès la frame 1, sans croissance |
| Un défaut de bakage | non — **4.37e-14** au balayage 0 de la frame 0 |
| Des centres mobiles sur boucle fermée | non — Huygens en déplace 173 px et reste à 2e-4 |
| Un centre sur glissière (mobilité anisotrope) | non — identique à une barre `Distance`, 9.38e-7 |
| Une courroie croisée (sens mixtes) | non — universel dans le dossier, et synthétique à 1e-7 |
| Un blocage légitime | non — le moteur atteint **99.99° sur 100.00°** |

Bancs d'élimination : [belt-q-tear.bench.test.ts](../../src/components/solver/belt-q-tear.bench.test.ts).

**Remise à l'échelle** : 0.82 px sur une courroie de 1580 px, soit 0.05 % ; la fuite vaut 0.08 %. À
comparer aux résidus déjà tenus pour légitimes ailleurs — 1.94 px au point mort de
`Poulie bloqueuse`, 2.93 px sur Huygens en production. La déchirure n'accumule pas, ne bloque pas, et
n'affecte pas le mouvement entraîné. **Défaut de qualité, pas obstacle au branchement.**

Le même test montre d'ailleurs le q-modèle meilleur que la production sur deux bancs sur trois :

| mécanisme | φ : suivi moteur | φ : résidu | q : suivi moteur | q : résidu |
| --- | --- | --- | --- | --- |
| Déconnexion courroie | 100.0 % | 3.0e-3 | 100.0 % | 8.2e-1 |
| Huygen's chain drive | **58.5 %** | 2.93 | **100.0 %** | **2.1e-4** |
| Poulie bloqueuse | 52.3 % | 3.49 | 50.9 % | 1.94 *(point mort voulu)* |

Reste non testé : le nombre de poulies (3, contre 4 et 5 ailleurs), et une poulie dont l'enroulement
est petit dès le départ (0.95 rad) et décroît vers zéro — ce mécanisme est **conçu** pour approcher
la tangence, ce qu'aucun autre banc ne fait.

---

## 7. Limites

- **Un seul mécanisme, une seule poulie, un seul événement de détachement.**
- **Le rattachement n'est pas mesurable** : il n'existe pas. Le chiffre du §3 mesure le coût de son
  absence sur **une** traversée.
- Le décalage de la frame de transition entre modèles (180 / 184 / 191 / 197) est constaté, pas
  expliqué.
- Le gel des centres du §6 (test d'isolation) neutralise aussi les glissières qui les portent : ce
  n'est pas un mécanisme valide, seulement l'isolation d'une variable.
