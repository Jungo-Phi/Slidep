# Robustesse des mécanismes — état et suite

Point de reprise du chantier anti-crash. Le problème de départ : des `throw` dans
`get_mechanical_element_from_id()` et ses voisines de `mechanism/connect-actions.ts`,
provoqués par des **références pendantes**, dont certains au chargement de la galerie
(crash au reload).

---

## 1. Ce qui existe maintenant

### `src/types/element-refs.ts` — la table des références

`ELEMENT_REFS` déclare, pour chacun des **28 types d'éléments**, ses champs de référence :
vers quels types ils peuvent pointer, et s'ils doivent résoudre.

Deux niveaux d'exhaustivité **imposés par le compilateur** :

- par type d'élément — `{ [K in ElementType]: RefTable<ElementOfType<K>> }` ;
- par champ — `RefTable<T>` est un mapped type sur `RefKeys<T>`, **dérivé des types** et non
  des noms de champs.

La dérivation par type était indispensable : deux références sont imbriquées et invisibles
à une convention de nommage — `MotorConfig.parentBeamID` (dans `pivot.motor`) et
`LoadFrame.edgeID` (dans `frame`).

> **Piège** : `HoldsID<T>` doit tester `T extends ID` et **jamais l'inverse**. `ID` est un
> template literal, sous-type de `string` : la condition inversée ferait de tout champ
> `string` (comme `name`) une référence. Deux assertions de type (`NoStringFalsePositive`,
> `NoTypeTagFalsePositive`) cassent le build si quelqu'un inverse la condition.

Lecture via `element_ref_fields(element)` (groupé par champ, pour la détection de doublons)
et `element_refs(element)` (à plat).

### `src/utils/validate-mechanism.ts` — le valideur

Le cœur « références » (existence, type attendu, auto-référence, doublons) est **piloté par
la table** : ~170 lignes au lieu des ~525 de blocs `if ("x" in el)` précédents, et les
charges sont couvertes sans une ligne spécifique.

Restent écrits à la main, parce que la table ne peut pas les exprimer :

- `BACK_REFERENCE` — la réciprocité, sous forme d'une table `champ → prédicat` (11 entrées).
  Un champ absent n'a pas d'exigence de réciprocité : c'est le cas des contraintes et des
  charges, unidirectionnelles par nature.
- `SAME_AXLE_MESH`, `CONTRADICTORY_MOTOR`, `GROUNDED_MASS`, IDs dupliqués, extrémités
  identiques d'une contrainte.

> `ProjectInfoSection.tsx` déclare deux `Record<ValidationErrorCode, string>` **exhaustifs** :
> tout nouveau code d'erreur casse le build tant qu'il n'a pas une couleur et un libellé.

### `src/utils/assert-mechanism.ts` — le garde de développement

`assert_actions_preserve_validity(before, after, actions, label)`, appelée aux **trois points
de commit** : `apply_actions` (l'entonnoir de toutes les éditions), `Undo` et `Redo` dans
`App.tsx`. Les trois autres appels à `actionReducer` sont spéculatifs (ils alimentent le
solveur) et sont volontairement ignorés.

- Ne throw **jamais** — un diagnostic ne doit pas devenir le crash qu'il traque.
- Ne signale que les problèmes **nouveaux** (diff avant/après), sinon un mécanisme déjà cassé
  noie chaque édition suivante.
- `issue_key` exclut volontairement le `message` : il contient les noms résolus, donc un
  simple renommage faisait re-signaler un problème intact. Conséquence assumée : deux
  problèmes de même code sur le même couple d'éléments mais sur des champs différents
  fusionnent en un seul.

### `src/components/mechanism/connection-rules.ts` — les règles de légalité

Extraites de `get-hover.ts`, où elles vivaient dispersées et implicites. Trois consommateurs :
le hit-testing, le fuzzer (comme précondition), et — à terme — les opérations.

Trois notions à ne pas confondre :

| | Où | Quoi |
|---|---|---|
| **Totalité de l'opération** | domaine | le geste a un résultat manifestement correct → l'opération doit être idempotente/totale, pas gardée |
| **Légalité** | `connection-rules.ts` | propriété de l'**état d'arrivée** ; ne dépend ni du curseur, ni du zoom, ni de l'ordre de dessin |
| **Priorité de picking** | `get-hover.ts` | qui l'utilisateur désigne parmi ce qui est sous le curseur ; ordre de dessin, tolérances, sets de cibles par outil |

Un refus est **transparent** (`blocks: false` → « regarde derrière », indispensable pour que
le cas « déjà connecté » ne masque pas une cible utile) ou **opaque** (`blocks: true` → « il y
a quelque chose ici et ce qui est dessous ne te concerne pas »).

> **Piège critique** : `get-hover` doit tester la **géométrie avant la légalité**. Dans l'ordre
> inverse, un refus opaque bloquerait le survol depuis n'importe quel point du canvas.

Un refus opaque **repousse** (`pushed_out_of`) : le point de survol est ramené sur le bord de
la zone de hit, donc rien ne peut être empilé sur l'élément refusé. Le curseur passe à
`not-allowed`, et `HoveredPart` de type `Void` porte `rejected: string` (la raison, disponible
pour une future infobulle).

### `src/components/canvas/hover-bounds.ts` — les bornes du curseur

`clamp_to_bounds(point, state, elements)` dit où le curseur a le droit d'être compte tenu de ce que
le geste s'apprête à produire : longueur minimale d'un edge, rayon minimal d'un engrenage, extrémité
de courroie hors de la poulie qu'elle enroule. Placement et déplacement y répondent ensemble — une
barre n'est pas plus courte pour venir d'être dessinée.

> **La borne s'applique au point que le geste consomme, jamais au résultat.** Appliquée après coup,
> l'élément se pose là où le curseur n'est jamais passé. L'appel unique est donc à l'entrée, sur la
> position monde du curseur dans `MechanicalCanvas`, avant que quoi que ce soit ne la lise — le
> hit-testing comme les gestes qui prennent la souris brute (`ChangingGearRadius`, qui doit ignorer
> les nœuds épinglés sur la jante, sans quoi le rayon se verrouille sur sa propre valeur).

Second appel, et un seul : le magnétisme à la grille et `snap_load_hover` réécrivent la position
*après* le bornage, et la grille peut ramener loin — sur le centre même d'un engrenage en cours de
dimensionnement, quand ce centre tombe sur la grille. La borne est restaurée après eux, **uniquement
si le survol est `Void`** : un élément survolé garde sa position, c'est ce qui en fait une cible.

> Ce sont des **aides au survol, pas des invariants**. La tolérance de hit laisse passer un nœud
> jusqu'à `HIT_TOLERANCE.NODE` en deçà de la borne, et c'est assumé : refermer ce trou obligerait
> l'élément à ne pas rejoindre le nœud sur lequel il vient visiblement de s'aimanter.

### Le terminus commun placement / déplacement

Trois points où les deux chemins faisaient le même travail deux fois, ramenés à une fonction chacun :

- `own_part(elementID, kind, target)` (`connect-actions.ts`) construit le `selectedPart` de
  `connect_elements` — ce que l'élément posé ou déplacé offre à sa cible. Sept appelants. La règle
  `beamBodyHover → "body"` (« la barre est tirée au-delà de ce nœud, il finit sur son corps ») n'y
  est écrite qu'une fois au lieu de trois. `connect_elements` ne lit jamais `selectedPart.position` :
  seuls le type, l'id et la partie comptent.
- `attach_gear_to_belt` / `belt_wrap_direction` (`connect-actions.ts` / `belt-geom.ts`) décident du
  sens d'enroulement pour les sept sites — trois commits, quatre fantômes. Le calcul part **toujours
  du centre** de l'engrenage ; un point de jante répond à une autre question et bascule de côté selon
  d'où vient le curseur.
- `incoming_node_type` (`connection-rules.ts`) répond à « quel nœud ce geste pose-t-il ici », que ce
  soit un outil qui le dépose (`PLACED_NODE_TYPE`) ou un drag qui l'amène. Un seul `takeover_refusal`.

> **Le sens d'enroulement dépend du geste, pas seulement de la géométrie** : `BeltGearApproach`.
> `gear-onto-belt` — l'engrenage est pressé contre la section là où il se trouve, la courroie enroule
> sa face éloignée. `belt-onto-gear` — la courroie est tirée jusqu'au point de jante sous le curseur,
> sa face proche, et enroule dans l'autre sens. Le paramètre est explicite parce qu'il était
> auparavant un `!` posé sur trois des sept sites, juste par accident sur deux d'entre eux.

`is_on_left_side_of_belt` et `connect_gear_and_belt` ne sont plus exportées : ce sont les deux
primitives par lesquelles l'erreur rentrait.

### `get-hover.ts` — la table des cibles

Six `switch (state.type)` parallèles, un par famille de cible, remplacés par `HOVER_TARGETS` :
`Record<CanvasStateType, HoverTargets>`, où chaque état déclare **quelle sonde** appliquer à chacune
des six familles. Quatre sondes (`probe_node`, `probe_gear`, `probe_edge`, `probe_belt`) portent la
géométrie, une par famille au lieu d'une par couple (état, famille).

> **Le `Record` force chaque état à exister**, donc un nouvel état ne compile pas tant qu'il n'a pas
> de ligne. En revanche les champs de `HoverTargets` sont optionnels : l'exhaustivité porte sur les
> lignes, **pas sur les cellules**, et une famille omise reste un oubli silencieux. Ce qui change,
> c'est qu'une ligne courte se voit d'un coup d'œil à côté de ses voisines, là où l'oubli était
> auparavant réparti sur six `switch` distincts. Rendre les champs obligatoires — un `"none"`
> explicite plutôt qu'une absence — déplacerait l'oubli vers le compilateur.

Les géométries propres ne sont plus des `case` séparés mais des modes de sonde nommés
(`centre+past`, `rim-toward-ref`, `body-centre`, `runs-tangent`…). Deux d'entre elles se sont
révélées être la même chose vue de deux endroits : la tangence engrenage/courroie et la tangence
engrenage/engrenage partent toutes deux du **centre de l'engrenage en cours de dimensionnement**,
d'où `placed_gear_center`, une fonction pour les deux au lieu d'un `if (state.type === …)` recopié.

`doc/hover-matrix.md` est la forme lisible de la table, et explique chaque case vide.

> `src/components/canvas/get-hover.test.ts` fige le comportement : chaque état croisé avec chaque
> famille, aux points qui tombent sur chaque partie. Ce n'est **pas** une spécification — la matrice
> l'est — mais toute ligne qui bouge sans changement correspondant dans le document est une
> régression. Il a servi à faire le refactor et a attrapé la seule erreur commise en chemin.

### `src/utils/mechanism-fuzz.test.ts` — le fuzzing

Propriété : *tout état atteignable par une suite de gestes que l'interface autorise est un
état valide*.

Le générateur travaille à la **couche des commandes**, jamais des actions — générer des
`Action` au hasard ne teste rien, ça produit trivialement des états invalides. Quatre commandes :
`connect`, `deleteOne`, `deleteMany` appellent directement les opérations ; `place` **pilote les
outils**, en passant par `handle_placing_element` et `handle_placing_constraint`, les deux points
d'entrée que le canvas appelle au mouse-down. Le générateur porte donc un `CanvasState` d'une
commande à l'autre : un outil est multi-clics, une courroie en demande trois.

C'est ce qui donne la courroie, le ressort, l'amortisseur, le slider, la masse, l'ancrage, le
moteur, les charges et les contraintes **sans écrire un seul gadget à la main** — ils sont
construits par le code qui les construit en production.

> **L'oracle a deux moitiés, et n'en consulter qu'une fait accuser le code à tort.**
> `legality_for_state` refuse une cible que l'outil **peut voir** ; `HOVER_TARGETS` décide des
> familles qu'il **regarde**. Un générateur qui distribue toutes les parties à tous les outils
> explore des gestes que l'interface ne peut pas produire. `parts_of` filtre donc par la table de
> sondes de l'outil actif, mode par mode : `ends` n'offre pas de corps, `ends+beam-body` n'en offre
> un que sur une barre. Une troisième porte reste non modélisée, `clamp_to_bounds` — d'où la
> prudence à avoir devant un contre-exemple à géométrie dégénérée.

> **Le test est instable tant qu'un défaut subsiste** : fast-check tire une graine aléatoire à
> chaque exécution. Une exécution verte ne prouve rien — il faut le lancer plusieurs fois.

Quand une exception s'échappe d'une opération, le test rapporte la séquence **et** les cadres de
pile situés dans `src` : sans eux, un `Error: … not found` n'est pas rejouable.

### `src/utils/migrate-mechanism.ts` — la frontière d'entrée

`migrate_document(raw)` hisse un document au format que le code sait lire. Il refuse ce qui n'est
pas un document, et refuse un format **plus récent** que `CURRENT_FORMAT_VERSION` : un fichier venu
d'une version future doit échouer bruyamment plutôt qu'être lu de travers.

Il y a cinq notions de « version » dans le projet, et une seule concerne le format :
`__APP_VERSION__` (le logiciel), `DB_VERSION` (le schéma IndexedDB, géré par `idb`),
`formatVersion` (le fichier — celle-ci), et jusqu'ici `metadata.version`, un champ décoratif figé
à `1.0.0`, supprimé.

`formatVersion` vit **à la racine** de `SerializedMechanism`, pas dans `metadata` : `metadata` est
éditable par l'utilisateur, et on veut lire la version avant de faire confiance au reste du
document. C'est un **entier**, pas du semver : il n'y a pas de compatibilité mineure, soit on sait
migrer depuis N, soit on ne sait pas.

> **Il n'y a pas de v0.** Un document sans `formatVersion` est un v1 antérieur au champ. Les
> migrations ad-hoc qui existaient — `showTrajectory`, `SetShowTrajectory`, les probes au format
> placeholder — ont été supprimées ensemble : elles dataient de la même génération, en garder une
> aurait donné un v1 à géométrie variable.

`MigrationStep.preservesHistory` est **obligatoire, sans défaut**. Une migration sait presque
toujours convertir `history` et `future` aussi bien que l'état courant, et les effacer serait une
perte gratuite ; mais une action qui disparaît laisse un undo qui produit un état arbitraire. Le
champ force la décision au moment où le contexte est frais, comme `ELEMENT_REFS` force à déclarer
une référence. Le premier `preservesHistory: false` de la chaîne vide l'historique séance tenante :
les étapes suivantes n'ont plus rien à convertir dessus.

Deux portes d'entrée, les deux migrent : `load_mechanisms_from_file` (le `.slidep` seul comme
chaque entrée d'un zip) et `read_all_records` dans `App.tsx`, seule lecture de la bibliothèque.
Tout l'aval — chargement depuis la galerie, vignettes, export — reçoit donc un document à jour, et
`deserialize_mechanism` redevient ce qu'il devrait être : la reconstruction des objets, sans
conversion de format. `clone_mechanism` ne paie plus rien.

`storeImportedRecords` lit la base sans migrer : il n'en tire que les `createdAt` et les noms pour
détecter les collisions.

Le test vérifie ce qui ne se voit pas à l'œil : la chaîne reste contiguë et se termine sur
`CURRENT_FORMAT_VERSION`. Un trou dans la numérotation ne se manifesterait que chez un utilisateur
ayant justement un fichier de la génération sautée.

---

## 2. Défauts trouvés et corrigés

Tous trouvés par le fuzzing sauf indication contraire.

1. `connect_node_and_edge` dupliquait une liaison déjà présente → rendu idempotent.
2. `get_connection_pair_type` retournait le **premier** conteneur qui matche et s'arrêtait ; un
   élément lié par deux conteneurs n'était déconnecté que d'un seul → référence pendante.
   Renommé `get_connection_pair_types`, retourne tous les conteneurs. Deux appelants :
   `delete_element` et `ConnectionComponent.tsx` (qui avait le même bug).
3. `connect_two_edges` créait un second `join` sur deux extrémités déjà jointes, orphelinant le
   premier → rendu idempotent via `node_at_edge_part`.
4. Déplacer l'extrémité d'un edge d'un nœud vers un autre n'émettait aucun détachement de
   l'ancien → `detach_edge_end`. Ne vide que `rotatingEdgesIDs`/`fixedEdgesIDs`, **jamais**
   `parentBeamID` : un slider peut continuer de coulisser sur l'edge.
5. Takeover d'un nœud sur un axe porteur d'engrenages : `transfer_internal_connections` ne
   transfère `fixedGearsIDs` que si la destination en a un, donc un `join` faisait disparaître
   le pivot en laissant les gears avec un `parentAxleID` mort. **Interdit par une règle**
   (`takeover_refusal`), généralisée aux outils de placement via `PLACED_NODE_TYPE`.
6. `transfer_internal_connections` empilait les liaisons du nœud absorbé sans vérifier que la
   destination ne les avait pas déjà (les deux extrémités d'une même barre) → filtre
   `not_already_on_dest`.
7. **Les charges survivaient à leur hôte.** `delete_element` cascadait vers les contraintes et pas
   vers les charges : supprimer un nœud laissait sa force avec un `targetID` mort. Champ `required`,
   donc classe crash. La cascade couvre les trois types de charge ; une charge simplement *cadrée*
   sur l'arête supprimée retombe sur `"world"` plutôt que d'être détruite.
8. **`handle_place_element` composait ses étapes contre le même état de départ.** Deux
   `connect_elements` enchaînés : le premier pouvait absorber un nœud et le supprimer, le second
   nommait alors un élément absent — la seule exception qui s'échappait vraiment jusqu'ici.
   `start_simulation` fait avancer un état simulé entre les étapes, ce que `delete_elements` faisait
   déjà de son côté ; les deux passent maintenant par la même abstraction. **Une correction, trois
   défauts.**
9. Trois **règles de légalité manquantes**, toutes de la même forme — la règle existait pour un cas
   et n'avait pas été généralisée : les deux extrémités au même endroit (le ressort et l'amortisseur
   n'étaient pas couverts, la barre l'était) ; une courroie sans poulie qui se referme ; une
   contrainte reliant un élément à lui-même (seuls les engrenages étaient couverts).

> **La fermeture de boucle d'une courroie n'est pas décidée par la légalité.** C'est un cas
> particulier de `get_hovered_part`, hors de la boucle sur les éléments : la cible est le terminal de
> la courroie — fantôme `"----"` au placement, extrémité opposée au déplacement — et jamais un
> élément dont on puisse interroger les règles. `belt_can_close` est énoncée dans
> `connection-rules.ts` et lue aux **trois** sites de fermeture, qui avaient tous le même trou. Le
> premier essai, écrit comme une règle sur l'élément candidat, ratait sa cible : un refus transparent
> disait « regarde derrière », et derrière l'élément de départ se trouvait précisément le fantôme.

Hors fuzzing, signalés à la main :

- Une masse héritait de l'ancrage par takeover, et **rien ne le signalait** : la règle existait
  dans l'interaction mais pas comme invariant. Ajout de `GROUNDED_MASS` au valideur + pas
  d'héritage vers une masse dans `connect_elements`.
- `handle_place_ground` n'avait aucun cas `GearTooth` — le clic était silencieusement ignoré.
  Ajouté (crée un join ancré et le connecte, comme sur un edge).

### Défauts ouverts, confirmés par la sonde profonde

Quatre défauts, décrits et reproductibles à la main dans **`doc/defauts-connus.md`** :
`DUPLICATE_IN_LIST` (fusion de deux nœuds portés par la même barre), `MISSING_BIDIRECTIONAL`
(barre survivante oubliée par son pivot après fusion puis suppression), `SAME_AXLE_MESH` (règle de
légalité manquante au dimensionnement d'un engrenage) et `MISSING_BIDIRECTIONAL` sur le corps d'un
ressort traîné sur un nœud.

Aucun des quatre ne fait planter l'app : ils produisent une physique fausse, pas une exception. Ils
sortent donc du périmètre de la réparation, à raison. Les trois premiers passent par une fusion de
nœuds ; le quatrième est une règle manquante, et le plus simple à corriger.

Cinq contre-exemples sont commités en `it.fails` dans `mechanism-fuzz.test.ts` — des enregistrements
exécutables, pas de la prose. Chacun **reproduit encore** son défaut ; le jour où l'un devient vert,
c'est que l'opération est corrigée et qu'il faut le repasser en `it`.

> **Un `it.fails` documente un défaut, il n'empêche pas la propriété de le retrouver.** Le budget
> commité (300 séquences, 6 commandes) n'atteignait quasiment jamais les défauts historiques, d'où
> la fausse assurance d'avant. Depuis que le générateur pilote les outils, il en atteint — donc le
> test principal est rouge par intermittence, et c'est le signal juste. Le rendre vert demanderait
> soit de baisser le budget, soit de filtrer les signatures connues : la première rétablit la fausse
> assurance, la seconde masquerait les nouvelles occurrences.

Le budget est paramétrable : `FUZZ_RUNS=8000 FUZZ_COMMANDS=14 npx vitest run
src/utils/mechanism-fuzz.test.ts` rejoue la sonde.

---

## 3. La réparation

### `src/utils/repair-mechanism.ts`

`repair_mechanism(mechanism)` rend le mécanisme dont **toute référence résout et pointe vers le type
attendu**, plus la liste de ce que ça a coûté. C'est exactement l'invariant dont les getters stricts
ont besoin, et rien de plus : un `throw` de getter redevient la signature d'un vrai bug.

> **Le périmètre est volontairement étroit** : `MISSING_REFERENCE` et `WRONG_TYPE`, les deux seules
> erreurs qui font *planter*. Pas `MISSING_BIDIRECTIONAL` — la réparer, c'est trancher qui a raison
> entre les deux côtés, et si on ajoute la référence manquante il faut deviner *dans quelle liste*
> (`rotatingEdgesIDs` ou `fixedEdgesIDs` ? la liaison n'est pas la même). Deviner faux fabriquerait
> une liaison mécanique que l'utilisateur n'a pas dessinée. Pas `DUPLICATE_ID` non plus : deux
> éléments réels, en supprimer un perd du travail. Ni les règles de domaine (`GROUNDED_MASS`,
> `CONTRADICTORY_MOTOR`, `SAME_AXLE_MESH`). Tout ça reste du ressort du valideur, qui signale.

La politique est pilotée par `ELEMENT_REFS` : ID mort dans un tableau → retiré ; champ optionnel →
vidé ; champ `required` mort **ou absent** → l'élément ne survit pas. La boucle tourne jusqu'au
point fixe, puisque supprimer un élément échoue les références de ceux qui le nommaient ; seule une
suppression peut en créer de nouvelles, donc la boucle s'arrête dès qu'un tour n'en fait aucune.

Un mécanisme sain ressort **identique en identité** (`===`), pour que les appelants mémoïsent
dessus.

`RefSpec` est devenue une union : soit `{ target, required }`, soit `{ target, required, extract,
prune }`. Les deux fonctions sont indissociables par typage — une référence que la table sait lire
est toujours une référence qu'elle sait réparer. Les trois champs concernés ne sont pas de simples
filtres :

- **`pivot.motor`** — vider `parentBeamID` laisserait un moteur ni ancré ni porté par une barre,
  invalide en soi. Le pruner supprime **le moteur entier**. Ancrer le pivot à la place aurait
  inventé une contrainte cinématique que l'utilisateur n'a pas posée, et changé le mouvement en
  silence.
- **`belt.attachedGearsIDs`** — le piège des indices parallèles se désamorce seul :
  `disconnectedGearIndices` et `gearWraps` sont des caches de simulation. Le pruner retire l'entrée
  morte et **jette les deux**, que la simulation recalculera.
- **`load.frame`** — la variante `edge` dont l'`edgeID` est mort retombe sur `"world"`.

> **`history` et `future` sont vidés dès qu'on répare quoi que ce soit.** Une règle plus fine
> (« seulement si un élément a été supprimé ») ne tient pas : les entrées `CreateElement` /
> `DeleteElement` portent des éléments complets, qui peuvent eux-mêmes contenir des références
> mortes. La tenir imposerait de réparer aussi les snapshots de l'historique — toute la politique
> une seconde fois, avec des règles différentes puisqu'on ne peut pas y supprimer d'élément. Le gain
> ne paie ni le coût ni le risque.

### Le canvas ne meurt plus d'un mécanisme cassé

Un `throw` pendant le rendu tuait l'application entière, et pas comme on l'imaginait :
`requestAnimationFrame(loop)` est planifié **après** `render()`, donc une frame qui lève arrête la
boucle **définitivement**. Comme `render` efface avant de dessiner, il ne restait que la grille, et
ni pan ni zoom ne réveillaient quoi que ce soit.

Deux couches, toutes deux des filets — jamais un correctif :

- `render()` est sous `try/catch` et la frame suivante est planifiée quoi qu'il arrive. Le log est
  dédupliqué par message : la boucle réessaie soixante fois par seconde.
- `undrawable_elements` écarte, **via `element_refs`**, les éléments dont une référence ne résout
  pas — exactement ceux dont le dessin appellerait un getter strict. Sans cette couche, la boucle
  survivrait mais tout ce qui suit le fautif dans `DRAWING_ORDER` resterait invisible à chaque frame.

### `src/utils/load-mechanism.ts` — la composition

`load_mechanism(raw)` = `migrate_document` → `deserialize_mechanism` → `repair_mechanism`. Les
quatre entrées y passent : chargement depuis la galerie, import d'un fichier, écriture en base à
l'import, et **les vignettes** — c'est là qu'était le crash au reload, et une vignette répare en
silence parce qu'une carte n'est pas un endroit pour signaler des dégâts.

> **On répare à l'entrée, jamais à la sortie.** Réparer à la sauvegarde blanchirait le bug que
> `assert_actions_preserve_validity` est là pour attraper : le fichier ressortirait propre et le
> défaut resterait dans le code. La version réparée est quand même persistée, mais par ricochet —
> l'autosave écrit ce qu'il y a en mémoire. L'import est un cas mixte : c'est une entrée qui écrit,
> donc c'est la version réparée qui entre en bibliothèque.

La réparation ne lit **pas** la version, et ne le pourra jamais : une référence pendante n'est pas
un problème de dialecte mais de contenu, et les six défauts ci-dessus ont produit des fichiers
parfaitement conformes à leur version. La conditionner reviendrait à sauter précisément les fichiers
écrits par le prochain bug. Elle tourne d'ailleurs *après* la chaîne, parce qu'une migration future
peut elle-même orpheliner des références.

### Reste ouvert

- **L'auto-référence** (`SELF_REFERENCE`) n'est pas réparée. Un gear engrené avec lui-même passe le
  contrôle de type ; il est signalé, pas retiré.
- **Un seuil de dégâts** justifierait peut-être autre chose qu'un message — ouvrir en lecture seule
  au-delà d'une certaine casse. Non tranché, à voir sur des cas réels.

---

## 4. L'élargissement du fuzzer : l'étape A est faite

### Ce qui a été fait, et pourquoi pas comme prévu

Le plan prévoyait d'ajouter sept gadgets écrits à la main et quatre commandes. C'est une commande
unique qui a été écrite, `place`, qui **pilote les outils** — voir le §1. Elle couvre tout ce que
les sept gadgets visaient, plus les contraintes, qui n'étaient même pas dans la liste.

La raison est celle que le plan donnait lui-même contre les gadgets : « un gadget faux ferait
accuser le code testé d'un bug du générateur ». Faire construire une courroie par l'outil courroie
supprime la question au lieu de la gérer.

Le prix, assumé : le générateur porte désormais un état (l'outil actif et son avancement). C'est la
première brique de B, pas de A.

### Ce que ça a rapporté

Cinq défauts, tous hors de portée de l'ancien budget : la cascade des charges, la composition des
étapes de placement (une correction, trois défauts, dont la seule exception qui s'échappait) et
trois règles de légalité manquantes. Détail au §2.

### Ce que A n'atteint toujours pas

- **`BeltBody`** — une section de courroie a besoin d'un indice que `parts_of` ne sait pas produire.
  Tout ce qui passe par une section reste hors d'atteinte.
- **L'undo/redo**, le panneau latéral (donc le défaut du moteur), et le redimensionnement d'un
  engrenage hors du couplage actuel.
- **Le mouvement de souris** — l'écart en tête de `defauts-connus.md` est intact. On reste à A.

### B — piloter la machine à états

Émettre des gestes bruts (presser, bouger, relâcher) à travers `canvas-state-reducer`. C'est ce qui
refermerait l'écart de modèle, atteindrait l'undo/redo, et jugerait `HOVER_TARGETS` au lieu de s'en
servir comme oracle.

Pièges à garder en tête :

- **L'oracle a trois portes, pas une.** `legality_for_state`, `HOVER_TARGETS`, et `clamp_to_bounds`
  que le générateur ne modélise toujours pas. Une commande qui n'en consulte qu'une explore des
  gestes que l'interface ne produit pas — c'est arrivé, et ça a failli faire corriger un défaut
  inexistant.
- **`drag_state` doit répondre pour toute nouvelle partie**, sinon le geste est évalué sous
  `Selecting` et la précondition ne veut plus rien dire.
- **Ajouter une règle rétrécit l'espace exploré.** C'est ce qui avait fait croire deux défauts
  disparus. Après chaque correction, relancer la sonde profonde et vérifier qu'un `it.fails` vire au
  vert *parce que l'opération est corrigée ou le geste refusé*, pas parce qu'il est devenu
  inatteignable par accident.
- **Les `it.fails` doivent continuer de reproduire** leur défaut pendant l'élargissement. Un qui
  devient vert sans correction correspondante signale que le générateur a dérivé.

---

## 5. Reste ouvert

**Décidé de ne pas faire** — la garde dans `connect_elements`. Ses deux appelants
(`canvas-state-reducer`, `placing-element-actions`) obtiennent leur `hoveredPart` de
`get_hovered_part`, donc les règles s'appliquent déjà : la garde serait redondante sur 100 % des
appels. Et elle exigerait de **déduire** un `CanvasState` depuis `selectedPart` ; une déduction
fausse produirait un refus silencieux — un geste qui cesse de marcher sans message, mode de
défaillance pire que ce qu'on prévient. Les chemins qui contournent vraiment le hover
(chargement, undo) ne passent pas par `connect_elements`.

**À faire**

- **Corriger les quatre défauts ouverts** (`doc/defauts-connus.md`), chacun devant faire virer son
  `it.fails` au vert. Le quatrième (nœud sur le corps d'un ressort) est une règle manquante,
  exprimable telle quelle : c'est le moins cher des quatre.
- **Test d'accord des règles.** La légalité se définit par « ce geste n'introduit aucune erreur
  de validation nouvelle » — c'est le diff de `assert-mechanism`. Trop coûteux pour tourner dans
  le hover (une validation complète par candidat et par mouvement de souris), d'où des prédicats
  rapides. Il faut un test qui vérifie que les deux concordent, sinon les prédicats dérivent en
  silence. **Trois des corrections de cette session étaient des règles manquantes ou non
  généralisées** — c'est exactement ce que ce test attraperait d'un coup.
- **La matrice de survol ne couvre pas la fermeture de boucle d'une courroie.** Le test de
  caractérisation n'a pas bougé quand `belt_can_close` a été ajoutée : c'est un angle mort, pas une
  preuve. Plus généralement, `HOVER_TARGETS` est figé par ce test sans être jugé ; le fuzzing des
  gestes de survol (B) le jugerait.
- **`dimension-edge` vise toujours la courroie** dans `ELEMENT_REFS`, alors que la matrice dit
  qu'une courroie se cote en entier via `DimensionBelt` et jamais autrement. Même incohérence que
  celle corrigée sur les alignements, non tranchée : la resserrer supprimerait au chargement les
  cotations existantes de ce type.
- **Exécution profonde périodique en CI** : le budget est paramétrable, reste à la programmer.
  Plus utile qu'avant, maintenant que la sonde atteint des défauts en quelques centaines d'essais.
- **Error boundary autour de la galerie.** Le canvas est traité (voir §1) ; la galerie ne l'est pas.
- **Le canvas écarte en silence.** Un élément non dessinable disparaît sans que rien ne le dise :
  on a troqué un canvas vide contre un mécanisme discrètement incomplet. Un bandeau « N éléments non
  affichés » serait plus franc. C'est la question du seuil de dégâts, non tranchée.
- **Interface dédiée au moteur** dans le panneau latéral (retirer l'ancrage d'un pivot moteur
  produit un état incohérent — déjà dans le TODO de l'auteur).

---

## 6. Décisions actées

Pour ne pas les rejouer :

- **Les getters restent stricts.** Les faire retourner `undefined` transformerait un crash en
  géométrie silencieusement fausse — pire pour l'UX. On garantit l'invariant à la frontière au
  lieu de masquer le symptôme.
- **Ne pas scinder `attachedGearsIDs`** (`{id, direction}[]`) en tableaux parallèles : ça
  créerait un invariant de synchronisation pire que l'exception de forme, d'autant que
  `disconnectedGearIndices` et `gearWraps` indexent déjà dedans. La table le gère par un
  extracteur.
- **Détection des champs de référence par type, pas par nom.**
- **Les règles prennent `CanvasState` en paramètre.** Ce n'est pas un type de vue :
  `CanvasState` vit dans `src/types/`, aux côtés de `element.ts`.
- **Ne pas expliquer « déjà connectés »** — c'est une évidence, l'expliquer serait du bruit. En
  revanche, retour visuel quand une superposition masquerait un élément sans le connecter :
  repoussoir + `not-allowed`.
- **Les préconditions du générateur copient ce que l'UI expose réellement**, pas ce que le
  domaine juge sensé. L'écart entre les deux est la définition du bug.
- **Le fuzzer s'élargit au même étage avant de piloter la machine à états** (§4), en assumant que
  la première étape est un palier et non la destination.
- **Le générateur fait construire, il ne fabrique pas.** Un élément composite est produit par
  l'outil qui le produit en production, jamais écrit à la main : un gadget faux ferait accuser le
  code testé.
- **L'oracle du générateur a plusieurs portes**, et n'en consulter qu'une est une dérive, pas une
  approximation. Deux sont modélisées (`legality_for_state`, `HOVER_TARGETS`), une ne l'est pas
  (`clamp_to_bounds`) et c'est écrit là plutôt que découvert deux fois.
- **Une opération qui émet plusieurs bundles fait avancer un état simulé entre eux.** Composer deux
  `connect_elements` contre le même état de départ est un défaut, pas un raccourci — le premier peut
  supprimer ce que le second nomme. `start_simulation` est le seul chemin.
- **Un test rouge qui dit vrai vaut mieux qu'un test vert qui rassure.** On ne baisse pas le budget
  du fuzzer et on ne filtre pas les signatures connues pour retrouver du vert.
- **Le canvas se protège par omission**, jamais en prétendant que tout va bien : la boucle de rendu
  survit, l'élément incohérent n'est pas dessiné, et le défaut reste à corriger ailleurs.
- **Une courroie ne prend pas de contrainte d'alignement** — `ALIGNABLE_EDGE_TYPES` et la matrice
  de survol le disent tous les deux, `get-hover` faisant foi.
- **Le format est un entier à la racine du document**, l'absence du champ vaut 1, et il n'y a pas
  de v0 : le code d'aujourd'hui est la version première.
- **Chaque migration déclare le sort de l'historique**, sans valeur par défaut.
- **On répare à l'entrée, jamais à la sortie**, et la réparation ne consulte pas la version.
- **La réparation ne garantit que les références**, pas la validité complète. Promettre « cohérent
  par construction » aurait obligé à deviner à la place de l'utilisateur.
- **`extract` et `prune` sont indissociables**, tenus ensemble par le type.
- **Une borne s'applique au point que le geste consomme**, à l'entrée, et se restaure après tout
  magnétisme qui la défait. Jamais sur le résultat.
- **Les bornes géométriques sont des aides au survol, pas des invariants.** On accepte qu'un
  aimantage passe légèrement dessous plutôt que de laisser un élément ne pas rejoindre sa cible.
- **Ce qu'un outil peut viser se déclare, ne se déduit pas.** La table est exhaustive par le type ;
  un refactor de survol se fait sous test de caractérisation, jamais à l'œil.
- **La fermeture de boucle d'une courroie n'est pas tranchée.** Deux encodages coexistent : l'ID
  sentinelle `"----"` au placement, l'ID réel avec la partie opposée au déplacement. Élément pour
  décider : `connect_elements` teste déjà `hoveredPart.id === selectedPart.id` juste à côté du
  sentinelle, et les deux mènent au même code — le sentinelle est donc probablement supprimable sans
  rien réécrire d'autre.
- **La migration est séparée de la désérialisation.** `deserialize_mechanism` ne convertit plus
  aucun format ; ce qui doit tolérer la variété (`loads ?? []`, le garde-fou sur `overlays`, la
  restauration des champs de connexion que `JSON.stringify` efface) y reste, parce que ce n'est pas
  de la migration mais de la tolérance permanente.
