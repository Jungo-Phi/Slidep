# Plan — fluidité de la simulation

Suite du chantier 6, qui a changé de forme en cours de route. La question de départ était
« quelle limite de balayages ? » ; les mesures l'ont déplacée. Ce plan la remplace.

Sept chantiers, **arrêt et retour à la fin de chacun**.

---

## Contexte à charger

1. [README.md](./README.md) — le chantier courroie, pour situer.
2. [rampement.md](./rampement.md) — pourquoi le solveur ne s'arrête jamais, et ce que ça
   change.
3. La section « ce qui est mesuré » ci-dessous — elle porte des chiffres qui n'existent
   nulle part ailleurs.
4. [plan-implementation.md](./plan-implementation.md) — les règles de travail et les pièges,
   toujours valables. **Notamment : ne jamais comparer deux mesures de vitesse prises à des
   instants différents** (±25 % de bruit sur le wall-clock).

Bancs existants réutilisables : [creep.bench.test.ts](../../src/components/solver/creep.bench.test.ts),
[record-rate.bench.test.ts](../../src/components/solver/record-rate.bench.test.ts),
[snapshot-interpolation.test.ts](../../src/components/solver/snapshot-interpolation.test.ts).

---

## Ce qui est mesuré, et ce que ça change

**L'interpolation à l'affichage est faite** (`snapshot_at`) : le canvas interpole entre les
deux snapshots qui encadrent l'instant courant, sans jamais franchir un changement de
topologie de courroie. Erreur ajoutée sur la longueur d'une poutre : **2.3e-4 px au pire**,
nulle sur trois mécanismes sur six.

**Conséquence : la fréquence d'enregistrement n'achète plus de fluidité, seulement de la
fidélité.** C'est ce qui rend ce plan possible, et c'est la prémisse de tout ce qui suit.

**L'erreur de trajectoire est exactement proportionnelle à `dt`** (référence 480 Hz, comparaison
à travers l'interpolation, donc sur ce qui serait dessiné) :

| mécanisme | 30 Hz | 60 Hz | **120 Hz** | 240 Hz |
| --- | --- | --- | --- | --- |
| Core XY - 2 moteurs | 0.98 px | 0.46 | **0.20** | 0.068 |
| Poulie bloqueuse | **16.0** | 7.5 | **3.2** | 1.07 |
| Déconnexion courroie | 3.5 | 1.6 | 0.69 | 0.23 |
| Huygen's | 3.3 | 1.6 | 0.69 | 0.24 |
| Jansen | 2.7 | 1.3 | 0.54 | 0.18 |
| Vilbrequin | 3.4 | 1.6 | 0.72 | 0.26 |

Pas de seuil, pas de décrochage : intégrateur du premier ordre. Il n'existe donc **pas de
fréquence « idéale »**, seulement un compromis en ligne droite.

**`Poulie bloqueuse` est l'arbitre** et il est dix fois plus sévère que les autres : c'est le
mécanisme à point mort, et **l'endroit où il se bloque dépend du pas**. L'écart n'y est pas un
déphasage transitoire qui se referme (Core XY : 0.20 px au pire, 7.7e-3 à la fin) mais un
décalage permanent.

**Le coût ne suit pas la fréquence** (ms par seconde simulée, min sur 3 passes) :

| mécanisme | 30 Hz | 60 Hz | 120 Hz | 240 Hz | 120 → 240 |
| --- | --- | --- | --- | --- | --- |
| Core XY - 2 moteurs | 760 | 1630 | 3344 | **3383** | **×1.01** |
| Déconnexion courroie | 335 | 627 | 1350 | 2756 | ×2.04 |
| Poulie bloqueuse | 123 | 271 | 623 | 1776 | ×2.85 |
| Huygen's | 99 | 86 | 264 | 635 | ×2.40 |
| Jansen | 33 | 43 | 99 | 142 | ×1.43 |
| Vilbrequin | 7 | 14 | 21 | 36 | ×1.70 |

**Et le chiffre qui commande tout le reste : plus de 3300 ms pour une seconde simulée sur le
Core XY.** L'enregistrement tourne trois fois plus lentement que le temps réel. Aucun réglage
de fréquence ne rattrape ça.

### Deux régimes à ne pas confondre

L'enregistrement est un problème de **débit** — rattraper N pas de temps simulé. L'aperçu de
saisie est un problème de **latence** — un solve par événement pointeur. Les deux vivent
aujourd'hui sur le thread UI, et c'est le nœud.

---

## L'ordre

```
0. retirer l'aperçu de saisie          ── fait ; + saisie interdite en relecture  ✅
1. boucle d'affichage à budget         ── fait ; pas adaptatif, fidélité affichée  ✅
2. la fréquence : 120 ou 240 Hz ?      ── mesuré ; 240 Hz coûte ×2, garder 120  ✅
3. les balayages du grab               ── grab à 5, validé à l'œil  ✅
3bis la falaise à 1/120                ── plafond de pas mesuré en vol  ✅
5. le coût par balayage restant        ── mesuré ; les deux cibles sont vides  ✅
4. le solveur hors du thread UI        ── fait ; worker, verdict visuel attendu  ⏸
6. la limite de balayages              ── en dernier, et sans doute pas le levier
```

---

## Chantier 0 — retirer l'aperçu de saisie ✅ *(fait, vérification visuelle en attente)*

**Ce qui a été fait.** `grabSnapshot` supprimé — l'état, le solve par événement pointeur dans
`handleSimulationGrab`, et le masquage `grabSnapshot ?? currentKinematicSnapshot`.
`handleSimulationGrab` ne fait plus que poser `kinematicGrabRef.current` et démarrer la lecture ;
l'affichage lit `currentKinematicSnapshot` comme hors saisie.

**Une décision produit prise en chemin, non prévue par l'énoncé : la saisie est désormais interdite
en relecture.** La boucle RAF n'alimente le solveur que lorsqu'elle **étend** l'enregistrement ; en
deçà de la frontière elle ne fait qu'avancer le curseur et **ne consulte jamais le grab**. L'aperçu
masquait ce fait derrière une image qui suivait le curseur sans que rien ne soit enregistré, et qui
revenait en place au relâchement. Le retirer rendait la saisie silencieusement inopérante en
relecture ; la trancher a semblé préférable à la laisser en défaut connu.

Le prédicat de relecture est désormais **un seul point de vérité**, `is_replaying`
([kinematic-simulation.ts](../../src/components/solver/kinematic-simulation.ts)), lu par la boucle
RAF et par le canvas — ils ne peuvent plus divorcer. Le canvas reçoit `canSimulationGrab`
(`kinematic` **et** pas en relecture) : le drag ne démarre pas et **le curseur main n'est pas
proposé**.

**Limites.** Le curseur est le seul signal retiré : le survol continue de révéler les éléments en
relecture. Aucun banc ne juge ce chantier — le critère est le ressenti, donc **la vérification
visuelle reste à faire** : pointeur immobile pendant une saisie, le mécanisme doit continuer de
bouger, et aucune latence ajoutée pointeur en mouvement.

**Le symptôme.** Pendant une saisie, l'image ne se met à jour qu'aux **mouvements de souris**.
Pointeur immobile, le mécanisme se fige alors que la simulation continue.

**Ce que dit le code.** `grabSnapshot` n'est écrit que dans `handleSimulationGrab`, appelé sur
événement pointeur, et n'est effacé qu'à `handleSimulationGrabEnd`
([App.tsx](../../src/App.tsx)). L'affichage prend `grabSnapshot ?? currentKinematicSnapshot` :
tant qu'une saisie est active, l'aperçu **masque** inconditionnellement les snapshots que la
boucle RAF continue de produire — lesquels contiennent pourtant déjà la saisie, puisque la
boucle lui passe `kinematicGrabRef.current`.

**Décision prise : cet aperçu est supprimé.** Il existait pour la « réactivité sous la frame »,
mais à 120 Hz d'enregistrement pour 60 fps d'affichage la boucle produit déjà **deux**
snapshots par frame affichée : il n'y a pas de sous-frame à gagner.

**Le correctif et la suppression sont donc le même changement**, et il est soustractif : plus
de `grabSnapshot` du tout, l'affichage lit `currentKinematicSnapshot` comme hors saisie.
`handleSimulationGrab` ne garde que la pose de `kinematicGrabRef.current` et le démarrage de la
lecture ; `handleSimulationGrabEnd` ne fait plus qu'effacer la ref.

**Bénéfice au passage, et il n'est pas mineur :** ça retire **un solve par événement pointeur
du thread UI**. À 11 ms le solve sur le Core XY et des pointeurs qui émettent à 120 Hz ou plus,
c'était potentiellement le coût dominant pendant une saisie — c'est-à-dire pendant l'interaction
la plus sensible de l'application.

**Critère.** Pointeur immobile pendant une saisie, le mécanisme continue de bouger. Pointeur en
mouvement, aucune latence ajoutée. **Vérification visuelle par l'utilisateur** — c'est un
défaut de ressenti, aucun banc ne le juge.

---

## Chantier 1 — la boucle d'affichage à budget ✅ *(fait, vérification visuelle en attente)*

**Le budget.** `FRAME_BUDGET_MS = 8` : la boucle d'enregistrement calcule des pas jusqu'à 8 ms
écoulées puis rend la main. Le budget est en **temps écoulé**, jamais en nombre de pas, donc une
image lente ne peut pas demander à la suivante de rattraper — pas de spirale. Un pas qui dépasse à
lui seul le budget va quand même au bout : un demi-pas n'est pas un état.

**Les deux décisions produit, tranchées par l'utilisateur.**

**1. Le temps réel est tenu ; c'est le pas qui cède.** `step_simulation` est purement incrémental
(`ω·dt`, jamais `t` absolu) : avancer l'étiquette `t` sans simuler produirait une bande où le moteur
ne tourne pas, et fausserait les vitesses des sondes du facteur sauté. « Sauter du temps simulé » se
réalise donc en **franchissant l'intervalle avec un pas plus gros** :

```
recording_step(requestedDt, stepCost) = max(RECORD_DT, requestedDt / max(1, ⌊budget / stepCost⌋))
```

Le coût d'un pas est **mesuré en vol** (moyenne glissante, 0.8/0.2) et le pas s'y adapte : ce que
l'image peut payer fixe le nombre de pas, la vitesse demandée fixe le temps à couvrir, le quotient
est le pas. Jamais plus fin que `RECORD_DT` — au-delà la fidélité est gratuite, la mémoire non.

> **Une première version plafonnait le pas à 30 Hz** — le plus grossier dont l'erreur soit chiffrée
> — et faisait dépendre le pas de la **vitesse demandée seule**, pour que l'enregistrement soit
> reproductible d'une machine à l'autre. **Écarté par l'utilisateur, et à raison : ×4 et ×10
> donnaient alors la même vitesse effective**, le réglage de vitesse ne réglait plus rien. Dans une
> application où le temps réel est central, la reproductibilité passe après.

**Le prix, assumé : l'enregistrement dépend de la machine et de la charge.** Le même mécanisme
enregistré deux fois ne donne pas les mêmes instantanés, et l'erreur de trajectoire croît
linéairement avec le pas — un enregistrement produit sous charge est proportionnellement moins
fidèle. Le régime saturé (un pas par image, portant toute la demande de l'image) est le cas
d'exception que les chantiers suivants doivent rendre rare, le 4 en particulier.

**2. Ce qui a cédé est affiché.** Puisque c'est la fidélité qui plie et non l'horloge, l'indicateur
est le **pas réellement utilisé** : *« Enregistrement à 42 Hz au lieu de 120 : la vitesse demandée
est tenue au prix de la précision »*, sous « Contraintes non respectées », muet au pas nominal.
`runtimeState.lag` reste et s'y ajoute quand il dépasse 0.1 s, mais il ne se remplit plus que si
même un pas par image ne suffit pas — le grossissement l'annule par construction. Le curseur ne
devance jamais la frontière de plus d'un demi-pas : la timeline ne peut pas afficher un temps
qu'aucun instantané ne couvre.

**L'axe de temps de l'enregistrement n'est donc plus uniforme**, ce qui était une hypothèse
implicite du code. `probe-series.ts` y était déjà indifférent (recherche binaire, vitesse en
`t[i1] − t[i0]`). Deux lieux la supposaient et sont corrigés : `snapshot_at`, qui divisait par
`RECORD_DT`, passe par un `snapshot_index_at` en recherche binaire et interpole sur la **durée
réelle** de l'intervalle ; et le re-bakage après édition, qui choisissait son instantané de base par
la même division. `is_replaying` juge désormais sur la **moitié du dernier intervalle enregistré**
et non sur `RECORD_DT/2` — sinon une pause après un enregistrement à ×10 se lisait comme une
relecture, et refusait la saisie.

**Limites.**

- **Rien de tout ceci n'est mesuré.** Le budget de 8 ms, le lissage 0.8/0.2 du coût et le seuil
  d'affichage à 0.1 s sont des choix de conception ; aucun banc ne dit qu'ils sont les bons. Le
  critère du chantier est visuel.
- **Le régime grossier n'est caractérisé par aucun banc.** Toutes les mesures du dossier sont à
  `RECORD_DT`, et le chantier 5 a établi que le défaut de déconnexion **n'existe qu'à ce pas**. Ce
  que fait une déconnexion de courroie à 40 Hz est inconnu — `Déconnexion courroie` à ×4 est
  l'endroit où regarder.
- **Le pas n'est borné que par le clamp de `realDt` à 0.1 s**, qui préexiste. À ×10, une image qui
  accroche peut donc demander un pas allant jusqu'à 1 s de temps simulé, et un pas pareil déchire.
  Non observé, non mesuré ; si ça se produit, le remède est de resserrer ce clamp aux vitesses
  élevées.
- **La boucle d'estimation du coût n'est stable que par saturation** : un pas plus gros coûte plus
  cher (moins bon warm-start), donc en rend un plus gros encore — jusqu'à `affordable = 1`, qui est
  un point fixe. C'est un raisonnement, pas une mesure.

4 tests ajoutés à
[snapshot-interpolation.test.ts](../../src/components/solver/snapshot-interpolation.test.ts) sur
l'axe non uniforme : dimensionnement du pas (dont le régime saturé et le coût pas encore mesuré),
encadrement, interpolation sur la durée réelle, tolérance de relecture.

### L'énoncé d'origine

**Le constat.** Le rattrapage calcule **tous** les pas nécessaires dans le callback RAF
(`realDt` clampé à 0.1 s, `simDt = realDt × speed`, boucle `while`). À 11 ms le pas, deux pas
bloquent 23 ms et la frame saute. À ×10, vingt pas bloquent ~230 ms.

**La saccade n'est donc pas causée par un solveur lent, mais par une boucle qui refuse de
rendre la main.** Même infiniment optimisé, le schéma actuel saccadera dès que le mécanisme
sera assez gros.

**À faire.** Un budget de temps par frame : calculer des pas jusqu'à ~8 ms écoulées, puis
rendre la main. Le temps simulé prend du retard sur le temps réel — c'est honnête, invisible,
et infiniment préférable à une image qui saute. Points à traiter :

- **ce que voit l'utilisateur quand le temps simulé décroche** : la lecture ralentit-elle
  silencieusement, ou faut-il le dire ? C'est une décision produit ;
- **la vitesse de lecture** : à ×10 le retard s'accumule vite. Faut-il alors sauter du temps
  simulé (donc ne pas l'enregistrer) ou accepter de ralentir ? Les deux sont défendables et
  n'ont pas le même sens ;
- **ne pas réintroduire de spirale** : le budget doit être en temps écoulé, pas en nombre de
  pas.

**Critère.** Sur `Core XY - 2 moteurs`, l'affichage reste à 60 fps pendant l'enregistrement, à
toutes les vitesses de lecture. **Vérification visuelle par l'utilisateur.**

---

## Chantier 2 — la fréquence ✅ *(mesuré ; recommandation : garder 120 Hz)*

Le chantier 1 avait déjà déplacé la question : `RECORD_DT` n'est plus la fréquence
d'enregistrement mais son **plancher**, et il ne mord que quand le temps simulé demandé par
image tombe en dessous de lui — donc en ralenti, ou sur un mécanisme assez léger pour que le
budget en autorise plusieurs. Sur `Core XY - 2 moteurs` à ×1 le pas est fixé par le budget et le
plancher ne mord jamais.

Banc : [step-cost.bench.test.ts](../../src/components/solver/step-cost.bench.test.ts). Les pas
alternent dans un seul processus, l'ordre s'inverse à chaque passe, et chaque configuration est
mesurée sur la **même durée simulée** (0.5 s après 0.125 s de chauffe) — pas sur le même nombre
de pas, sinon les états comparés ne sont pas les mêmes. Balayages et millisecondes sont mesurés
en **passes séparées** : la sonde de balayage alloue une fois par balayage.

### La prémisse du plan est fausse : 240 Hz n'est pas gratuit

| mécanisme | balayages médians 1/480 → 1/30 | ms / s simulée 1/480 | 1/240 | 1/120 | 1/60 | 1/30 |
| --- | --- | --- | --- | --- | --- | --- |
| Core XY - 2 moteurs | **300 → 300** (100 % plafonnés partout) | 6450 | 3587 | **1408** | 1007 | 501 |
| Core XY modifié | 153 → 300 | 3820 | 2296 | 1393 | 873 | 393 |
| Core XY | 300 → 300 | 5268 | 3063 | 1303 | 810 | 434 |
| Déconnexion courroie | 300 → 300 | 2887 | 1241 | 794 | 325 | 185 |
| Huygen's chain drive | 58 → 80 | 781 | 373 | 241 | 107 | 80 |
| Jansen's linkage | 212 → 300 | 274 | 125 | 98 | 42 | 28 |
| Poulie bloqueuse | 260 → 300 | 3133 | 1639 | 945 | 458 | 248 |
| Vilbrequin | 72 → 101 | 62 | 42 | 36 | 13 | 6 |

**Le « 3383 contre 3344 » du plan ne se reproduit pas** : ici 240 Hz coûte 3587 contre 1408, soit
**×2.5**. Un second banc du dossier (`record-rate`) donne 3633 contre 1855 dans la même passe,
soit ×2. Deux mesures indépendantes contre une : l'ancien chiffre avait été pris un autre jour, ce
que la règle du dossier interdit précisément.

**Et l'hypothèse du plafond est infirmée.** `Core XY - 2 moteurs` exécute **300 balayages à
toutes les tailles de pas**, de 1/30 à 1/480 : la sortie anticipée ne s'engage jamais, et un pas
plus fin ne l'engage pas davantage. Là où elle s'engage (Core XY modifié 153 → 300, Huygens
58 → 80), le gain de balayages est bien réel mais d'un facteur 2 au mieux, jamais du facteur qui
rendrait la fréquence gratuite.

### Le fait qui commande, et qui n'était pas la question posée

**Le coût d'un pas est presque indépendant de sa taille** — 13.4 ms à 1/480 contre 16.7 ms à
1/30 sur le Core XY, 1.6 contre 2.7 sur Huygens. Le nombre de balayages est fixé par le
conditionnement du mécanisme, pas par la qualité du warm-start. Donc **le coût par seconde
simulée est en 1/dt** : raffiner coûte proportionnellement, sur les neuf mécanismes, sans
exception.

Trois conséquences :

- **Recommandation : garder 120 Hz.** 240 Hz coûterait ×2 à ×2.5 pour trois fois moins d'erreur,
  et ne mordrait que sur les mécanismes qui ont déjà de la marge et en ralenti — là où
  l'interpolation rend la différence invisible. C'est un troc, pas une affaire. **Décision
  produit : elle reste à l'utilisateur.**
- **La boucle du chantier 1 est stable, et pour une raison qui n'était pas prévue.** La crainte
  était un rebouclage « pas grossier → warm-start dégradé → plus de balayages → pas plus
  grossier », avec deux régimes stables et un cliquet. Mesuré : le coût ne dépend quasiment pas
  du pas, donc `affordable` non plus, donc le pas a un **point fixe unique** et l'estimateur
  appris à un pas reste valable à un autre. Le cliquet redouté n'existe pas.
- **Corollaire moins agréable : grossir est toujours plus efficace.** Rien dans la courbe ne
  récompense un pas fin, donc rien ne pousse la boucle à en reprendre un. La fidélité ne se
  regagnera que par le coût d'un balayage (chantiers 4 et 5), jamais par un réglage de pas.

### Et une falaise, à 1/120 exactement

Signalé d'abord à l'œil (« les contraintes sont plus facilement brisées »), puis mesuré — pire
violation laissée par le solveur, au seuil qui alimente le panneau d'analyse (1 px, 0.01 rad) :

| pas | `Poulie bloqueuse` | `Déconnexion courroie` | les 7 autres |
| --- | --- | --- | --- |
| 1/480 | 2.2e-3 (MotorAngle) | 0 | 0 |
| 1/240 | 4.4e-3 (MotorAngle) | 0 | 0 |
| **1/120** | 1.8e-2 (MotorAngle) | **0** | 0 |
| 1/60 | **1.94 px** (BeltSubChainAggregate) | **1.43 px** | 0 |
| 1/30 | 3.88 px | 2.86 px | 0 |
| 1/15 | 7.66 px | 5.59 px | 0 |
| 1/6 | 15.9 px | 12.7 px | 0 |

Trois faits, et ils commandent la suite :

- **la violation est exactement proportionnelle au pas** — chaque doublement la double, sur les
  deux mécanismes ;
- **elle apparaît entre 1/120 et 1/60**, et change de famille en passant : à 1/120 ce qui est
  signalé est un `MotorAngle` (le blocage réel, qui *doit* être signalé), à 1/60 c'est un
  `BeltSubChainAggregate` — la courroie qui se déchire, qui n'a rien de physique. `RECORD_DT`
  était donc posé juste sous la falaise, et tout le dossier a été validé là ;
- **elle ne touche que les mécanismes à courroie mis en résistance** : blocage, déconnexion. La
  famille Core XY, Jansen, Huygens, Vilbrequin restent à 0 même à 1/6 — ils suivent leur moteur,
  ils ne résistent à rien.

**Le pas adaptatif du chantier 1 franchit cette falaise dès ×1 sur un mécanisme lourd** (budget
saturé ⇒ un pas par image ⇒ 1/60), et de loin dès ×4. Ce qui avait été présenté comme un troc
« vitesse contre fidélité » est en réalité un troc « vitesse contre contraintes tenues » sur cette
famille de mécanismes. **La décision de ne pas plafonner le pas a été prise sur la première
formulation ; elle mérite d'être rouverte sur la seconde.**

**Et ce n'est PAS le critère de sortie anticipée qui est en cause**, contrairement à l'intuition de
départ : à 1/60 sur `Poulie bloqueuse` le solveur exécute 45 balayages médians, 39 % plafonnés — il
ne manque pas de balayages, il **sort** parce que `remaining_motion` ne borne que le *mouvement*, et
qu'un mécanisme bloqué ne bouge plus tout en violant ses contraintes. Ajouter « ne pas sortir tant
qu'une contrainte est violée » ferait brûler 300 balayages à tout mécanisme réellement bloqué, où la
violation est le signal juste. La piste existe mais elle est piégeuse.

### La mitigation : un plafond de pas mesuré en vol ✅ *(fait)*

`step_ceiling(stepDt, severity)` dans
[kinematic-simulation.ts](../../src/components/solver/kinematic-simulation.ts), appliqué en
`min(budget, plafond)` dans la boucle d'enregistrement :

```
plafond = max(RECORD_DT, pas / max(sévérité, 0.8))
```

La **sévérité** (`constraint_severity`, [PBD_kinematic_solver.ts](../../src/components/solver/PBD_kinematic_solver.ts))
est le pire résidu **divisé par la tolérance de sa propre famille** — sans dimension, donc px et rad
comparables : `2` veut dire « deux fois plus violé qu'il n'en faut pour être listé ». C'est le seuil
qui alimente déjà le panneau, donc le plafond vise exactement ce que l'utilisateur voit.

La violation étant **proportionnelle au pas**, diviser par la sévérité est un pas de Newton exact :
le plafond converge **en une image**, sans recherche ni oscillation. Vérifié sur les mesures
ci-dessus — 1.94 à un pas de 1/60 renvoie ~1/116, et 15.9 à 1/6 renvoie ~1/95 : des deux côtés on
retombe au bord de la falaise.

Trois propriétés voulues :

- **les mécanismes qui ne violent rien ne sont jamais plafonnés** — la famille Core XY, Jansen,
  Huygens, Vilbrequin gardent la vitesse de lecture entière, y compris à ×10. C'est ce qui répond à
  l'objection qui avait fait rejeter le plafond fixe : ×4 et ×10 restent distincts partout où le
  mécanisme peut suivre ;
- **jamais plus fin que `RECORD_DT`** : au-delà le pas coûte sans rien acheter, et un mécanisme
  réellement bloqué doit continuer à signaler son blocage, qui est le signal juste ;
- **un quart de plafond rendu par pas propre** (`max(sévérité, 0.8)`) : un mécanisme qui cesse de
  résister retrouve son avance rapide en quelques images au lieu de rester puni par un mauvais
  moment.

Ce que le plafond coûte quand il mord : du retard, affiché. Le seuil d'affichage de la ligne de
fidélité est passé à **10 % sous le nominal** — le plafond atterrit à quelques pour cent sous
120 Hz sans que rien ne soit dégradé, et une ligne qui clignote pour ça serait du bruit.

**Limites.** La sévérité est lue sur les contraintes *listées*, donc rien en dessous du seuil de
signalement ne freine le pas — une déchirure de 0.9 px passe. Le plafond n'a été vérifié que par le
banc et par les tests unitaires de `step_ceiling` : **son comportement en usage reste à regarder**,
en particulier sur `Poulie bloqueuse` à ×10, où il doit produire du retard au lieu d'une courroie
déchirée.

---

## Chantier 3 — les balayages du grab ✅ *(fait — `nbGrabIterations = 5`, validé à l'œil)*

### Le plancher de sortie : hypothèse fausse, correctif quand même gardé

`MIN_SWEEPS_BEFORE_EARLY_EXIT = 24` n'existait que pour le grab mais s'appliquait à **toutes** les
images. L'argument était qu'il taxait donc tout le monde. **Mesuré : faux.** Le plancher est
désormais conditionnel à la présence d'un `HandleGrab`, et les 9 scénarios **sans** grab de
`bit-exact` sortent à **0.00e+0** — rigoureusement inchangés. Aucun des mécanismes du dossier ne
voyait sa sortie anticipée bridée par 24, parce qu'aucun n'y est prêt avant : Huygens sort au 74ᵉ,
`Poulie bloqueuse` au 248ᵉ, la famille Core XY jamais.

Le correctif est gardé — il est juste, et il vaut là où le plan ne l'attendait pas : en **édition**,
où chaque solve porte un `HandleGrab` ([geometric-solver.ts](../../src/components/solver/geometric-solver.ts)
en émet un par drag) et où le plancher passe donc de 24 à 9.

> **À retenir : `nbGrabIterations` est partagé avec le solveur géométrique**, donc avec le
> déplacement d'un élément en édition — l'interaction la plus utilisée de l'application. Le plan
> ne le disait pas et le traitait comme un réglage de simulation.

### `nbGrabIterations` 20 → 5 : ce que ça coûte, mesuré

| mesure | avant (20) | après (5) |
| --- | --- | --- |
| Huygens entraîné à la main — course obtenue | ~38° | **19.0°** |
| Huygens — écart entre listages, absolu | 0.19° | **0.366°** |
| Huygens — écart entre listages, relatif à la course | 0.5 % | **1.9 %** |
| `bit-exact` — scénarios d'édition (drag de 43 px) | référence | 1.4 à **12.1 px** d'écart |
| `bit-exact` — scénarios sim+grab | référence | 1.7e-5 à 6.4 px d'écart |
| `bit-exact` — scénarios sans grab | référence | **0.00e+0** |

Lecture : le grab tire **environ deux fois moins**, ce qui est l'effet cherché sur la déformation
et l'effet subi sur le suivi. Mais l'écart entre listages **double en absolu et quadruple en
relatif**, parce que le mécanisme est laissé plus loin de sa convergence au moment où on le mesure.

**Verdict : validé à l'œil**, en simulation comme en édition. Référence `bit-exact` recapturée en
conséquence (18 scénarios sur 27 avaient bougé, par construction).

### Le garde-fou de déterminisme passait par chance — réparé

`belt-closed-determinism` est tombé sur ce changement, mais **pas pour la raison qu'il annonçait**.
Son garde-fou compare l'écart entre listages à la **course nette** du pignon, or le test entraîne
la poulie avec un curseur qui **tourne en rond** : la course nette oscille et passe près de zéro.
Mesuré aux valeurs de production d'alors (`grab = 20`), le même garde-fou sortait à **22.10 %** sur
`Poulie bloqueuse` à 120 images, pour une course nette de 1.72°. Il ne tenait qu'à l'échantillon.

Deux corrections, dont aucune n'est un relâchement de seuil :

- **course cumulée** (Σ|Δθ|) au lieu de la course nette — monotone, jamais proche de zéro. À elle
  seule elle ramène `Poulie bloqueuse` de 22.10 % à **0.04 %** ;
- **120 images au lieu de 60** : l'écart entre listages **n'accumule pas**, il oscille dans une
  bande de quelques dixièmes de degré ; il faut donc laisser la course la dépasser avant que leur
  rapport ait un sens. Sur Huygens : 1.9 % à 60 images (19° de course), 0.32 % à 120 (33°), 0.24 %
  à 480 — l'écart lui-même restant plat.

Et l'écart absolu est **le même à 5 et à 20** sur Huygens (0.10–0.38° contre 0.11–0.37° sur quatre
longueurs de course) : `nbGrabIterations = 5` ne dégrade pas le déterminisme. Le test réparé passe
aux deux valeurs — il n'a pas été taillé sur la nouvelle.

### Ce qui reste à mesurer, pour `nbGrabIterations` ∈ {2, 5, 10, 20, 40}

1. **le suivi** — écart entre le point saisi et la cible du curseur, en régime établi ;
2. **la déformation** — pire violation de contrainte pendant la traction, et au moment du
   lâcher ;
3. **les balayages exécutés**, avec le plancher de sortie anticipée ajusté en conséquence ;
4. **la stabilité** — le mécanisme oscille-t-il entre traction et détente d'une frame à l'autre ?

**Retour attendu :** le tableau, une recommandation, **puis vérification visuelle par
l'utilisateur** : le suivi d'une saisie est une sensation, pas un nombre. Le banc dit ce qui est
possible ; c'est l'œil qui choisit.

---

## Chantier 5 — le coût par balayage qui reste ✅ *(mesuré ; les deux cibles sont vides)*

Ce chantier nommait deux cibles chiffrées. **Les deux tombent à la mesure**, et il n'y a rien à
optimiser. Banc :
[diagnostics-cost.bench.test.ts](../../src/components/solver/diagnostics-cost.bench.test.ts).

### `collectDiagnostics` ne coûte rien — les ~8 % ne se reproduisent pas

Les deux réglages avancent **en lockstep, image par image**, sur deux modèles identiques : ce qui
dérive pendant la mesure (paliers du JIT, GC, thermique) frappe alors les deux à une image près au
lieu de tomber sur celui qui tourne en premier.

| mécanisme | Core XY - 2 m. | Déconnexion | Huygens | Jansen | Poulie bl. | Vilbrequin |
| --- | --- | --- | --- | --- | --- | --- |
| surcoût, passe 1 | −8.4 % | −1.8 % | −3.1 % | −2.1 % | +1.9 % | +6.3 % |
| surcoût, passe 2 | −0.5 % | −2.1 % | +2.1 % | +5.5 % | −0.8 % | −0.2 % |

Centré sur zéro, des deux côtés du zéro, sur deux exécutions indépendantes. C'est cohérent avec ce
que le drapeau fait réellement : **un rangement dans un tableau par lien et par balayage**
(`residuals[idx] = err`), l'erreur étant de toute façon calculée puisque `maxError` la lit.

> **Deux pièges de méthode, notés parce qu'ils m'ont coûté deux mesures fausses.** Re-résoudre un
> état déjà convergé mesure la **sortie anticipée** et rien d'autre : 27 µs pour 300 balayages
> demandés. Et alterner les deux réglages *par passe* laisse passer une dérive systématique de 17
> à 45 %, dans le mauvais sens — il faut alterner **par image**.

Et la correction proposée n'était pas seulement inutile, elle était impraticable : les fonctions de
contrainte **calculent l'erreur et appliquent la correction d'un même geste**. Une « passe finale
dédiée » aurait exigé une vingtaine de fonctions d'évaluation seule, soit une seconde source de
vérité pour chaque contrainte.

### `BeltPin` boxé : le lien n'existe pas là où ça compte

Recensement sur les modèles compilés :

| mécanisme | BeltPin | BeltJunction | BeltFollowsTangent | liens | nœuds | octets/snapshot |
| --- | --- | --- | --- | --- | --- | --- |
| **Core XY - 2 moteurs** | **0** | 0 | 0 | 46 | 25 | 480 |
| Déconnexion courroie | 1 | 0 | 0 | 17 | 11 | 200 |
| Huygen's chain drive | 1 | 0 | 0 | 19 | 12 | 232 |
| Poulie bloqueuse | 1 | 0 | 0 | 14 | 9 | 176 |
| Jansen, Vilbrequin | 0 | 0 | 0 | 15 / 6 | 9 / 5 | 160 / 88 |

**`BeltJunction` et `BeltFollowsTangent` n'existent sur aucun mécanisme du dossier** — le plan en
parlait comme d'une dette à trois liens ; c'en est une à un seul. Et `BeltPin` est **absent du
Core XY**, c'est-à-dire du pire cas de l'application (12.8 ms/image).

Estimation du gain, en croisant le micro-profil du chantier 4 (2806 ns par reconstruction boxée,
~2.3× en scalaire, soit ~1600 ns économisés) avec les balayages et les ms/pas mesurés au
chantier 2 : **3 % sur `Poulie bloqueuse`, ~10 % sur Huygens, ~13 % sur `Déconnexion courroie`,
0 % sur toute la famille Core XY.** C'est une estimation, pas une mesure — la mesurer exigerait
d'écrire la version scalaire, c'est-à-dire de faire le travail.

**Fait quand même, sur décision de l'utilisateur** : un codebase où la moitié des contraintes de
courroie sont scalaires et l'autre boxée est une dette qui se paiera plus cher plus tard, et le gain
n'est pas nul.

`belt-path.ts` gagne `belt_total` et `belt_locate` — la localisation d'une abscisse curviligne
(point, tangente, courbure, vias encadrants) **en une traversée, sans construire un seul
`BeltPiece` ni un seul `Point2`**. Transcrit terme à terme du chemin boxé, y compris **l'ordre dans
lequel les longueurs sont sommées** : l'addition flottante n'est pas associative, et les deux
doivent rendre les mêmes bits.

Les deux liens de simulation sont portés dessus : `applyBeltPinConstraint` (qui perd du même coup sa
reconstruction complète, son `piece_at_arclength` et son `Set` de slots par application) et
`applyBeltFollowsTangentConstraint`. **`bit-exact` passe sur les 27 scénarios** — c'est le critère
que le dossier s'était donné pour ce genre de conversion.

> **Gain non mesuré, et c'est assumé.** Un A/B honnête exigerait de ressusciter le chemin boxé
> derrière un drapeau ; pour un changement déjà prouvé bit-identique, ça ne se paie pas. L'estimation
> reste celle ci-dessus : ~3 % sur `Poulie bloqueuse`, ~10 % sur Huygens, ~13 % sur
> `Déconnexion courroie`, 0 % sur la famille Core XY.

**`applyBeltJunctionConstraint` reste boxée, délibérément** : elle n'est émise que par le solveur
**géométrique** (édition), jamais en simulation — d'où le 0 dans la table ci-dessus. Et elle ne fait
pas une lecture d'abscisse mais une **projection** (le point le plus proche sur toutes les pièces),
donc elle ne réutilise pas `belt_locate`. Elle reste sur le chemin chaud d'une interaction, ce qui
en fait une dette réelle, mais d'un autre chantier.

### Code mort retiré

- `experimental/gear-pin-cooperative.ts` — la variante coopérative du `GearPerimeterPin`, éliminée
  par la mesure à `belt-gear-pin-arbitration.md`. Elle n'était atteignable que si un lien portait
  `cooperative`, que le parseur ne pose jamais, et **aucun test ne l'appelait plus** depuis le
  retrait des 22 bancs φ‑vs‑q. Le champ du type de lien, la branche du solveur et l'enveloppe de
  test partent avec ;
- `experimental/belt-q-bench.ts` — les géométries de mesure du tour q, plus importées par personne ;
- `piece_at_arclength` — son unique appelant était le `BeltPin` boxé.

### Fait quand même

Le piège latent est corrigé : `PBD_kinematic_solver` et `PBD_solve` n'ont plus de `nbIterations = 200`
par défaut, le paramètre est requis. Les deux appelants de production passaient déjà 300 (`DEFAULT_SWEEPS`
en simulation, un littéral en édition), donc rien ne change ; c'est l'appelant distrait qui ne peut
plus tomber silencieusement sur l'autre vérité.

`step_simulation` porte désormais un paramètre `collectDiagnostics` optionnel, à `true` par défaut.
Il n'existe que pour ce banc — c'est le prix de garder la preuve du résultat négatif.

---

## Chantier 4 — le solveur hors du thread UI

**La réponse structurelle.** L'enregistrement est une fonction pure du modèle qui produit des
snapshots ; la relecture les lit. Dans un Web Worker, **l'affichage n'attend plus jamais le
solveur** — la simulation peut enregistrer moins vite que le temps réel sans que l'app
saccade.

> **Ce que le chantier 1 a changé à l'énoncé.** L'affichage tient déjà ses 60 fps — c'est le budget
> par image qui le garantit. Le worker n'achète donc plus de fluidité, il achète du **débit** : le
> solveur cesse d'être plafonné à 8 ms par image de 16.7 ms, et le thread principal est rendu au
> dessin. Attendu ~2×, sur tous les mécanismes.

> **Le format des snapshots n'est PAS un point dur — mesuré.** Un snapshot pèse **480 octets au
> pire** (`Core XY - 2 moteurs` : 25 nœuds, 10 angles), soit 57 ko/s à 120 Hz. Le passage en
> `Float64Array` transférable, présenté ci-dessous comme un préalable, économiserait donc des
> microsecondes sur une frontière qui n'est pas un goulot, au prix d'un changement de
> représentation touchant le dessin, les sondes, l'interpolation et `bit-exact`. **On garde le
> format actuel** et on ne le rouvrira que si un profil désigne la frontière — ce que les 480 octets
> rendent improbable.

**Les points durs, à traiter dans la conception :**

- ~~**le format des snapshots.**~~ **Écarté par la mesure**, voir l'encadré ci-dessus ;
- **la saisie n'a plus d'aperçu synchrone** (chantier 0) : elle passe par la boucle
  d'enregistrement, donc par le worker. Il faut que la cible du curseur y arrive vite — un
  message par événement pointeur, sans attendre de réponse ;
- **l'invalidation** : toute édition recompile le modèle. Le worker doit le recevoir, et la
  frontière d'enregistrement doit être jetée proprement ;
- **le mode édition** (`geometric-solver`) est synchrone et interactif : hors périmètre.

**Critère.** L'affichage reste à 60 fps pendant l'enregistrement, quel que soit le mécanisme.
Et les snapshots produits sont **identiques** à ceux du chemin synchrone — c'est exactement ce
que `bit-exact.test.ts` sait vérifier.

### Étape 1 — extraire le moteur d'enregistrement ✅ *(fait, synchrone)*

[recorder.ts](../../src/components/solver/recorder.ts) : une classe `Recorder` qui possède le
modèle compilé, le coût mesuré d'un pas et le plafond de pas, et qui transforme « avance l'horloge
simulée jusqu'à T » en snapshots, dans un budget. **Sans React, sans DOM, sans notion d'image** —
c'est la pièce qui traversera la frontière, écrite pour ne dépendre que du solveur.

`App` ne garde que l'horloge et le curseur : la boucle RAF passe de ~70 lignes à un appel. Les cinq
endroits qui recompilaient le modèle appellent `load(mécanisme, snapshotDeReprise)`, la saisie passe
par `setGrab`. `simulationModelRef`, `kinematicGrabRef`, `stepCostRef` et `stepCeilingRef`
disparaissent — leur état vit dans le `Recorder`.

**Refactor pur, vérifié** : 341 tests, `tsc` et ESLint propres, `bit-exact` inchangé.

> **Pourquoi s'arrêter là avant le worker.** Cette étape ne change *rien* au comportement mais
> déplace le câblage de la simulation — propriété du modèle, chemin de la saisie, trois chemins de
> réinitialisation. Le critère du chantier est visuel ; empiler l'asynchronisme dessus avant qu'un
> œil l'ait vu, c'est mêler deux diffs dont un seul peut être jugé. Le dossier a déjà tranché ce
> genre d'arbitrage au chantier 4 du plan précédent : *aller au bout de ce qui ne change rien avant
> d'envisager ce qui change quelque chose*.

### Étape 2 — le worker ✅ *(fait, vérification visuelle en attente)*

Quatre fichiers :
[recorder.worker.ts](../../src/components/solver/recorder.worker.ts) (la boucle, hors thread UI),
[recorder-client.ts](../../src/components/solver/recorder-client.ts) (la poignée côté principal),
[recorder-protocol.ts](../../src/components/solver/recorder-protocol.ts) (ce qui traverse) et le
`Recorder` de l'étape 1, inchangé — il traverse tel quel, ce pour quoi il avait été écrit.

**Le worker ne répond pas à une requête par image.** Il court vers une **cible** que le thread
principal déplace à chaque image et qu'il n'attend jamais ; il travaille par tranches bornées par
`FRAME_BUDGET_MS`, non plus pour protéger un affichage qu'il ne bloque plus, mais pour que les
messages en attente — nouvelle cible, saisie, édition — aient leur tour : la file n'est servie
qu'entre deux macrotâches, d'où le `setTimeout(0)` entre les tranches. Le worker possède le coût, le
plafond et la taille de pas ; le thread principal garde l'horloge, le curseur et le retard.

**La simulation se mettait en pause toute seule — défaut pré-existant, révélé.** Un seul endroit
pose `isPlaying: false` : la branche de **relecture**, quand le curseur atteint la frontière. On y
entrait sur `is_replaying`, un test qui **déduisait l'intention d'une comparaison de temps** : le
curseur est-il en retard sur la frontière ?

C'est cette déduction qui est fausse, pas son seuil. Pendant l'enregistrement, la frontière devance
légitimement le curseur — d'un demi-pas par construction (un pas couvre `stepDt` de temps simulé
pendant que le curseur n'avance que de ce que l'image a demandé), plus l'avance du worker, plus la
latence d'un message. Aucun seuil ne sépare proprement ces deux situations, et un premier correctif
qui élargissait la tolérance à un pas entier **n'a pas suffi**.

**Corrigé en remplaçant la déduction par l'intention.** `runtimeState.scrubbed` dit que le curseur a
été posé à la main — glissement sur la timeline, clic sur un graphe, retour au début — et qu'il n'a
pas rattrapé l'enregistrement depuis. La relecture est décidée **une fois**, à la reprise de la
lecture, à partir de ce drapeau ; elle se termine en atteignant la frontière, ce qui l'efface. Le
portillon de la saisie (chantier 0) le lit aussi : c'est la même question. `is_replaying` est
supprimée — la garder inviterait à réintroduire exactement ce défaut.

**Un second défaut, trouvé en cherchant le premier : l'horloge tournait à moitié vitesse.** Le
curseur était plafonné par `reached`, qui décrit toujours la cible de l'image **précédente** — un
worker répond entre deux images, pas dedans. À ×1 il n'avançait donc que de `stepDt/2` par image au
lieu de `simDt`, la frontière lui échappait, et l'écart finissait par franchir n'importe quel seuil.

La cible envoyée au worker prend donc de l'avance — **deux images**, et le compte est délibéré : la
première annule le décalage d'une image, la seconde écarte le plafond. Avec une seule, le plafond
retombe *pile* sur la cible et mord une image sur deux : le curseur avance par à-coups, ce qui se
voit comme un mécanisme qui accélère et ralentit. Ça ne coûte rien — le worker s'arrête à sa cible —
sinon d'enregistrer un peu au-delà de ce qui est affiché.

**Troisième lieu où un temps était comparé au lieu d'un état : la timeline.** Elle calculait
`recording = isPlaying && time >= frontier - RECORD_DT`. Or la frontière devance maintenant le
curseur d'une quantité qui **varie d'une image à l'autre** (le worker produit par à-coups), donc la
tête basculait entre ses deux apparences à ce rythme. Elle lit `scrubbed` comme le reste.

**Trois points de correction que la conception ne prévoyait pas :**

- **un compteur d'époque.** Une édition tronque l'enregistrement et recharge le modèle ; les
  snapshots encore en vol décrivent le mécanisme d'avant et seraient ajoutés *après* la troncature
  censée les supprimer. Chaque `load` incrémente l'époque, le worker la renvoie, le client jette ce
  qui est périmé ;
- **`stop` à la pause, une seule fois.** Laissé courant, le worker continuerait d'enregistrer vers
  la dernière cible reçue, bien au-delà de la pause. Une `target` le relance — mettre en pause puis
  relire ne doit pas exiger de recharger le modèle ;
- **l'historique d'annulation est retiré du mécanisme envoyé.** Le worker ne fait que simuler, et
  c'est le gros d'une longue session d'édition — re-sérialisé à chaque édition faite en cours de
  simulation.

**Vérifié :** `tsc`, ESLint, 341 tests, et la build émet bien le worker en chunk séparé (123 ko).
**Non vérifiable par l'agent :** le critère du chantier est le ressenti, et il est maintenant
asynchrone de bout en bout.

**Ce qui reste ouvert.** Le budget de tranche est resté à 8 ms alors qu'il ne protège plus rien
d'autre que la réactivité aux messages : il pourra monter. Et le gain de débit — ~2× attendu —
**n'est pas mesuré** ; il ne le sera proprement qu'en comparant deux enregistrements de même durée
simulée, ce qui suppose un banc qui pilote l'app.

### Conception d'origine

**La frontière est dégagée**, les deux inconnues ayant été levées : la chaîne du solveur est sans
DOM (vérifié : aucun `window`/`document`/`localStorage`), et `serialize_mechanism` /
`deserialize_mechanism` font déjà l'aller-retour du mécanisme — c'est le chemin de la sauvegarde,
donc le plus éprouvé de l'application.

Ce qui reste à écrire :

- **le protocole.** Le worker ne doit pas répondre à une requête par image, sinon il dort entre les
  images et le débit ne gagne rien. Il **court librement** vers une *cible* que le thread principal
  réactualise à chaque image (`cible += realDt × vitesse`), travaille par tranches d'environ 8 ms
  pour laisser passer les messages entre deux macrotâches, et poste ses snapshots par paquets. Le
  worker possède le coût, le plafond et la taille de pas ; le thread principal possède l'horloge, le
  curseur et le retard ;
- **la réanimation des snapshots.** `structuredClone` conserve les `Map` mais dépouille les `Point2`
  de leur prototype : un `revive` d'une ligne à l'arrivée, à un seul endroit. Aucun changement de
  format — 480 octets par snapshot ;
- **l'invalidation** : `load` devient un message portant le mécanisme sérialisé, déjà posé sur le
  snapshot courant ;
- **la saisie** : un message par événement pointeur, sans attendre de réponse.

---

## Chantier 5 — le coût par balayage qui reste

Deux cibles nommées, chiffrées, jamais traitées :

- **`BeltPin` est resté sur le chemin boxé** au chantier 4 (un lien par courroie **fermée**,
  donc absent de la famille Core XY qui était alors le sujet). C'est ce qui explique que les
  mécanismes fermés n'aient gagné que ×1.5 là où les ouverts gagnaient ×2.6 à ×3.3. Le
  micro-profil [belt-geom.bench.test.ts](../../src/components/solver/belt-geom.bench.test.ts)
  existe pour dire quoi en faire ;
- **`collectDiagnostics` tourne en permanence en simulation (~8 %)** alors que les résidus ne
  sont lus qu'en fin de résolution. Une passe finale dédiée récupérerait presque tout.

**À faire au passage, c'est un piège latent :** `PBD_kinematic_solver` et `PBD_solve` ont
`nbIterations = 200` par défaut dans leur signature pendant que l'appelant passe
`DEFAULT_SWEEPS = 300`. Deux vérités ; un appelant qui oublie le paramètre tombe
silencieusement sur l'autre.

---

## Chantier 6 — la limite de balayages

**Ce qui reste de la question d'origine.** Les mesures l'ont beaucoup relativisée : la sortie
anticipée **s'adapte déjà** au pas, et c'est probablement elle qui rend 240 Hz gratuit sur le
Core XY (chantier 2). Le plafond de 300 n'est pas le levier qu'on croyait.

Il garde quand même un rôle : c'est le **plancher de qualité** des mécanismes qui rampent sans
jamais déclencher la sortie — aujourd'hui la famille Core XY et `Déconnexion courroie`. Sur
eux, et sur eux seuls, baisser la limite tronque directement.

> **Le nombre réellement exécuté est maintenant mesuré** (chantier 2) : la famille Core XY et
> `Déconnexion courroie` consomment 300 balayages **à toutes les tailles de pas**, et les autres
> sortent entre le 58ᵉ et le 300ᵉ selon leur conditionnement. Sur les premiers, baisser la limite
> tronque directement ; sur les seconds elle est déjà sans effet.

**À trancher en dernier**, une fois connus le coût réel d'un balayage (chantiers 4 et 5), le
nombre réellement exécuté (chantier 2) et la fréquence retenue. Le bon critère n'est pas « ce
qu'on perd à la frame N » mais **« la dérive plafonne-t-elle ou croît-elle »** sur 1000+ frames
— binaire, lisible sans interprétation, et déjà validé comme indicateur au chantier 2 du plan
précédent.

---

## Dettes et hors périmètre

- **Le rampement n'est pas réparable et n'a pas à l'être** : c'est le rayon spectral de
  Gauss-Seidel sur une chaîne, `r ≈ 1 − c/N²`, reproduit sur une chaîne nue sans aucune
  courroie ([rampement.md](./rampement.md)). Ce qui reste ouvert est un **préconditionneur**,
  fil jamais tiré de [préconditionneur.md](./préconditionneur.md).
- **La déchirure de `Déconnexion courroie`** : 0.82 px permanents, cause inconnue après huit
  hypothèses — mais **98 % de son rampement est sur le même nœud que son résidu**, `d46ee1bd`.
  Une adresse où regarder si on rouvre.
- **La métrique angulaire du solveur est incohérente** (plan d'implémentation, dettes).
- **La traversée des points morts** : un mécanisme au point mort déchire puis traverse au lieu
  de s'arrêter. Préexistant, indépendant des courroies, chantier à part entière.
- **Échafaudages à retirer quand ce plan sera fini** : `sweep-probe.ts` et son extension
  `shape`, `creep.bench.test.ts`, `record-rate.bench.test.ts`, et `bit-exact.test.ts` — ce
  dernier **seulement après le chantier 4**, dont il est le critère d'acceptation.
