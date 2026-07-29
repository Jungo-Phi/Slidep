# Plan — le ralentissement, repensé

Suite de [plan-fluidite.md](./plan-fluidite.md), dont les chantiers 0 à 5 sont faits. Trois
défauts sont restés, et ils ont la même racine : **l'application répond à « on n'arrive pas à
suivre » de trois façons contradictoires à la fois.**

Six chantiers, **arrêt et retour à la fin de chacun**.

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

---

## Le principe

**Une seule réponse à « on n'arrive pas à suivre » : on va moins vite, proprement.**

Aujourd'hui il y en a trois, et elles se contredisent — `recording_step` dit *« le temps réel
est sacré, la précision cède »*, `step_ceiling` dit *« les contraintes sont sacrées, le temps
cède »*, `lag` est le résidu du second. Laquelle s'applique dépend de si le mécanisme viole
des contraintes : ce n'est pas une règle, c'est un comportement émergent.

Ce qui le remplace :

- **le pas ne grossit jamais** — la fidélité est constante, l'enregistrement redevient
  indépendant de la machine, et la falaise à 1/120 n'est plus jamais franchie ;
- **le curseur avance à un taux lissé**, pas au rythme des arrivées ;
- **le worker continue d'enregistrer à la pause**, donc la seconde lecture est exacte.

La vitesse demandée devient une **cible** pendant l'enregistrement et une **promesse** en
relecture. C'est la seule chose que l'utilisateur ait à comprendre.

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

| producteur (×1 demandé) | débit / demande | **gigue actuelle** | gigue lissée | vitesse réelle |
| --- | --- | --- | --- | --- |
| Core XY (5.2 ms/pas) | 0.69× | **0.35** | 0.02 | ×0.69 |
| Poulie bloqueuse | 2.78× | 0.00 | 0.00 | ×1.00 |
| Jansen | 18× | 0.00 | 0.00 | ×1.00 |
| **Core XY, tranche 50 ms** | **1.39×** | **0.00** | 0.00 | **×1.00** |

Trois lectures :

- **tant que le débit couvre la demande, la politique actuelle est déjà parfaitement lisse.**
  La saccade est *exactement* le cas de surcharge ;
- **le tampon n'y change rien** : de 0.05 s à 1 s de profondeur visée, gigue et vitesse
  effective sont identiques. On ne tamponne pas ce qu'on ne produit pas. Ce qui supprime la
  gigue est le **lissage du taux** — 0.35 → 0.02, à vitesse effective inchangée ;
- **la tranche du worker est un levier majeur.** Le `setTimeout(0)` est clampé à 4 ms par la
  spec dès que l'imbrication dépasse 5 niveaux, ce qu'une boucle d'enregistrement atteint
  immédiatement : **33 % du débit part en attente**.

**Corroboration.** La saccade n'existait pas avant la séparation du worker : production et
affichage partageaient alors une horloge, donc le curseur avançait de ce qui venait d'être
calculé, à l'identique chaque image. Le worker a cassé ce verrouillage naturel ; le lissage le
rétablit explicitement.

---

## L'ordre

```
0. le worker au lancement de l'app     ── l'attente au démarrage
1. MessageChannel au lieu de setTimeout ── 3 lignes, +45 % de débit
2. l'horloge lissée                    ── la saccade
3. le pas ne grossit jamais            ── deux mécanismes retirés
4. l'enregistrement de fond, et son visuel
5. vérifications et nettoyage
```

**Le 1 avant le 2** parce qu'il peut faire disparaître la surcharge à ×1 sur le Core XY, donc
la saccade elle-même — et qu'il coûte trois lignes. **Le 3 après le 2** parce qu'il rend la
surcharge *plus fréquente* (à pas fixe, ×4 demande quatre fois plus de pas) : il doit atterrir
sur un système qui sait déjà ralentir proprement.

---

## Chantier 0 — le worker au lancement de l'app

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

## Chantier 1 — `MessageChannel` au lieu de `setTimeout(0)`

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

## Chantier 2 — l'horloge du curseur

**Le défaut.** Le curseur avance de `min(requestedTime, reached + stepDt)` : il est asservi à
ce que le worker a livré **à cette image**. Or le worker produit par tranches, à travers une
file de messages, avec le GC par-dessus — sa livraison est en paquets. Le curseur hérite donc
directement de cette granularité, ce qui se voit comme une saccade dès que le débit passe sous
la demande.

Les **deux images d'avance** ajoutées à la cible sont un pansement sur ce même défaut : elles
écartent le plafond pour qu'il morde moins souvent. **À retirer** — la cible redevient
`requestedTime`.

**Ce qu'il faut à la place — deux pièces, deux rôles distincts :**

- **un taux lissé.** Estimer par passe-bas ce que le producteur soutient (simulé par seconde
  réelle), et faire avancer le curseur à `min(vitesse demandée, taux soutenu)`. C'est ce qui
  transforme la saccade en ralenti régulier : **0.35 → 0.02** de coefficient de variation, à
  vitesse effective identique ;
- **un tampon**, mais pour ce qu'il sait faire : absorber les **hoquets aléatoires** — GC,
  latence de message, autre onglet. Il n'aide en rien contre la sous-production systématique
  (mesuré : de 0.05 s à 1 s, aucune différence). Le viser petit.

**Invariant non négociable : le curseur ne dépasse jamais la frontière.** Il lirait un temps
qu'aucun instantané ne couvre.

**Ce que ça retire.** `runtimeState.lag` n'a plus de lecteur une fois la ligne de fidélité
supprimée (chantier 3) — le vérifier et le retirer avec.

**À décider en le voyant :** la constante du passe-bas. Un curseur qui suit un taux trop lissé
peut « flotter » sur un mécanisme dont le coût varie beaucoup d'un pas à l'autre ; trop peu
lissé, la saccade revient. Aucun banc ne tranche ça.

**Critère.** Sur `Core XY - 2 moteurs` en surcharge, le mouvement est **régulier et lent**, pas
saccadé. **Vérification visuelle par l'utilisateur.**

---

## Chantier 3 — le pas ne grossit jamais

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
de vitesse ne règle plus rien au premier passage — il redevient exact en relecture. C'est
précisément ce que le chantier 4 rend supportable.

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

## Chantier 4 — l'enregistrement de fond, et son visuel

**Ce qu'on ajoute.** Le worker ne s'arrête plus à la pause : il continue d'enregistrer en
avant, borné (une ou deux secondes de temps simulé). Reprendre la lecture rejoue alors à la
**vitesse exacte**, sans rien résoudre.

C'est le « RAM preview » des éditeurs, sans en avoir le geste : pas de bouton « calculer », pas
de modalité. L'application ne demande jamais de rendre — elle continue simplement de travailler
pendant qu'on ne regarde pas. Aujourd'hui la pause envoie `stop()`, donc rien ne se calcule ;
c'est ce `stop()` qui devient conditionnel.

### Le visuel — trois options, et ma recommandation

Un visuel est nécessaire : sans lui, la lecture devient soudainement fluide sans raison
apparente, ou reste lente sans qu'on sache que ça travaille.

**Option A — la timeline le dit déjà, il suffit de la laisser faire.** Dès que le worker
enregistre en avant, la frontière dépasse le curseur : ce n'est plus « le curseur est au bout »,
c'est « il y a de la matière devant ». C'est exactement l'état d'une relecture, que la timeline
sait déjà représenter — et c'est vrai, pas une métaphore : ce qui est devant est bien du temps
enregistré. Coût : le curseur se décolle du bord droit **à la pause**, ce qui change une
convention voulue. Bénéfice : aucun vocabulaire nouveau, et la promesse « la seconde lecture
sera exacte » devient visible au lieu d'être magique.

**Option B — ta proposition : une jauge grisée depuis la gauche, quand le curseur est tout à
droite.** Elle réutilise un espace qui ne dit rien (la barre est forcée à 100 % dans cet état).
Mon objection : **sur un axe de temps, un remplissage vers la gauche se lit comme du temps** —
le risque est qu'on lise « ça rembobine » ou « ça recalcule le passé », alors que ce qui est
tamponné est *devant*. Si on la retient, il faut qu'elle soit visuellement très distincte d'une
progression (hachures, hauteur réduite) plutôt qu'une barre pleine.

**Option C — rien sur la timeline, un signe discret près du bouton lecture** (un point qui
pulse : « ça continue de travailler »). Le moins invasif, mais il dit *qu'*on travaille sans
dire *combien* on a d'avance.

**Ma recommandation : A.** C'est la seule qui ne demande aucun élément nouveau et dont la
sémantique est exacte. B et C ajoutent un signe pour décrire quelque chose que la timeline
représente déjà nativement, dès qu'on cesse d'épingler le curseur à droite pendant la pause.

**Question à trancher en même temps :** l'enregistrement de fond n'a lieu **qu'en pause en mode
simulation** — pas pendant l'édition. Chaque édition invaliderait tout, et le cas ne se pose
pas si on n'y va pas.

**Critère.** Mettre en pause, attendre, relancer : la lecture doit être à la vitesse exacte
demandée. Et on doit comprendre, sans explication, que quelque chose s'est préparé.
**Vérification visuelle par l'utilisateur.**

---

## Chantier 5 — vérifications et nettoyage

- **Le gain de débit du chantier 1, mesuré** dans le navigateur, pas seulement raisonné.
- **Le régime de surcharge n'est caractérisé par aucun banc.** Toutes les mesures du dossier
  sont à `RECORD_DT` en régime nominal ; ce que fait l'app quand elle tourne à ×0.5 pendant
  plusieurs minutes n'a jamais été observé. Notamment : la mémoire des snapshots sur une longue
  session.
- **Échafaudages à retirer** : `startup.bench.test.ts`, `cursor-clock.bench.test.ts`,
  `record-rate.bench.test.ts`, `creep.bench.test.ts`, `sweep-probe.ts` et son extension
  `shape`.
- **Le piège des deux défauts** : `PBD_kinematic_solver` et `PBD_solve` déclarent
  `nbIterations = 200` pendant que l'appelant passe `DEFAULT_SWEEPS`. Deux vérités ; un
  appelant qui oublie le paramètre tombe silencieusement sur l'autre. Toujours pas corrigé.

---

## Hors périmètre

- **La limite de balayages** (`DEFAULT_SWEEPS`, passée de 300 à 200 à la main) : elle n'a
  jamais été tranchée par la mesure. Le bon critère reste « la dérive plafonne-t-elle ou
  croît-elle » sur 1000+ frames.
- **La simulation dynamique**, qui prendra la gravité en compte. Rien ici n'en dépend : le
  modèle cinématique compilé ne dépend que du mécanisme, ce qui est ce qui rendrait une clé de
  cache triviale si le besoin revenait.
- Les dettes de [plan-implementation.md](./plan-implementation.md) — métrique angulaire,
  traversée des points morts, déchirure de `Déconnexion courroie`.
