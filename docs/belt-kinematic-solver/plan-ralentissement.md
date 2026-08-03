# Plan — le ralentissement, repensé

Suite de [plan-fluidite.md](./plan-fluidite.md), dont les chantiers 0 à 5 sont faits.

**Arrêt et retour à la fin de chaque chantier.**

> **Ce plan a été réécrit en cours de route, et il faut savoir pourquoi.** Son énoncé
> d'origine attribuait tout le ralentissement au producteur — le solveur, le worker, le pas —
> et proposait six chantiers dans cette direction. La mesure a montré autre chose : le
> producteur tenait le temps réel avec 42 % de marge pendant que **l'application n'affichait
> que 20 images par seconde**, parce qu'elle reconciliait tout son arbre React à chaque image.
> Le chantier qui a rendu la fluidité (1 bis) n'était pas au programme ; deux de ceux qui y
> étaient sont devenus sans objet.
>
> Ce qui reste à faire n'est donc plus « aller plus vite ». C'est **retirer ce qui se
> contredit, dépenser la marge retrouvée en précision, et supprimer ce qui n'apporte rien.**

---

## Contexte à charger

1. [plan-fluidite.md](./plan-fluidite.md) — l'état de la simulation, et pourquoi le pas est
   devenu adaptatif. **Contient les mesures de fidélité et de coût.**
2. La section « ce qui est mesuré » ci-dessous.
3. [plan-implementation.md](./plan-implementation.md) — règles de travail et pièges.
   **Notamment : ne jamais comparer deux mesures de vitesse prises à des instants
   différents.**

Bancs de ce tour : [startup.bench.test.ts](../../src/components/solver/startup.bench.test.ts),
[cursor-clock.bench.test.ts](../../src/components/solver/cursor-clock.bench.test.ts).

**Une leçon de méthode, tirée du chantier 1 bis et qui vaut au-delà de lui : mesurer sur une
build de production avant de conclure sur un coût React.** `react-dom.development` et le double
rendu de `StrictMode` n'ont expliqué que **30 %** de l'écart, pas un facteur 4 — ils ne
réexécutent que les corps de composants, ni le commit ni le DOM. Conclure sans vérifier aurait
fait refondre l'architecture sur un chiffre faux ; ne regarder que la production aurait fait
croire le chantier inutile.

---

## Le principe

**Une seule réponse à « on n'arrive pas à suivre » : on va moins vite, proprement.**

Il y en a trois aujourd'hui, et elles se contredisent — `recording_step` dit *« le temps réel
est sacré, la précision cède »*, `step_ceiling` dit *« les contraintes sont sacrées, le temps
cède »*, `lag` est le résidu du second. Laquelle s'applique dépend de si le mécanisme viole des
contraintes : ce n'est pas une règle, c'est un comportement émergent. **Le pas ne grossit plus
jamais**, et les deux autres disparaissent avec lui.

**Et un second principe, que la mesure a imposé : chaque solveur s'arrête sur son propre
critère.**

L'arrêt anticipé actuel borne le **mouvement restant** — « plus rien ne bougera assez pour que
ça compte ». C'est le bon critère en simulation, où l'on rend la main à une image qui attend et
où la frame suivante repart à chaud. **Ce n'est pas le bon en édition**, où l'on ne rend la main
à personne : ce qu'on veut là est que le dessin soit juste, donc que les **contraintes soient
satisfaites** — un mécanisme peut cesser de bouger en restant faux. Le ralentissement y est
acceptable ; l'à-peu-près ne l'est pas.

Ce qui reste de la vitesse demandée : une **cible** pendant l'enregistrement, une **promesse**
en relecture. C'est la seule chose que l'utilisateur ait à comprendre.

---

## Ce qui est mesuré

### Le démarrage : ni le solveur ni la compilation

| mécanisme | sérialiser+revivre | compiler | **1er pas** | régime établi |
| --- | --- | --- | --- | --- |
| Core XY - 2 moteurs | 16.5 ms | 2.4 ms | **4.9 ms** | 5.2 ms |
| Déconnexion | 1.4 | 1.1 | 2.5 | 1.5 |
| Jansen | 2.5 | 0.4 | 0.3 | 0.3 |

**Le premier solve n'est pas plus cher que les suivants** — il est même légèrement moins. Il
n'y a aucune pénalité de départ à froid dans le solveur. Et tout ce qu'un pré-chargement
supprimerait fait **~24 ms sur le pire mécanisme** : une frame et demie, donc pas l'attente
observée. Elle est ailleurs — dans le démarrage du worker lui-même (chunk de 123 ko à
récupérer et parser) et le premier aller-retour de message, pendant lesquels `reached === null`
et l'horloge ne bouge pas du tout.

### La saccade : elle n'apparaît qu'en surcharge, et le tampon n'y peut rien

Simulation de la politique d'horloge contre un producteur synthétique — **pas une mesure de
l'app** :

| producteur (×1 demandé) | débit / demande | **gigue actuelle** | gigue lissée |
| --- | --- | --- | --- |
| Core XY (5.2 ms/pas) | 1.16× | **0.00** | 0.00 |
| Core XY, `MessageChannel` | **1.60×** | 0.00 | 0.00 |
| Core XY, tranche 50 ms | 1.49× | 0.00 | 0.00 |
| Poulie bloqueuse | 3.21× | 0.00 | 0.00 |
| Jansen | 18.6× | 0.00 | 0.00 |
| **Core XY à ×4** | **0.29×** | **0.20** | **0.02** |

> **Le producteur du banc a d'abord été faux, et dans le sens qui invente une surcharge.** Il
> comptait `floor(tranche / coût)` pas par tranche et facturait `tranche` ms de temps mural.
> Or `Recorder.advance` teste le budget **après** le pas : une tranche déborde toujours d'un
> pas et dure aussi longtemps que les pas qu'elle a lancés. Sur le Core XY c'est **2 pas en
> 10.4 ms**, pas 1 pas en 8 ms. Le tableau d'origine annonçait 0.69× à ×1 ; c'est 1.16×.

Trois lectures :

- **tant que le débit couvre la demande, la politique actuelle est déjà parfaitement lisse.**
  La saccade est *exactement* le cas de surcharge — et la surcharge commence **au-dessus de
  ×1**, pas à ×1 ;
- **le tampon n'y change rien** : de 0.05 s à 1 s de profondeur visée, gigue et vitesse
  effective sont identiques. On ne tamponne pas ce qu'on ne produit pas. Ce qui supprime la
  gigue est le **lissage du taux** — 0.20 → 0.02 à ×4, à vitesse effective inchangée ;
- **la cession est le levier, pas la tranche.** Le `setTimeout(0)` est clampé à 4 ms par la
  spec dès que l'imbrication dépasse 5 niveaux, ce qu'une boucle d'enregistrement atteint
  immédiatement. Une fois la cession gratuite, le débit atteint son plafond de producteur
  (1.60× = 8.33 ms simulées par pas de 5.2 ms réelles) et **la taille de tranche cesse d'avoir
  le moindre effet** — la ligne « 50 ms » est en dessous.

> **Une corroboration figurait ici, et elle était fausse.** Elle raisonnait ainsi : la saccade
> n'existait pas avant la séparation du worker, donc c'est le worker qui a cassé le
> verrouillage entre production et affichage. L'histoire se tenait ; la mesure l'a démentie.
> La saccade à ×1 était le **thread principal** (chantier 1 bis), et son coût — un
> `setRuntimeState` par image — existait bien avant le worker. Un récit cohérent n'est pas une
> mesure.

### Le thread principal : c'était là, et rien ne le regardait

Le tableau complet est au chantier 1 bis. Ce qu'il faut en retenir ici : **le dessin du canvas
coûte 1 à 2 ms par image, la reconciliation React en coûtait 42**, et l'application ne rendait
que 20 images par seconde en build de production pendant que le worker tenait ×1 avec 42 % de
marge. Aucun des six chantiers d'origine ne regardait de ce côté.

---

## L'ordre

```
0.   le worker au lancement de l'app      ── fait ; l'attente a disparu          ✅
1.   MessageChannel au lieu de setTimeout ── fait ; +37 % mesuré en vol          ✅
1bis le curseur hors de React             ── fait ; 20 → 60 fps, non prévu       ✅
2.   le pas ne grossit jamais             ── fait ; ×10 validé à l'œil          ✅
3.   la précision retrouvée               ── mesuré ; garder 200, rien à gagner  ✅
4.   l'arrêt du solveur d'édition         ── fait ; à vérifier à l'œil            ✅
4ter le grab                              ── mesuré ; c'était le plafond, pas le compte
4bis le ralentissement uniforme           ── fait, validé à l'œil                 ✅
5.   ce qui n'apporte rien                ── fait ; l'avance, elle, apporte        ✅
6.   vérifications et nettoyage           ── fait ; 13 échafaudages retirés       ✅
```

**Le plan est terminé.** Ce qui reste ouvert est listé au chantier 6.

Raisons de cet ordre :

- **le 2 d'abord** parce qu'il est purement soustractif, et parce qu'il rend l'axe de temps de
  l'enregistrement uniforme et reproductible d'une machine à l'autre. Mesurer la précision (3)
  sur un pas qui varie avec la charge n'aurait aucun sens ;
- **le 3 avant le 4** parce que les deux touchent le même code d'arrêt et que la simulation est
  le seul des deux cas qui soit instrumenté. L'édition n'a aucun banc : son critère est un
  ressenti de justesse, donc il se juge à l'œil, sur un code d'arrêt déjà remanié ;
- **le 5 en dernier des chantiers actifs** : on ne retire une avance de sécurité qu'une fois
  qu'on sait ce que le producteur tient réellement.

---

## Chantier 0 — le worker au lancement de l'app ✅ *(fait, vérifié à l'œil)*

`recorder()` est appelé en tête de l'effet RAF, qui tourne une fois au montage
([App.tsx](../../src/App.tsx)). L'accesseur reste paresseux — il doit pouvoir reconstruire
après un `dispose` — et le double montage StrictMode est sûr : React exécute tous les
nettoyages avant tous les effets, donc l'ordre est `dispose` + `null` puis recréation.

**Verdict de l'utilisateur : l'attente a disparu**, ce qui reste n'est pas perceptible. Ce
qui reste, justement : l'entrée en simulation sérialise encore le mécanisme **sur le thread
principal** (16.5 ms au pire), poste le `load`, et le worker compile (2.4 ms) — deux images
environ, pendant lesquelles `reached` ne bouge pas.

### L'énoncé d'origine

**Décision prise : le worker est créé au lancement de l'application, point.** Pas de
pré-compilation du modèle, pas de clé de cache, pas de pré-enregistrement — la mesure montre
que ces termes valent ~24 ms et ne sont pas le problème.

Aujourd'hui `recorder()` instancie le `RecorderClient` **au premier appel**, qui est l'entrée
en mode simulation — au moment même où la lecture démarre. Le chunk du worker est récupéré et
parsé pendant que l'utilisateur attend que ça bouge.

**Points d'attention.** L'effet RAF a des dépendances `[]` et son nettoyage fait
`dispose()` + `null` : le worker vit déjà toute la session, il est seulement créé **trop
tard**. Vérifier que le créer plus tôt ne double pas sa création en StrictMode (montage
double en développement).

**Critère.** Entrer en mode simulation ne fait plus attendre. **Vérification visuelle par
l'utilisateur** — et si l'attente persiste, c'est qu'elle n'était pas là, ce qui est une
information en soi.

---

## Chantier 1 — `MessageChannel` au lieu de `setTimeout(0)` ✅ *(fait, mesuré en vol)*

`schedule()` cède par un aller-retour de port. Le clamp a été mesuré au lieu d'être supposé :
les deux ordonnanceurs ont alterné par périodes de 2 s **dans une même session** de l'app,
sur `Core XY - 2 moteurs` à ×4, la sonde s'effaçant d'elle-même après 8 périodes.

| ordonnanceur | débit | ms / pas | / demande à ×1 |
| --- | --- | --- | --- |
| `setTimeout(0)` | 124.6 pas/s (8.0 s) | 8.03 | 1.04× |
| **`MessageChannel`** | **170.6 pas/s (8.0 s)** | **5.86** | **1.42×** |

**+37 %, et le clamp est confirmé au chiffre près** : 2.17 ms de retard par pas, à deux pas
par tranche, font 4.3 ms par tranche. C'est le plancher de 4 ms de la spec, vu en vol.

Deux corollaires qui ne se devinaient pas :

- **le coût d'un pas dans le navigateur est de 5.86 ms**, contre 5.2 ms mesurées sous node
  par `startup.bench` : +13 %. Les mesures du dossier transposent, ce qui n'allait pas de soi ;
- **170.6 pas/s est le plafond du producteur** — 120 pas/s sont demandés à ×1, donc le worker
  tient le temps réel à ×1 avec **42 % de marge**. La sous-production n'explique donc pas la
  saccade observée à ×1 — c'est ce constat qui a ouvert le chantier 1 bis.

**Réserve.** Mesuré sur un seul mécanisme, un seul navigateur, une seule machine. Et la sonde
retirée, plus rien ne surveille ce débit.

### L'énoncé d'origine

> Ses renvois au « chantier 2 » visent le lissage du taux, qui était alors le chantier suivant
> et qui est aujourd'hui hors périmètre.

`schedule()` dans
[recorder.worker.ts](../../src/components/solver/recorder.worker.ts) fait `setTimeout(slice, 0)`.
Le rappel étant récursif, le niveau d'imbrication dépasse vite 5 et **la spec impose alors un
plancher de 4 ms**. Sur des tranches de 8 ms, c'est un tiers du temps passé à ne rien faire.

Un tour de `MessageChannel` (`port.postMessage(null)` → `onmessage`) est une macrotâche comme
`setTimeout`, donc **la file des messages est servie de la même façon**, mais sans le plancher.

**Attendu**, si le modèle est juste : le Core XY passe de **0.69× à ~1.39×** du débit demandé à
×1 — il tient le temps réel avec de la marge, et la saccade disparaît d'elle-même sur ce
mécanisme.

**À vérifier plutôt qu'à croire.** Le clamp à 4 ms est une lecture de spec, pas une mesure dans
ce navigateur. Mesurer le nombre de pas produits par seconde réelle, avant et après, **dans le
même processus** — c'est un cas où l'ancien chemin doit rester derrière un drapeau le temps de
la mesure.

**Ce que ça ne règle pas :** les mécanismes réellement trop lourds, et les vitesses élevées. Le
chantier 2 reste nécessaire.

**Critère.** Débit mesuré avant/après, et aucun changement de comportement par ailleurs — la
file de messages doit rester servie à la même granularité (une saisie ne doit pas devenir moins
réactive).

---

## Chantier 1 bis — le curseur hors de React ✅ *(fait, vérifié à l'œil)*

**Comment il a été trouvé.** Le chantier 1 mesuré, le worker tenait ×1 avec 42 % de marge et
le banc corrigé annonçait une gigue nulle — mais la saccade était toujours là, à ×1. Les deux
ne pouvaient pas être vrais à la fois. Une sonde posée dans la boucle RAF a tranché en une
mesure : **l'application rendait 15 images par seconde.** Le solveur n'y était pour rien.

Le partage, mesuré en trois temps sur `Core XY - 2 moteurs` :

| | image (médiane) | dessin canvas | React, par commit | commits / 150 images |
| --- | --- | --- | --- | --- |
| développement | 66.7 ms | 1 ms | 60 ms | 150 |
| **production**, avant | **50.0 ms** | 2 ms | **42 ms** | 150 |
| **production**, après | **16.7 ms** | 1–2 ms | 23 ms | **25** |

Trois lectures, dont deux qui ont failli faire prendre une mauvaise route :

- **le dessin est innocent** — 1 à 2 ms sur 50. C'est React qui prend 85 % de l'image ;
- **il n'y a aucun point chaud.** Le coût réparti sur l'arbre : barre d'outils 20 ms, panneau
  12 ms, le reste du contenu 19 ms, le corps d'`App` et les dialogues 10 ms. Mémoïser un
  sous-arbre aurait rendu un tiers au mieux ;
- **la build de développement n'explique que 30 %**, pas un facteur 4. `react-dom.development`
  et le double rendu StrictMode ne réexécutent que les corps de composants, pas le commit ni le
  DOM. Conclure sans mesurer en production aurait été une faute ; mesurer en production seule
  aurait fait croire le chantier inutile.

**Ce qui a été fait.** [sim-clock.ts](../../src/components/solver/sim-clock.ts) porte l'état de
simulation hors de React, et la découpe est celle-ci : **l'intention reste dans React, la
mesure en sort.** `isPlaying`, `speed`, `scrubbed`, `current`, `history` atteignent l'affichage
immédiatement — l'utilisateur vient de les demander. `time`, `kinematicSnapshots`, `lag` et
`recordStep` changent par image et personne ne les décide : React n'en voit qu'un **miroir à
10 Hz**.

`set_sim_clock` a la signature de React et est importé sous le nom `setRuntimeState` : **aucun
des appelants n'a changé**, y compris ceux d'`AnalysisPanel`.

La boucle RAF lit `sim_clock()` et non plus une ref remplie au rendu — c'est ce point qui
interdisait la solution paresseuse : une simple limitation de fréquence aurait fait lire à la
boucle un `time` périmé, et l'horloge aurait dérivé de ce que le miroir sautait. Elle publie à
chaque image dans `liveFrameRef` le mécanisme simulé et les trajectoires de sondes ; le canvas
dessine de là. `apply_snapshot_to_mechanism` et le cache de trajectoires ont quitté le corps de
rendu d'`App`.

**Ce qu'on n'a pas eu à faire.** L'extraction de la timeline en composant-feuille était prévue
et s'est révélée inutile : pendant l'enregistrement la tête est **épinglée à 100 %** par
construction, et le seul affichage qui bouge est le compteur au dixième de seconde. Les 10 Hz
du miroir sont exactement sa cadence naturelle.

> **Et c'était faux, pour la moitié des cas — trouvé par l'utilisateur bien plus tard.** Le
> raisonnement ne valait qu'à l'**enregistrement**. En **relecture** la tête parcourt vraiment
> le rail, à partir de `runtimeState.time`, donc au rythme du miroir : dix pas par seconde pour
> un canvas qui en fait soixante. Le curseur saccadait pendant que le mécanisme était fluide.
> La position de la tête est maintenant écrite par la boucle RAF dans une variable CSS
> `--playhead` posée sur le rail — une seule propriété plutôt qu'une ref par élément, la
> pastille étant un enfant de `Tooltip` qui possède déjà la sienne. **Le piège de méthode :
> avoir vérifié un raisonnement dans un régime et conclu pour les deux.**

**Un défaut trouvé en chemin.** Le canvas réassignait `mechanismRef` depuis sa prop à chaque
rendu React. À 10 Hz, le survol et la saisie auraient visé les positions d'**édition** pendant
l'image suivant chaque rendu — un sixième du temps. La ref part désormais de `liveFrameRef` en
priorité, au rendu comme au dessin.

**Limites.** React coûte toujours 23 ms par commit ; on ne l'a pas rendu plus rapide, on a
cessé de le solliciter soixante fois par seconde. Ces commits mangent une image tous les
dixièmes de seconde, ce qui se lit dans les 3 à 8 % d'images au-dessus de 20 ms et le p99 à
33.3. Baisser encore `CLOCK_MIRROR_MS` ou rendre le commit moins cher reste ouvert, sans
urgence. Et rien de tout ceci n'est couvert par un test : `bit-exact` et les garde-fous ne
voient pas `App`.

---

## Chantier 2 — le pas ne grossit jamais ✅ *(fait ; vérification à l'œil en attente)*

`Recorder.advance(targetTime, budgetMs)` produit des instants espacés de `RECORD_DT` jusqu'à
la cible ou la fin du budget, et ne dimensionne plus rien. Sont partis : `recording_step`,
`step_ceiling`, `CEILING_RELAX`, les champs `stepCost` et `ceiling` du `Recorder`, la ligne de
fidélité de l'`AnalysisPanel` et `runtimeState.recordStep`.

**Deux retraits que l'énoncé n'annonçait pas, et qui suivent mécaniquement.** `stepDt`
traversait la frontière du worker à chaque lot de snapshots : c'est désormais une constante,
donc il quitte le protocole, et le plafond du curseur lit `RECORD_DT` directement. Et le
message `target` perd son champ `speed` — le worker ne connaissait la vitesse que pour
dimensionner son pas. **Si le lissage du taux revient un jour (hors périmètre), c'est la
première chose à lui rendre.**

`at_recording_end` ne prend plus de pas en paramètre. Les recherches binaires n'ont pas été
touchées, conformément à l'avertissement ci-dessous.

**La promesse est maintenant tenue par un test, pas seulement par l'œil.**
[record-speed-independence.test.ts](../../src/components/solver/record-speed-independence.test.ts)
enregistre le même mécanisme sous un ordonnancement à ×1 et à ×10 et compare les flux
snapshot par snapshot : **positions et angles identiques au bit**, sur `Poulie bloqueuse` et
`Core XY - 2 moteurs`. Seuls les instants diffèrent, de 1.3e-14 s — les deux vitesses
regroupent les pas différemment, donc la somme courante de `RECORD_DT` ne repart pas des
mêmes bits. C'est le garde-fou qui manquait : la vitesse ne peut plus redevenir un terme de
la trajectoire sans que ça se voie.

**Ce qui reste en dette :** `runtimeState.lag` est maintenant **écrit sans être lu** — son
seul lecteur était la ligne de fidélité. Son retrait appartient au chantier 5, qui l'avait
prévu.

**État de la vérification.** `tsc` et ESLint passent, les 310 tests hors bancs aussi, et
`bit-exact` comme les garde-fous sont **inchangés** — attendu, puisqu'ils tournaient déjà à
`RECORD_DT`. Reste le critère qui ne se mesure pas ici : `Poulie bloqueuse` à ×10.

> ESLint signale deux `prefer-const` dans `drawing-functions.ts`. Ils préexistent à ce
> chantier et n'ont rien à voir avec lui.

### L'énoncé d'origine

**Décision prise.** Le pas d'enregistrement vaut toujours `RECORD_DT`. Ce qui disparaît :

- **`recording_step`** — et avec elle la dépendance de l'enregistrement à la machine et à la
  charge ;
- **`step_ceiling`** et son usage de `constraint_severity` dans le `Recorder` — le plafond
  n'existait que pour rattraper le grossissement ; sans grossissement, la falaise mesurée entre
  1/120 et 1/60 n'est plus jamais approchée ;
- **la ligne « Enregistrement à 42 Hz au lieu de 120 »** sous « Contraintes non respectées »,
  qui n'a plus d'objet — et qui n'avait de toute façon rien à faire dans un panneau de
  diagnostic **mécanique** ;
- **`runtimeState.recordStep`**, si plus personne ne le lit.

Le `Recorder` se simplifie d'autant : `advance` n'a plus à dimensionner un pas, seulement à
produire des instants espacés de `RECORD_DT` jusqu'à la cible ou la fin du budget.

**La conséquence à assumer, et c'est l'ancienne objection qui revient.** Le débit est le
débit : sur un mécanisme lourd, ×1, ×4 et ×10 donnent **le même premier passage**. Le réglage
de vitesse ne règle plus rien au premier passage — il redevient exact en relecture.

> **Ce qui a changé sur cette objection depuis qu'elle a été écrite.** Elle supposait un
> producteur trop lent pour ×1. Il ne l'est plus : 170.6 pas/s mesurés pour 120 demandés
> (chantier 1). Sur `Core XY - 2 moteurs`, ×1 est donc **tenu**, et ce sont ×4 et ×10 qui
> plafonnent — un cas nettement moins gênant que « la vitesse ne sert à rien ». Le chantier 4
> d'origine, qui devait rendre cette conséquence supportable, a été écarté pour cette raison
> (chantier 5).

**Ce que ça rend, en échange :** un enregistrement à ×10 est désormais **aussi fidèle** qu'à
×1, ce qui n'était pas vrai avec le pas adaptatif. C'est un argument pour **garder ×10** plutôt
que de plafonner à ×4 : la vitesse n'est plus un risque de justesse, seulement un temps
d'attente.

**Attention au régime non uniforme.** L'axe de temps redevient uniforme, mais **ne pas
réintroduire de division par `RECORD_DT`** dans `snapshot_at`, `snapshot_index_at` ou le
re-bakage : la recherche binaire est correcte dans les deux régimes et la garder évite d'avoir
à refaire ce raisonnement le jour où un pas variable revient.

**Critère.** Les garde-fous et `bit-exact` inchangés à `RECORD_DT`. Sur `Poulie bloqueuse` à
×10, plus aucune courroie déchirée — c'est le mécanisme qui franchissait la falaise.

---

## Chantier 3 — la précision retrouvée ✅ *(mesuré ; recommandation : garder 200)*

Banc : [sweep-limit.bench.test.ts](../../src/components/solver/sweep-limit.bench.test.ts).
Six mécanismes, 1000 frames à `RECORD_DT`, chaque limite lue contre une **référence à 1500
balayages, sortie anticipée désactivée**, aux mêmes instants.

### La dérive ne plafonne nulle part — elle croît, linéairement, à toutes les limites

| mécanisme | limite | 250 f | 500 f | 1000 f | sévérité à 1000 f |
| --- | --- | --- | --- | --- | --- |
| Core XY - 2 moteurs | 200 | 1.03 px | 2.05 | **4.09** | 0 |
| | 300 | 0.220 | 0.437 | **0.872** | 0 |
| | 500 | 0.0106 | 0.0208 | **0.062** | 0 |
| Core XY modifié | 200 | 0.139 | 0.276 | 0.551 | 0 |
| | 300 / 500 | 0.0643 | 0.126 | 0.245 | 0 |
| Core XY | 200 | 0.377 | 0.756 | 1.53 | 0 |
| | 300 | 0.0555 | 0.112 | 0.232 | 0 |
| | 500 | 0.0116 | 0.0171 | 0.0372 | 0 |
| Déconnexion courroie | 200 | 0.0709 | 0.448 | 0.808 | 0 |
| | 300 | 0.0249 | 0.134 | 0.244 | 0 |
| | 500 | 0.0038 | 0.0211 | 0.0382 | 0 |
| Poulie bloqueuse | 200 / 300 / 500 | 0 | 0 | 0 | **1.75** *(réf. : 1.75)* |
| Huygen's chain drive | 200 / 300 / 500 | 0.024 | 0.314 | **~21** | 0 |

Trois lectures, dont la première annule la question telle qu'elle était posée :

- **le critère binaire du plan ne tranche pas, parce que la réponse est « croît » partout.**
  La dérive **double quand les frames doublent**, à 200 comme à 300 comme à 500 : monter la
  limite ne change pas le régime, seulement la pente — ÷4.7 de 200 à 300, ÷66 de 200 à 500
  sur le pire mécanisme. Aucune valeur ne fait converger quoi que ce soit ; on achète une
  pente, pas un plateau ;
- **et cette dérive ne se voit pas dans l'application.** La sévérité est **nulle à 1000
  frames, à toutes les limites, sur tous les mécanismes sauf `Poulie bloqueuse`** — dont le
  1.75 est **identique à 1500 balayages**, donc c'est le blocage réel et non un manque de
  convergence. Rien n'est déchiré, rien n'est étiré : les 4 px du Core XY à 200 balayages
  sont un écart à une trajectoire mieux résolue, **pas une figure fausse**, et l'utilisateur
  n'a aucun référentiel à l'écran pour les voir ;
- **la limite ne mord que sur trois mécanismes.** `Core XY modifié` sort de lui-même au 256ᵉ
  — 300 et 500 donnent le *même* run, au chiffre près et à la milliseconde près — Huygens au
  69ᵉ, `Poulie bloqueuse` est figée. Ne restent que `Core XY - 2 moteurs`, `Core XY` et
  `Déconnexion courroie`.

### Le coût, et pourquoi il ne se lit qu'en relatif

| mécanisme | 200 | 300 | 500 | balayages exécutés (200 / 300 / 500) |
| --- | --- | --- | --- | --- |
| Core XY - 2 moteurs | 10.93 ms | 16.24 | 26.32 | 200 / 300 / 500 |
| Core XY modifié | 9.11 | 11.15 | 11.15 | 200 / 256 / 256 |
| Core XY | 7.27 | 10.69 | 15.33 | 200 / 300 / 404 |
| Déconnexion courroie | 2.80 | 4.04 | 6.40 | 200 / 300 / 500 |
| Poulie bloqueuse | 1.48 | 2.10 | 2.17 | 200 / 300 / 380 |
| Huygen's chain drive | 1.60 | 1.54 | 1.54 | 69 / 69 / 69 |

> **L'absolu de ce tableau ne vaut rien et il ne faut pas s'en servir.** Sous node il donne
> 0.76× du temps réel à 200 balayages sur `Core XY - 2 moteurs`, là où le chantier 1 a mesuré
> **1.42× en vol dans le navigateur** à la même limite — un facteur 1.9 que je ne sais pas
> expliquer d'ici. Ce que le banc mesure valablement est le **rapport entre limites dans un
> même processus**, les trois bras avançant en lockstep image par image.

Appliqués au 1.42× mesuré en vol : **300 balayages → ~0.95×, 500 → ~0.59×.** L'estimation
du plan (~0.95× à 300) est confirmée au chiffre près.

### Recommandation : garder 200 en simulation

Trois raisons, dans cet ordre :

1. **ce que la limite achète est invisible.** Sévérité nulle à 200 partout où elle peut
   l'être ; le seul mécanisme qui reporte une violation la reporte identique à 1500
   balayages. Il n'y a pas de figure fausse à corriger ;
2. **300 fait franchir le temps réel à ×1** sur le pire mécanisme (~0.95×), c'est-à-dire la
   seule vitesse dont l'utilisateur puisse juger la justesse à l'œil ;
3. **et il n'y a pas de plateau à acheter** : payer du temps réel pour une pente plus faible
   sur une quantité qu'on ne voit pas est un mauvais troc.

**Où la marge doit aller à la place : en édition** (chantier 4). Là il n'y a pas de contrainte
de temps réel, et le critère y est exactement celui que ce banc trouve nul en simulation — la
satisfaction des contraintes. Les deux limites cessent d'avoir à être la même valeur.

### Trouvé en chemin, et pas prévu : Huygens diverge de 20 px à 1000 frames

Les trois bras exécutent 69 balayages — la limite y est inerte — et sont pourtant à ~21 px de
la référence à 1000 frames, contre 0.02 px à 250. Ce n'est donc **pas** la limite, c'est la
**sortie anticipée** à 1e-3 ; et le saut 0.31 → 21 px entre 500 et 1000 frames est trop brutal
pour une accumulation, ce qui fait penser à un événement de topologie qui tombe sur une frame
différente. **La réserve de [plan-implementation.md](./plan-implementation.md) — « la dérive
n'est bornée que sur 200 frames » — est confirmée fausse au-delà.** À instruire, hors périmètre
de ce chantier.

### L'énoncé d'origine

**L'occasion.** Les critères d'arrêt du solveur ont tous été choisis quand une image valait
8 ms de budget sur un thread principal contesté. Ce n'est plus la situation : le worker a un
thread à lui, il produit 170.6 pas/s pour 120 demandés à ×1, et l'affichage tient ses 60 fps
sans lui. **Il y a de la marge, et elle n'est dépensée en rien.**

Le chantier 2 est le préalable : tant que le pas dépend de la charge, aucune mesure de précision
n'est reproductible.

**Les trois réglages qui bornent la convergence**, et ce qu'on sait de chacun :

| réglage | valeur | d'où elle vient |
| --- | --- | --- |
| `DEFAULT_SWEEPS` | **200** en simulation, un littéral **300** en édition | jamais tranchée par la mesure ; deux vérités qui coexistent |
| `REMAINING_PX` / `REMAINING_RAD` | 1e-3 px / 1e-6 rad | mesurée : à 1e-2 la dérive croît, à 1e-3 elle plafonne |
| `FRAME_BUDGET_MS` | 8 | dimensionné pour protéger un affichage que le worker ne bloque plus |

**Ce qu'il faut établir avant de toucher à quoi que ce soit.** Le nombre de balayages
réellement exécutés est connu (chantier 2 de [plan-fluidite.md](./plan-fluidite.md)) : la
famille Core XY et `Déconnexion courroie` consomment **la limite entière à toutes les tailles
de pas**, les autres sortent entre le 58ᵉ et le 300ᵉ. Sur les premiers, la limite tronque
directement — ce sont eux qui gagneraient à ce qu'elle monte, et eux seuls qui paieraient.

Donc la question à mesurer est unique et elle a déjà son critère, validé par le dossier :
**la dérive plafonne-t-elle ou croît-elle**, sur 1000+ frames, à 200 / 300 / 500 balayages.
Pas « ce qu'on perd à la frame N ».

**Ce que ça peut coûter, chiffré d'avance.** Le coût par seconde simulée est proportionnel au
nombre de balayages : passer de 200 à 300 ramènerait `Core XY - 2 moteurs` de 1.42× à ~0.95× de
la demande à ×1 — c'est-à-dire **sous le temps réel**. La marge n'est pas illimitée, et
l'arbitrage est explicite : de la précision contre la tenue de ×1 sur le pire mécanisme.

**À décider en le voyant, et c'est une décision produit :** vaut-il mieux un ×1 exact et un
mécanisme qui rampe un peu, ou un ×1 qui décroche et une convergence meilleure ? Ma
recommandation par défaut est de **ne pas franchir le temps réel à ×1** — c'est la seule vitesse
dont l'utilisateur puisse juger la justesse à l'œil.

**Critère.** Le tableau de dérive, une recommandation, **puis arrêt**. Les garde-fous et
`bit-exact` inchangés à la valeur retenue.

---

## Chantier 4 — l'arrêt du solveur d'édition ✅ *(fait, validé à l'œil)*

### Le critère existait déjà, il était seulement inutilisable

`PBD_solve` sortait **déjà** sur `maxError < epsilon` avant de tester le mouvement restant.
Mais `maxError` est le maximum brut sur tous les liens : il comparait des millimètres à des
radians dans un même nombre, et son seuil de 1e-6 le mettait hors d'échelle. Il n'y avait pas
de critère à inventer, seulement un à rendre dimensionnellement juste.

`ExitCriterion = "motion" | "constraints"` porte désormais la distinction, avec sa raison
d'être en commentaire : la simulation rend la main à une frame qui attend, l'édition n'a pas
de frame suivante. L'édition sort à `maxSeverity < 0.01`, soit **0.01 mm** — un ordre de
grandeur sous le 0.1 auquel les éditeurs arrondissent, ce qui est ce qui rend cet arrondi
digne de confiance. `EDITION_SWEEPS = 300` est redevenu un **plafond dur** nommé, et
`DEFAULT_SWEEPS` est devenu `SIMULATION_SWEEPS = 200`.

La sévérité compte les liens **`report`-ables**, pas ceux qui portent un `owner` : le filtre
`owner` sert l'affichage, et un lien sans propriétaire doit tenir quand même.

**`maxError` reste volontairement en unités brutes.** Son seuil est sous toute échelle
physique dans les deux unités, donc il veut dire « rien n'a bougé du tout ». Le convertir
aurait changé la simulation sans rien apporter.

### Une seule tolérance, parce qu'un angle n'est pas une longueur

0.01 rad vaut **4 mm au bout d'un bras de 400 et 0.1 mm sur un pignon de 10** : un seuil
angulaire fixe n'est pas comparable à un seuil de distance, et la sévérité n'était donc pas
adimensionnelle malgré ce que disait son commentaire. Les résidus angulaires sont maintenant
convertis en **longueur d'arc** là où ils sont mesurés (`residual_scale`) : arête la plus
longue pour `Angle`/`Parallel`/`Normal`, manivelle pour `MotorBeam`, rayon pour les liens
purement angulaires, second rayon pour `GearRatio`. `GearMeshAngle` renvoyait déjà un arc —
c'est le précédent que ça généralise.

Il ne reste **qu'une** tolérance, `DIAGNOSTIC_TOLERANCE_MM` ; `ANGULAR_LINKS` et
`diagnostic_tolerance` ont disparu, et `constraint_severity` est adimensionnelle pour de vrai.

**Incomplet en simulation, et c'est documenté dans le code** : là-bas les rayons sont portés
par les liens, pas par les nœuds, donc `MotorAngle` et `CoaxialAngle` ne trouvent pas de bras
de levier et retombent sur 1. Sans conséquence visible : un résidu `MotorAngle` du solveur
devrait dépasser **1 rad** (57°) pour être listé.

### Un second producteur de résidus, qui ne passe pas par le solveur

La détection de moteur bloqué construit ses `ConstraintResidual` dans `step_simulation` et
les concatène **après** le filtre du solveur — elle n'a donc jamais été soumise au seuil, et
c'est très bien ainsi : un blocage est décidé par sa propre règle
(`achieved < expected × MOTOR_BLOCK_FRACTION`), pas par un nombre qui franchit une ligne.

Elle produisait en revanche un angle brut. Elle porte maintenant son bras de levier
(`model.gearRadii`), et sur `Poulie bloqueuse` le blocage se lit **0.873 mm de jante non
parcourue par image** au lieu de 8.7e-3 rad. Le panneau affiche l'unité.

> **Une alerte a été donnée ici pour rien, et le réflexe de vérifier l'a levée.** J'avais
> annoncé que l'unification faisait disparaître le signalement du blocage, en raisonnant sur
> la sévérité. Vérification faite, **`constraint_severity` n'a aucun consommateur en
> production** — son dernier lecteur était le `step_ceiling` supprimé au chantier 2 — et le
> panneau affiche une *liste*, jamais une sévérité. Il n'y avait pas de régression.

### La valeur validée est imposée, pas tirée

> **Épinglé au mauvais moment, et ça s'est vu tout de suite.** L'épinglage était posé en
> phase A ; la **fusion des `Coincidence`** a lieu en phase B, supprime les deux clés et
> donne à la clé fusionnée le **milieu** des deux positions. La valeur tapée était donc
> écrasée par un `lerp(0.5)`, ou écrite sur une clé orpheline que plus aucun lien ne
> référence. Le rayon fonctionnait parce que les rayons ne sont pas fusionnés — c'est cet
> écart entre les deux qui a désigné la cause. L'épinglage se fait maintenant après la
> fusion, en résolvant la clé fusionnée.

Le panneau de propriétés émettait **exactement la même action** `MoveNode` que le glisser du
canvas, donc les deux passaient par un `HandleGrab` : raideur 0.5, correction plafonnée à
10 mm par balayage, actif 5 balayages seulement. Une position tapée à 200 mm de là ne pouvait
structurellement pas être atteinte. `ChangeEdgeLength` et `ChangeBeltLength` poussaient déjà
un vrai lien dur, et prenaient bien leur valeur : l'asymétrie était là.

Un champ `committed?: boolean` sur `MoveNode` et `ChangeGearRadius` porte l'intention. Posé,
le solveur **épingle** au lieu de tirer — position ou rayon posé et masse à 0 — et c'est le
reste de l'esquisse qui cède, ou qui se signale violé.

**Pas un `ActionBundleType`**, contrairement à ce qui avait été proposé : le type de lot
pilote aussi le **regroupement d'annulation**, qu'on veut identique dans les deux cas. Seul
le solveur doit voir la différence.

### Ce que rien ne couvre

Le scénario `geom` de `bit-exact` reconstruit les liens lui-même et appelle
`PBD_kinematic_solver` en direct : **il ne passe pas par `resolveGeometricConstraints`**. Ni le
nouveau critère d'arrêt ni la contrainte temporaire ne sont couverts par un test — ils passaient
verts avant d'être branchés. La vérification est à l'œil, comme le chantier l'annonçait.

### L'énoncé d'origine

**Le défaut, et il est de nature.** L'édition passe par le même `PBD_kinematic_solver`, donc par
le même arrêt anticipé : `remaining_motion(...) < REMAINING_PX`. Ce prédicat borne **ce qui
bougera encore**, pas **ce qui est faux**. Or un mécanisme peut parfaitement cesser de bouger en
violant ses contraintes — c'est même le cas normal d'un système sur-contraint, et le dossier l'a
déjà rencontré : à 1/60 sur `Poulie bloqueuse`, le solveur *sort* parce que plus rien ne bouge,
en laissant 1.94 px de courroie déchirée.

En simulation ce compromis est défendable : on rend la main à une image qui attend, et la frame
suivante repart à chaud du résultat, donc ce qui est abandonné est rattrapé. **En édition il ne
l'est pas.** Il n'y a pas de frame suivante : le résultat du solve *est* le dessin, et il est
figé jusqu'au geste suivant. Un arrêt sur « plus rien ne bouge » y produit une figure fausse et
stable.

**Ce qu'il faut à la place : sortir sur la satisfaction des contraintes.** `constraint_severity`
([PBD_kinematic_solver.ts](../../src/components/solver/PBD_kinematic_solver.ts)) donne déjà
exactement ça — le pire résidu divisé par la tolérance de sa propre famille, sans dimension,
donc px et rad comparables. Sortir quand elle tombe sous 1, continuer sinon.

**Trois pièges, tous documentés ailleurs dans le dossier :**

- **il faut garder un plafond dur.** « Ne pas sortir tant qu'une contrainte est violée » fait
  brûler la limite entière à tout mécanisme réellement insatisfaisable — et une esquisse
  sur-contrainte, en édition, c'est fréquent et c'est légitime. Le ralentissement est acceptable,
  la boucle infinie non ;
- **la sévérité ne voit que les contraintes *listées***, donc rien sous le seuil de signalement
  ne retient le solveur. Une déchirure de 0.9 px passe. C'est acceptable ici — c'est précisément
  le seuil à partir duquel l'utilisateur en est averti — mais il faut le savoir ;
- **`nbGrabIterations` est partagé avec l'édition.** Le drag émet un `HandleGrab`, donc tout
  changement d'arrêt touche l'interaction la plus utilisée de l'application. Le plan précédent
  s'était fait avoir sur ce point en traitant ce réglage comme un réglage de simulation.

**Ce que ça permet de nettoyer au passage :** les deux limites de balayages (200 et 300) n'ont
plus à être la même valeur, puisque les deux solveurs n'ont plus le même critère d'arrêt. Elles
deviennent deux réglages distincts et nommés, au lieu de deux vérités accidentelles. Le chantier
3 a mesuré que **monter la limite de simulation n'achète rien de visible** ; toute la marge de
convergence est donc à dépenser ici, où le critère est justement la justesse de la figure.

**Et une seconde tâche, qui touche au parsing plus qu'à la simulation : une valeur modifiée
en édition doit prendre la valeur demandée.** Changer la position d'un nœud, une longueur, un
angle — la nouvelle valeur est une *intention*, et le solveur la traite aujourd'hui comme une
simple condition initiale que les contraintes existantes peuvent aussitôt reprendre. Il faut
qu'une **contrainte temporaire** porte la valeur demandée le temps du solve, pour qu'elle soit
tenue et que ce soit le reste de l'esquisse qui cède. À concevoir avec le critère d'arrêt
ci-dessus : les deux décident ensemble de ce que « la valeur est bien prise » veut dire.

**Critère.** Une esquisse contrainte se pose **juste** — pas de cote qui reste visiblement
violée après un drag. Et le drag reste utilisable sur les gros mécanismes. **Vérification
visuelle par l'utilisateur** : aucun banc ne couvre l'édition, et `bit-exact` ne fait que dire
que le résultat a changé, pas s'il est meilleur.

---

## Chantier 4 ter — le grab : un critère au lieu d'un compte

**Le symptôme, mot pour mot de l'utilisateur :** même sur un mécanisme simple, il faut
parfois bouger la souris quelques frames autour d'un point pour que le point saisi finisse
par y venir. *« À l'édition un drag devrait être instantané, et pas traîner derrière comme
si on tirait la pièce avec un ressort. »*

**Le mécanisme exact, lu dans le code.** `applyHandleGrabConstraint` fait
`correction = écart × 0.5`, **plafonnée à `maxGrabAmplitude = 10` mm**, et n'est appliquée
que sur les balayages 0 à 5. Donc le point saisi **ne peut pas se déplacer de plus de
~60 mm par solve**, et tant que l'écart dépasse 20 mm le plafond mord à chaque application.
Une souris plus rapide que ça décroche, et ne rattrape ensuite que 60 mm par frame pendant
qu'elle continue d'avancer. Sous 20 mm le plafond ne mord plus et six divisions par deux
ramènent l'écart à 1.6 % : il n'y a pas de traînée sur les petits gestes, ce qui colle au
symptôme.

> **Prédiction à vérifier :** ça doit empirer en dézoomant, puisque 60 mm est une distance
> *monde* — à faible échelle un petit geste à l'écran fait un grand déplacement en mm.

**Et une nuance qui change la solution :** le compte de 5 n'est pas qu'une limite, c'est une
**rampe**. On tire 6 balayages, puis on rend les ~294 restants aux contraintes pour relâcher
ce que la traction a étiré. Appliquer le grab à tous les balayages laisserait l'esquisse à un
compromis où le grab tire encore, donc **étirée en permanence** — pire que la traînée.

### La mesure a déplacé la question : le compte n'était pas le bon bouton

Banc : [grab-tracking.bench.test.ts](../../src/components/solver/grab-tracking.bench.test.ts).
Un glisser rejoué image par image à vitesse de curseur fixe, sur le chemin d'édition, puis
dix images immobiles. Extrait à **60 et 150 mm/image** (traînée en fin de glisser / écart
encore présent après l'immobilité) :

| mécanisme | actuel (5 × 10) | plafond levé (5 × ∞) | rampe longue (30 × 10) |
| --- | --- | --- | --- |
| Test slider, 60 | 102.9 / 0.00 | **1.0** / 0.00 | 0.0 / 0.00 |
| Test slider, 150 | 2798 / **2199** | **2.4** / 0.00 | 0.0 / 0.00 |
| Vilbrequin, 150 | 3262 / **2862** | **14.4** / 0.00 | 0.2 / 0.00 |
| Jansen, 150 | 3692 / **3452** | **64.2** / 0.00 | 730.6 / 0.00 |
| Core XY - 2 m., 150 | 2700 / **2100** | **2.4** / 0.00 | 0.0 / 0.00 |

Trois lectures :

- **c'est le plafond, pas le compte.** Le lever seul, à rampe inchangée, divise la traînée
  par un facteur **100 à 1000**, et pour le **même nombre de balayages** (6 à 15) et la
  **même déformation** ;
- **la déformation est nulle partout, dans toutes les configurations.** La sévérité ne
  dépasse jamais 0.00 — ni pendant la traction, ni au lâcher. Le plafond protégeait donc
  d'un danger qui ne se produit pas sur ces quatre mécanismes ;
- **la colonne « posé » est le vrai symptôme.** À 150 mm/image en réglage actuel, le point
  est encore à **2199 mm du curseur après dix images d'immobilité** : il ne traîne pas, il
  rattrape à 60 mm par image. C'est ça, « tourner autour du point quelques frames ».

**Décision : le plafond absolu disparaît.** `grabStiffness = 0.5` borne déjà la correction à
la moitié de l'écart restant — c'est-à-dire une mollesse **proportionnelle**, qui cède aux
contraintes sans être lente. C'était la formulation de l'utilisateur : instantané, mais
toujours mou. La rampe reste à 5 balayages : le critère de convergence envisagé n'a plus
d'objet, puisque le compte n'était pas ce qui rationnait le grab.

**`bit-exact` bouge, délibérément.** Les 9 scénarios de simulation pure restent à
`0.00e+0` — la cinématique n'a pas changé — et seuls les scénarios porteurs d'un grab
bougent, de 4.9 mm au pire. La référence est à recapturer (`CAPTURE=1`), **après** la
vérification à l'œil et pas avant : tant qu'elle n'est pas reprise, elle tient encore
l'ancien comportement si le nouveau ne convient pas.

Deux choses à savoir avant d'y toucher :

- **c'est déjà partagé avec la simulation.** `nbGrabIterations` est une constante *dans*
  `PBD_solve`, et `SimGrab` construit le même lien `HandleGrab` : tout changement s'applique
  aux deux, et en simulation le grab est payé à 120 Hz sous budget de frame ;
- **un critère de mouvement peut ne jamais se déclencher.** Il mesure une décroissance ; le
  grab et les contraintes peuvent alterner, et une oscillation stable ne décroît pas.
  `remaining_motion` renvoie alors `Infinity` et on tire jusqu'au plafond.

**Mesure préalable**, celle que le chantier 3 de [plan-fluidite.md](./plan-fluidite.md) avait
déjà définie : suivi, déformation, balayages exécutés, stabilité. Et **après** le chantier 4,
pour qu'un changement de sensation au drag soit imputable à un seul changement.

---

## Chantier 4 bis — le ralentissement uniforme ✅ *(fait ; vérification à l'œil en attente)*

Le curseur avançait de `realDt × vitesse`, écrêté par `reached + RECORD_DT` : sous-production,
il avançait donc **au rythme des arrivées**. Il avance maintenant au rythme que le producteur
**soutient**, passe-bas :

```
observé = (reached − reachedPrécédent) / realDt
taux    = (1−α)·taux + α·min(observé, vitesse)      α = 0.1
curseur += realDt × taux
```

toujours écrêté par `reached + RECORD_DT`, et **aussi par le temps demandé** — une vitesse que
l'utilisateur vient de choisir s'applique tout de suite, pas quand l'estimateur a rattrapé.

Quand le producteur suit, `observé ≈ vitesse`, le taux converge vers la vitesse demandée et
rien ne change. Quand il ne suit pas, les deux politiques arrivent au même endroit — le retard
est le même — mais l'une y va régulièrement et l'autre par à-coups, et c'est la seule
différence que l'œil voit.

**La branche « tampon » du banc a été écartée, délibérément.** Elle allait à pleine vitesse
tant que le tampon tenait. En production la cible du worker est **dérivée du curseur**
(`rs.time + 3·simDt`), donc ralentir le curseur ralentit la cible et le tampon ne peut pas
dépasser l'avance de trois images : la branche serait morte. Le retour à pleine vitesse est
gouverné par α, soit une dizaine d'images. La rétablir demanderait de découpler la cible du
curseur, avec les remises à zéro que ça implique.

**Remise à zéro** à chaque reprise d'enregistrement (`recordingRef` qui repasse à vrai) :
pause, scrub et changement de mode passent tous par là. Le taux repart à la vitesse demandée
et `prevReached` à `null` — un taux mesuré dans un autre régime ne dit rien de celui-ci.

**Ce que ça ne couvre pas :** la relecture. Elle lit des snapshots déjà là et ne dépend
d'aucune production, donc elle ne peut pas saccader pour cette raison. Si une irrégularité y
subsiste, elle est ailleurs.

### L'énoncé d'origine

**Le déclencheur inscrit dans « hors périmètre » a été observé.** En build de production,
`Huygen's chain drive` et `Déconnexion courroie` ralentissent **dès ×4**, et le font en
oscillant : la vitesse monte et redescend, avec à l'extrême de courts arrêts. Les autres
mécanismes tiennent ×10. Le verdict de l'utilisateur : *« ce n'est pas agréable à regarder,
il faudrait un ralentissement général uniforme quand on n'arrive plus à suivre. »* C'est
exactement la formulation du principe du plan — *on va moins vite, proprement* — appliquée à
la lecture.

**Ce qui est déjà mesuré et n'est pas à refaire** : le tampon ne sert à rien (gigue
identique de 0.05 s à 1 s de profondeur), et le **lissage du taux** fait passer la gigue de
0.20 à 0.02 à ×4 **à vitesse effective inchangée**. C'est le seul levier qui ait mordu au
banc `cursor-clock`.

> **Une hypothèse a été posée ici et l'observation l'a démentie.** Elle voulait que les deux
> coupables soient précisément les deux mécanismes à topologie mobile, et que ce soit
> l'**irrégularité** du coût — un pas qui recâble coûte plus que ses voisins — et non la
> lenteur, qui fasse osciller. Vérification de l'utilisateur : **l'oscillation n'est pas
> localisée sur les instants de connexion/déconnexion**, elle est là dès que le coût est trop
> élevé, déconnexion ou pas. La corrélation était bonne, la causalité était inventée.

**Ce qui reste sans explication, et qu'il faudra regarder :** `Huygen's` coûte 1.6 ms/pas
(69 balayages) contre 10.93 ms/pas pour `Core XY - 2 moteurs`, qui ne ralentit pas
visiblement à ×10 alors qu'il devrait décrocher bien avant. Deux lectures possibles — les
coûts mesurés sous node ne transposent pas dans ce sens-là, ou `Core XY` décroche aussi mais
**proprement**, et l'utilisateur n'a aucun référentiel pour le voir. La seconde serait plutôt
une bonne nouvelle : elle dirait que la sous-production n'est pas le problème, seulement sa
forme.

**Le lissage ne dépend d'aucune de ces réponses**, et c'est ce qui autorise à le faire
maintenant : il rend uniforme un débit irrégulier quelle qu'en soit la cause, et le banc l'a
déjà mesuré à vitesse effective inchangée.

**À traiter avant le chantier 5**, qui retire les deux images d'avance : celles-ci masquent
une partie de l'irrégularité, donc les retirer ne peut qu'aggraver ce qu'on vient
d'observer.

---

## Chantier 5 — ce qui n'apporte rien ✅ *(fait)*

**L'enregistrement de fond (« RAM preview ») est écarté.** Il devait rendre supportable un
premier passage plus lent que le temps réel. Le chantier 1 a mesuré que ce premier passage tient
×1 avec 42 % de marge, et le 1 bis a rendu l'affichage fluide : il n'y a plus de lenteur à
masquer. Ajouter un enregistrement en avance, sa borne, son invalidation à chaque édition et son
vocabulaire visuel coûterait tout ça pour un problème qui n'existe plus.

> L'énoncé complet — les trois options de visuel et la recommandation — est dans git. Il reste
> valable *si* la dynamique (gravité) ramène un producteur trop lent pour le temps réel.

### Les deux images d'avance restent, et l'énoncé qui voulait les retirer était faux

L'énoncé disait : « la cible redevient `requestedTime` ». Le dérouler image par image le
contredit, et c'est arithmétique, pas une question de goût.

`reached` lu à l'image *n* décrit ce que le worker a produit vers la cible de l'image *n−1*.
Sans avance, cette cible valait `T_{n−1} + simDt = T_n`, donc **`reached ≈ T_n` : le plafond
`reached + RECORD_DT` tombe un pas au-dessus du curseur**. Or à ×1 le curseur veut avancer de
`simDt = 2 × RECORD_DT` par image, sur un affichage à 60 Hz. Le plafond mordrait donc **à
chaque image**, et ×1 se lirait à **×0.5**.

L'avance n'était pas un pansement : c'est ce qui annule la péremption d'une image de
`reached`, et la seconde image met le plafond hors de portée. **Elle reste.** Le lissage du
taux (chantier 4 bis) ne la remplace pas — il décide *à quelle vitesse* le curseur avance, le
plafond décide *jusqu'où il a le droit* d'aller ; ce sont deux questions différentes.

> Si on voulait vraiment la retirer, il faudrait dimensionner le plafond sur une image de
> temps simulé (`reached + simDt`) et non sur un pas. Ça n'a pas été fait : l'avance ne coûte
> qu'un peu d'enregistrement au-delà de ce qui est affiché, et rien ne le réclame.

**Ce qui part, en revanche : `runtimeState.lag`.** Son dernier lecteur était la ligne de
fidélité supprimée au chantier 2 ; il était écrit à chaque image sans que personne le lise.
Retiré du type, de la valeur par défaut, des trois remises à zéro et de la boucle.

---

## Chantier 6 — vérifications et nettoyage ✅ *(fait)*

**Le curseur de la timeline saccadait en relecture** — cause et correctif au chantier 1 bis,
dont c'est une correction.

**L'étiquette du graphique de sonde dit maintenant la vérité** : les bornes affichées dans la
gouttière sont celles des **données**, le rembourrage de 8 % ne servant plus qu'au tracé.

**Échafaudages retirés — 13 fichiers.** Les onze que les deux plans listaient
(`startup`, `cursor-clock`, `record-rate`, `creep`, `early-exit`, `index-port-speed`,
`sweep-dimensioning`, `sweep-wake`, `sweep-limit`, `blocked-creep`, `grab-tracking`), plus
`step-cost` que le retrait de `sweep-probe.ts` emportait, et `sweep-probe.ts` lui-même avec
son extension `shape`.

**Et deux crochets de mesure exportés depuis le code de production sont morts avec eux** :
`set_early_exit_bounds` et `set_grab_tuning`, qui laissaient un test muter le comportement du
solveur. `REMAINING_MM`, `REMAINING_RAD` et `GRAB` sont redevenus des constantes.

Restent quatre bancs, qu'aucun plan ne listait : `belt-geom`, `belt-reattach`,
`belt-disconnect-quality`, `diagnostics-cost`. Et `bit-exact`, qui n'est plus un échafaudage
mais le filet qui tient les 27 scénarios.

Ce que le dossier perd, c'est la **reproductibilité** de ces mesures, pas les chiffres : ils
sont tous dans ces pages. Ce qu'il gagne, c'est que le solveur n'a plus de porte dérobée.

### Le mode dev : notre code est innocent, et la cause reste dehors

Banc : [session-cost.bench.test.ts](../../src/components/solver/session-cost.bench.test.ts).
Les trois seuls chemins chauds du thread principal, mesurés :

| chemin | cadence | Core XY - 2 moteurs | Vilbrequin |
| --- | --- | --- | --- |
| `apply_snapshot_to_mechanism` (boucle RAF) | 60 Hz | 0.028 ms → **2 ms/s** | 0.006 → 0 ms/s |
| nœuds + liens + DDL (corps de rendu du panneau) | 10 Hz | 1.02 ms → **10 ms/s** | 0.06 → 1 ms/s |
| `get_probe_series`, par sonde | 10 Hz | voir ci-dessous | — |

**Sur un mécanisme simple sans sonde, l'application dépense 1 à 2 ms par seconde dans son
propre code.** Il n'y a rien à optimiser là : la lenteur du dev est le *build* de React —
`react-dom.development` et le double rendu `StrictMode` sur tout l'arbre, mesurés au chantier
1 bis à **60 ms par commit contre 23 en production**.

> **Et le fait que l'essai du miroir n'ait rien donné est une information.** Passer le miroir
> de 10 à 4 Hz aurait dû retirer 60 % du coût si les commits dominaient. L'utilisateur n'a
> senti aucune différence : le coût n'est donc probablement **pas proportionnel aux commits**,
> ce qui pointe vers un travail par *image* que node ne voit pas. Trancher demande un profil
> navigateur — trois secondes de lecture en dev, panneau Performance, temps propre trié.

**Un gâchis réel trouvé au passage, qui ne concerne pas le dev :**
[AnalysisPanel.tsx](../../src/components/properties-panel/AnalysisPanel.tsx) reconstruit
`get_sim_nodes` + `get_links_simulation` + `get_sim_degrees_of_freedom` **dans son corps de
rendu**, dix fois par seconde, pour un nombre de degrés de liberté qui ne change qu'à
l'édition. 10 ms/s sur le pire mécanisme. Un `useMemo` sur la topologie le supprime.

### La mémoire d'une longue session : 44 Mo par minute simulée

| mécanisme | nœuds | par snapshot | par minute simulée | après 10 min |
| --- | --- | --- | --- | --- |
| **Core XY - 2 moteurs** | 55 | **6.21 ko** | **43.6 Mo** | **436 Mo** |
| Huygen's chain drive | 27 | 3.61 ko | 25.4 Mo | 254 Mo |
| Jansen's linkage | 31 | 2.80 ko | 19.7 Mo | 197 Mo |
| Vilbrequin | 9 | 1.33 ko | 9.3 Mo | 93 Mo |

> **Le dossier disait 480 octets par snapshot, et s'en servait pour se rassurer.** Ce chiffre
> était la taille **sur le fil**, mesurée pour `structuredClone` — « 57 ko/s, nowhere near a
> bottleneck ». C'était vrai *pour la bande passante*, et ça a été réutilisé comme s'il
> s'agissait de la mémoire. Le **retenu** vaut 6.21 ko, soit **13 fois plus** : Map de
> `Point2`, clés chaînes, en-têtes d'objets. Une conclusion juste sur une question, transposée
> à une autre.

**Et la vitesse multiplie tout** : à ×10 on accumule dix minutes simulées par minute réelle,
donc **436 Mo en une minute de visionnage** sur le pire mécanisme. C'est l'explication la plus
plausible des pauses d'une demi-seconde signalées au tout début du dossier — un GC majeur sur
un tas de plusieurs centaines de Mo.

**Une seconde dégradation, celle-là seulement avec des sondes :** `get_probe_series`
reparcourt tout l'historique **à chaque rendu et par sonde**.

| enregistré | snapshots | par appel | à 10 Hz, par sonde |
| --- | --- | --- | --- |
| 5 s | 600 | 0.85 ms | 8 ms/s |
| 30 s | 3600 | 4.30 ms | 43 ms/s |
| 60 s | 7200 | 7.50 ms | **75 ms/s** |

Linéaire dans la durée enregistrée, et sans borne. Deux sondes sur une minute d'enregistrement
coûtent 150 ms par seconde de thread principal, et ça continue de monter.

**Aucun correctif n'est appliqué** : plafonner l'historique, le sous-échantillonner ou passer
les snapshots en `Float64Array` sont trois réponses très différentes, dont deux touchent au
produit (jusqu'où peut-on revenir en arrière ?). À décider avant de coder.

### Ce qui reste ouvert, et que personne ne surveille

- **Le régime de surcharge n'est caractérisé par aucun banc.** Toutes les mesures du dossier
  sont à `RECORD_DT` en régime nominal ; ce que fait l'app quand elle tourne à ×0.5 pendant
  plusieurs minutes n'a jamais été observé. Notamment : la mémoire des snapshots sur une longue
  session.
- **Le coût du commit React n'est surveillé par rien.** Le chantier 1 bis l'a mesuré à 23 ms
  puis a retiré sa sonde ; un panneau qui grossit le fera croître sans que rien ne le signale.
- **Un mécanisme bloqué ne rampe pas** : sur `Poulie bloqueuse`, les quatre angles sont
  stables à 1e-3 degré de 2 s à 20 s de temps simulé. Le résidu permanent est **statique**,
  il ne dérive pas — mesuré avant le retrait du banc qui l'a établi.
- ~~**Le piège des deux défauts**~~ — **vérifié réglé** : `PBD_kinematic_solver` et
  `PBD_solve` prennent `nbIterations` en paramètre obligatoire, sans valeur par défaut.
- **Le mode dev reste lent, et la cause n'est pas trouvée.** L'hypothèse du miroir à 10 Hz
  (600 ms de commit par seconde en dev contre 230 en production) a été essayée — miroir à
  250 ms en dev — et **l'utilisateur n'a senti aucune différence** ; le changement a donc été
  annulé plutôt que de laisser une divergence dev/prod sans bénéfice. Ce qui reste soupçonné
  est le double rendu `StrictMode` des corps de composants, que le miroir ne borne pas. Sans
  profilage navigateur, ça s'arrête là — et ce n'est pas une priorité.

---

## Hors périmètre

- ~~**Le lissage du taux du curseur**~~ — **rouvert au chantier 4 bis** : le déclencheur qui
  était écrit ici (« une lecture à ×4 ou ×10 sur un mécanisme lourd redevient irrégulière »)
  a été observé en build de production sur `Huygen's` et `Déconnexion courroie`.
- **La simulation dynamique**, qui prendra la gravité en compte. Rien ici n'en dépend : le
  modèle cinématique compilé ne dépend que du mécanisme, ce qui est ce qui rendrait une clé de
  cache triviale si le besoin revenait.
- Les dettes de [plan-implementation.md](./plan-implementation.md) — métrique angulaire,
  traversée des points morts, déchirure de `Déconnexion courroie`.
