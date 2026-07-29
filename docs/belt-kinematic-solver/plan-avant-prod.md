# Plan — ce qui reste avant de brancher les nouvelles contraintes de courroie

Dernier plan de mesures du chantier. Objectif : **passer le q-modèle + agrégats en production**
(branche dédiée, application en développement actif, aucun utilisateur — pas de toggle nécessaire).

Comme les précédents : **arrêt et retour à chaque fin d'étape**. Mais contrairement aux précédents,
celui-ci se termine par du code de production, pas par un banc.

---

## Contexte à charger

1. [README.md](./README.md) — la vision d'ensemble.
2. [agregat-sous-chaine.md](./agregat-sous-chaine.md) — la contrainte qui marche, son critère de
   coupure, ses gradients.
3. [solidite-agregat.md](./solidite-agregat.md) — la solidité du signal et la décision
   `BeltLength`.
4. [belt-q-model-design.md](./belt-q-model-design.md) **§4 uniquement** — la forme cible des
   contraintes de courroie. C'est la feuille de route de l'étape F.
5. [plan-de-tests.md](./plan-de-tests.md) — règles de travail et pièges, toujours valables.

Ne pas charger le reste : les diagnostics des tours 1 à 5 sont périmés en tant que guides, leurs
conclusions sont dans le README.

---

## Où l'on en est

Le critère de réussite est **atteint** : sur `Core XY - 2 moteurs`, un moteur seul et l'autre à
ω = 0, le chariot part en diagonale à `Δy/Δx = 0.995`, le moteur figé bouge de 0.20° en 120 frames,
et le déplacement vaut **0.999** de la cinématique analytique. Signal proportionnel sur un facteur 8,
dérive de longueur ≤ 0.008 px, non-régression `Poulie bloqueuse` à −0.69° (garde-fou ±1°).

Rien n'est branché : `BeltSubChainAggregate` et `BeltSegmentNoSlip` vivent dans
`experimental/` et aucun parseur ne les émet.

**Décisions déjà prises, à ne pas rouvrir :**

- critère de coupure = « quelque chose d'autre que cette courroie a-t-il son mot à dire sur cet
  angle ? », les deux formes (écriture / partage de DOF) comptant ;
- aucun agrégat si la courroie n'a aucune coupure ;
- en présence d'une coupure, les agrégats **remplacent** `BeltLength` (leur somme *est* la longueur,
  résidu nul, aucun gain de vitesse mesuré) ; en son absence, on la garde ;
- métrique `rim` (`w_θ = 1/r²`) portée **par le lien**, pas globalement.

---

## Verdict — les étapes A à E sont closes, aucune n'est bloquante

**Le branchement peut se faire.** Les cinq étapes de mesure ont trouvé un problème réel et un seul :
le **coût par frame**.

| étape | verdict | bloquant ? |
| --- | --- | --- |
| A — fiabilité de la suite | harnais de mesure sortis de la passe parallèle, 3 exécutions vertes | non |
| B — Huygens | la prémisse était fausse : les 2.4–3.5 px étaient mesurés **sans** agrégats ; avec, il converge à 1e-3 px et débloque un moteur que la production laissait à 58 % | non — **un argument pour** |
| C — déconnexion | la production traverse proprement ; l'irréversibilité coûte ~0 sur les poulies restées en prise. Le `h⁰` périmé est confirmé et sa réparation proposée | non |
| D — point mort | `Poulie bloqueuse` s'arrête définitivement (rien ne bouge sur 3000 frames) ; la traversée de la butée est un défaut préexistant, insensible à l'agrégat | non |
| E — vitesse | **×2.4 à ×3.7 par frame**, jusqu'à 27 ms sur le Core XY (~37 fps à 300 balayages) | **à surveiller** |

Le q-modèle + agrégats s'est révélé **meilleur que la production sur deux des trois mécanismes à
courroie** : il fait tourner le moteur de Huygens à 100 % de sa consigne là où φ le bloque à 58 %, et
il conserve le point mort de `Poulie bloqueuse` à 0.69° près.

**Ce qui part en dette, documenté :**

- **Le coût par frame.** Il ne vient pas du nombre d'équations (+15 % de liens) mais du coût unitaire
  d'une contrainte de courroie, qui reconstruit toute la géométrie à chaque application. C'est la
  cible d'optimisation, et c'est elle qui contraindra la limite de balayages.
- **L'accélérateur espéré n'existe pas** (étape E point 4) : l'agrégat ne rend pas la propagation
  d'un blocage sous-linéaire. Retirer cette promesse du README.
- **La déchirure q de `Déconnexion courroie`** : 0.82 px permanents (0.05 % de la longueur de
  courroie), **huit hypothèses éliminées**, cause non identifiée. Ne bloque pas, n'accumule pas,
  n'affecte pas le mouvement entraîné.
- **Le re-bakage de `h⁰`** et le rattachement symétrique (étape C bis), proposés et non implémentés.
- **La vérification visuelle de Huygens**, en attente depuis l'étape B : la poulie de r = 400 reste
  immobile pendant que le moteur fait 200°. Aucun banc ne remplace ce regard.

---

## Étape A — fiabilité de la suite ✅ *(close)*

Les fichiers lourds expiraient **par intermittence** en exécution parallèle : des timeouts de
**contention entre forks**, pas des échecs.

**Remède appliqué :** les harnais de mesure sont renommés `*.bench.test.ts`, exclus de la passe par
défaut ([vitest.config.ts](../../vitest.config.ts)) et rejoués en série par `npm run test:bench`
(`--maxWorkers=1`). Trois exécutions consécutives vertes : 19 fichiers, 331 tests, 23.6 / 35.5 /
46.8 s. La variance du wall-clock reste d'un facteur 2 mais le temps de test réel est de 1 à 3 s —
la marge devant le seuil de 30 s est énorme.

> **Réserve, à traiter avant l'étape F.** Les mécanismes de référence du chantier
> (`Poulie bloqueuse`, `Core XY`, `Huygens`) n'apparaissent **que** dans des `*.bench.test.ts`. La
> passe par défaut ne couvre donc plus les garde-fous de ce dossier (±1° sur `Poulie bloqueuse`,
> 0.995 sur `Core XY`). La non-régression finale ne peut pas s'appuyer sur `npm run test:run` seul.
> **Décision prise pour l'instant :** on s'appuie sur `npm run test:bench`.

---

## Étape B — Huygens ✅ *(close — la prémisse était fausse)*

Résultats complets dans [huygens.md](./huygens.md).

Les **2.4 à 3.5 px** avaient été mesurés **sans agrégats**, par un harnais de l'étape A du chantier
métrique, qui rapporte de surcroît le maximum sur tous les balayages plutôt que la valeur au dernier.

Avec les agrégats, Huygens converge à **1.04e-3 px** — un point fixe, mais sous le bruit de bakage
connu, et insensible au nombre de balayages (identique de 300 à 10 000). Le peu qui reste est porté
par **`BeltLength`** : la retirer fait tomber le tout à 1e-6, ce qui comble le trou signalé par
[solidite-agregat.md](./solidite-agregat.md) §5 — le cas « boucle fermée à géométrie mobile » — dans
le sens de la décision déjà prise. Ni sur-contrainte ni défaut de bakage : à ω = 0 les deux modèles
sont à 1e-12.

Et le retournement : c'est la **production φ** qui est déchirée sur ce mécanisme (2.93 px), avec son
moteur bloqué à **58 %** de sa consigne, là où le q-modèle le fait tourner exactement comme commandé.

**Verdict : Huygens n'est pas un blocage pour la mise en production, c'est un argument pour.** Reste
une vérification visuelle (la poulie de r = 400 immobile pendant que le moteur fait 200°).

---

## Étape C — déconnexion en simulation ✅ *(mesures faites, proposition en attente)*

Résultats complets dans [deconnexion.md](./deconnexion.md).

La **production traverse la transition proprement** : longueur constante à 1e-4 près, résidus qui
descendent en traversant, un soubresaut de 0.96 px sur un centre. Et **l'irréversibilité ne coûte
quasiment rien** — les poulies restées sur la courroie reviennent d'un aller-retour à 3.01° et 2.40°,
chiffre pour chiffre le témoin sans détachement ; les 286° d'écart sont la phase de la poulie partie,
ce qui est le comportement correct. **Il est acceptable de brancher sans traiter le rattachement.**

Le défaut prédit côté q est confirmé : après la déconnexion, 3 `BeltSegmentNoSlip` et 1
`BeltSubChainAggregate` nomment toujours la poulie détachée, et leur résidu monte à 315 px. Mais
l'essentiel de ce chiffre vient de la **dégénérescence à une seule coupure** de ce banc : avec une
seconde coupure forcée, il tombe à **0.22 px**.

**Proposition (non implémentée) :** sur un événement de déconnexion, jeter les liens q de la courroie
et rappeler `buildBeltSegmentNoSlipLinks` + `buildBeltAggregateLinks` sur la liste de vias courante,
avec l'état courant. Aucun saut par construction, `h⁰` du brin fusionné calculé et non dérivé, jeu de
coupures recalculé, et le rattachement est le même appel à l'envers. Détail et inventaire de ce qu'il
reste à construire dans la note.

> **Fil ouvert, en dette.** Le q-modèle porte 0.82 px de résidu permanent sur ce mécanisme (0.05 % de
> la longueur de courroie) là où la production est à 3e-3. **Huit hypothèses éliminées**, cause non
> identifiée. Ne bloque pas, n'accumule pas, n'affecte pas le mouvement entraîné — défaut de qualité.
> À rouvrir si un autre banc le fait remonter.

---

### C bis — le rattachement symétrique *(après validation de la proposition)*

Question à trancher **avant** de coder : le **battement**. Une poulie posée à la limite peut
basculer à chaque frame, et chaque bascule re-bake `h⁰` — donc injecte potentiellement de la
courroie fantôme, donc dérive. Le remède usuel est une **hystérésis** (seuil de détachement ≠ seuil
de rattachement), qui crée en retour une irréversibilité volontaire et bornée. Choisir en
connaissant le chiffre de l'irréversibilité, désormais mesuré (§3 de la note) : il est
négligeable, ce qui déplace l'argument — voir la discussion du battement dans
[deconnexion.md](./deconnexion.md) §5.

Puis : implémenter, **re-mesurer les quatre points**, et rendre le avant/après.

**Retour attendu :** le choix d'hystérésis argumenté, et le tableau avant/après. **Puis arrêt.**

---

## Étape D — point mort ✅ *(close, non bloquante)*

Résultats complets dans [point-mort.md](./point-mort.md).

**`Poulie bloqueuse` s'arrête franchement et définitivement** : bloquée à 50.869° avec agrégats, elle
n'a pas bougé d'un chiffre après **3000 frames** de moteur commandant jusqu'à 3000°. Résidus
rigoureusement constants sur 2900 frames. C'est un point fixe, pas une reptation.

**La butée bielle-glissière traverse toujours** — θ(g2) finit à **2.53×** sa fenêtre mécanique après
un pic de déchirure à 8.66 px, puis se réinstalle de l'autre côté à 1e-7. Mais **l'agrégat n'y est
pour rien** : avec et sans lui les deux colonnes sont indiscernables. C'est un point mort géométrique
d'une bielle et d'un patin, hors du périmètre de la courroie — le défaut préexistant du §6 du README.

**Verdict : non bloquante pour la mise en production.** Le chantier ne crée pas la traversée, ne
l'aggrave pas, et ne la répare pas.

---

## Étape E — vitesse ✅ *(close)*

Résultats complets dans [vitesse.md](./vitesse.md). La limite de 300 balayages n'est pas tranchée,
conformément au plan.

1. **Balayages à convergence.** L'agrégat en *gagne* : 28 contre 41 (φ) sur `Poulie bloqueuse`,
   36 contre 295 sur Huygens. Surtout, il **converge là où les deux autres ne convergent pas** —
   1e-3 px en 61 balayages sur Huygens, contre des plateaux à 2.93 (φ) et 1.42 (q seul).
2. **Coût par frame : ×2.4 à ×3.7 le modèle φ.** Le pire est le Core XY à **27 ms/frame**, soit
   ~37 fps à 300 balayages. Le surcoût ne vient **pas** du nombre de liens (+15 %) mais du coût
   unitaire : chaque application de no-slip ou d'agrégat reconstruit toute la géométrie de la
   courroie (`viasFrom` + `belt_pieces`). **C'est là qu'est l'optimisation.**
3. **`sort_links` :** neutre partout sauf sur `Poulie bloqueuse`, où l'ordre inverse coûte 131
   balayages contre 28 — facteur 4.7 en faveur de l'ordre actuel. Rien à changer.
4. **Sur-linéarité : l'accélérateur espéré n'existe pas.** La courbe ne s'aplatit pas, elle se
   redresse (2.00 → 6.21 balayages par poulie avec agrégat, contre 1.67 → 3.79 sans). L'hypothèse du
   « préconditionneur gratuit » est **infirmée**. En revanche l'agrégat établit le blocage à une
   valeur **indépendante de la longueur de chaîne** (0.1200 de N = 3 à N = 24) là où le no-slip seul
   fuit avec N — ce qui est bien le comportement attendu d'une équation traversant un tronçon.

---

## Étape F — le branchement

À n'ouvrir qu'après les étapes A à E, et **après une discussion de conception** — la forme cible est
esquissée dans [belt-q-model-design.md](./belt-q-model-design.md) §4 mais n'a jamais été rediscutée
depuis, et huit tours de mesures sont passés entre-temps.

Ce que le branchement implique, pour mémoire :

- émission de `BeltSegmentNoSlip` (une par brin) et de `BeltSubChainAggregate` au parsing, avec le
  calcul des coupures et le bakage de `h⁰` ;
- `applyBeltPhaseGearConstraint` **supprimée**, avec le DOF `belt:phi` ;
- `applyBeltLengthConstraint` **perd** son no-slip (`simFeed`, `φ`, `diff0`, `nFree`,
  `startWound`/`endWound`, `C_diff`, `hS`/`hE`) et redevient purement positionnelle — identique dans
  les branches fermée, ouverte et édition. Elle n'est plus émise là où des agrégats le sont ;
- `applyBeltPinConstraint` change de rôle : plus le pont positions → angles, seulement la contrainte
  d'un nœud réellement attaché à la courroie ;
- son résidu remonté cesse d'être trompeur (`Math.abs(C)` de la longueur seule) — le no-slip a
  désormais ses propres résidus, à faire apparaître dans les diagnostics.

**Non-régression finale, sur les 8 mécanismes de `test-mechanisms/`** — y compris ceux sans courroie
(Jansen, Vilbrequin, Test slider), qui doivent être strictement inchangés. Plus `tsc`, ESLint, et la
suite complète en parallèle (étape A).

**Puis arrêt, et vérification visuelle par l'utilisateur** — c'est lui qui teste l'UI, aucun banc ne
remplace ça.

---

## Hors périmètre, assumé et documenté

- **La dette de métrique angulaire.** Le solveur n'a pas de métrique cohérente : `GearPerimeterPin`,
  `BeltPhaseGear` et `BeltPin` sont déjà en `rim`, `GearMeshAngle`, `CoaxialAngle`,
  `BeamFollowsAngle` et `BeltFollowsTangent` ne le sont pas, et **aucun `w_θ` unique** ne laisse
  simultanément `GearPerimeterPin` et `BeamFollowsAngle` inchangées. Porter la métrique par le lien
  est un contournement délibéré. À traiter séparément.
- **La limite de 300 balayages**, arbitraire, à revoir après optimisations (portage en index,
  préconditionneur) — discussion ultérieure.
- **Le glissement `BeltPin` sur le nœud de fermeture** (le pilote parasite du mode circulaire) :
  traité par la refonte de l'étape F, mais son comportement final n'a pas été remesuré depuis le
  tour 3.
- **S'attacher à n'importe quel brin** (« la courroie attrape une nouvelle poulie ») : **abandonné**.
  Coûteux — topologie changée en cours de frame — et sans usage réel attendu. Le rattachement
  symétrique de l'étape C bis suffit.
